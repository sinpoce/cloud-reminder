import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSWASMModule,
  type VmCallResult,
} from "quickjs-emscripten-core";
import baseVariant from "@jitl/quickjs-wasmfile-release-sync";
// Vendored from @jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm
// (see scripts/vendor-wasm). Imported locally so wrangler compiles it at build.
import wasmModule from "./quickjs.wasm";
import type { AutomationResult } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Custom (in-UI) automation modules run as JavaScript inside a QuickJS engine
// compiled to WebAssembly. Workers forbid eval / runtime WASM compilation, but
// the QuickJS WASM module is imported & compiled at build time, and it
// *interprets* the user's JS string internally — which is allowed and sandboxed.
//
// The sandbox can ONLY touch the host through the small API we inject:
//   config            – the instance's configured key/values (object)
//   console.log(...)  – appends to the run log
//   await fetchText(url, opts)  /  await fetchJson(url, opts)  /  await httpRequest(...)
// The script `return`s its result ({ status, summary, items } or a string).
// ─────────────────────────────────────────────────────────────────────────────

const MEMORY_LIMIT = 64 * 1024 * 1024; // 64 MB
const RUN_TIMEOUT_MS = 15_000;
const FETCH_TIMEOUT_MS = 20_000;

let modulePromise: Promise<QuickJSWASMModule> | null = null;
function getQuickJS(): Promise<QuickJSWASMModule> {
  if (!modulePromise) {
    modulePromise = newQuickJSWASMModuleFromVariant(newVariant(baseVariant, { wasmModule }));
  }
  return modulePromise;
}

// Convenience helpers exposed inside the sandbox (wrap the raw __http host fn).
const PRELUDE = `
globalThis.console = {
  log: (...a) => __log(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")),
  error: (...a) => __log("[error] " + a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")),
  warn: (...a) => __log("[warn] " + a.map(String).join(" ")),
};
globalThis.httpRequest = async (url, opts) => JSON.parse(await __http(url, JSON.stringify(opts || {})));
globalThis.fetchText = async (url, opts) => {
  const r = await httpRequest(url, opts);
  if (!r.ok) throw new Error("HTTP " + r.status + " for " + url + (r.body ? " — " + String(r.body).slice(0, 200) : ""));
  return r.body;
};
globalThis.fetchJson = async (url, opts) => JSON.parse(await fetchText(url, opts));
globalThis.sleep = (ms) => new Promise((r) => __sleep(Math.min(Number(ms) || 0, 5000)).then(r));
`;

function normalize(value: unknown): AutomationResult {
  if (typeof value === "string") return { status: "success", summary: value, items: [] };
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const status =
      v.status === "failed" || v.status === "partial" || v.status === "success"
        ? (v.status as AutomationResult["status"])
        : "success";
    const items = Array.isArray(v.items)
      ? (v.items as Record<string, unknown>[]).map((it) => ({
          item: String(it.item ?? ""),
          action: (it.action === "failed" || it.action === "skipped" ? it.action : "ok") as
            | "ok"
            | "skipped"
            | "failed",
          detail: String(it.detail ?? ""),
        }))
      : [];
    return { status, summary: String(v.summary ?? "完成"), items };
  }
  return { status: "success", summary: "完成", items: [] };
}

export async function runUserCode(
  code: string,
  config: Record<string, unknown>,
  onLog: (msg: string) => void,
): Promise<AutomationResult> {
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT);
  runtime.setMaxStackSize(512 * 1024);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + RUN_TIMEOUT_MS));

  const vm: QuickJSContext = runtime.newContext();
  const evalOrThrow = (src: string) => vm.unwrapResult(vm.evalCode(src));

  try {
    // __log
    vm.newFunction("__log", (h) => {
      try {
        onLog(vm.getString(h));
      } catch {
        /* ignore */
      }
    }).consume((f) => vm.setProp(vm.global, "__log", f));

    // __sleep(ms) → resolves after ms (host timer), pumps jobs
    vm.newFunction("__sleep", (msH) => {
      const ms = vm.getNumber(msH);
      const d = vm.newPromise();
      setTimeout(() => {
        vm.newString("").consume((s) => d.resolve(s));
      }, ms);
      d.settled.then(() => runtime.executePendingJobs());
      return d.handle;
    }).consume((f) => vm.setProp(vm.global, "__sleep", f));

    // __http(url, optsJson) → JSON string { status, ok, body }
    vm.newFunction("__http", (urlH, optsH) => {
      const url = vm.getString(urlH);
      let opts: { method?: string; headers?: Record<string, string>; body?: string } = {};
      try {
        opts = JSON.parse(vm.getString(optsH));
      } catch {
        /* default GET */
      }
      const d = vm.newPromise();
      (async () => {
        try {
          const res = await fetch(url, {
            method: opts.method || "GET",
            headers: { "User-Agent": "cloud-reminder-module/1.0", ...(opts.headers || {}) },
            body: opts.body,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          const body = await res.text();
          const out = JSON.stringify({ status: res.status, ok: res.ok, body });
          vm.newString(out).consume((s) => d.resolve(s));
        } catch (e) {
          vm.newString(e instanceof Error ? e.message : "fetch error").consume((s) => d.reject(s));
        }
      })();
      d.settled.then(() => runtime.executePendingJobs());
      return d.handle;
    }).consume((f) => vm.setProp(vm.global, "__http", f));

    // Inject config (as a plain object) + prelude.
    evalOrThrow(`globalThis.config = JSON.parse(${JSON.stringify(JSON.stringify(config ?? {}))})`).dispose();
    evalOrThrow(PRELUDE).dispose();

    // Run the user's code as an async function body, then pump the VM's job
    // queue until its promise settles. Async host fns (fetch/sleep) re-pump on
    // resolution; the interrupt handler caps CPU; the deadline is a backstop.
    const wrapped = `(async () => {\n"use strict";\n${code}\n})()`;
    const promiseHandle = evalOrThrow(wrapped);

    let resolved: VmCallResult<QuickJSHandle> | undefined;
    let failure: unknown;
    let finished = false;
    vm.resolvePromise(promiseHandle).then(
      (r) => {
        resolved = r;
        finished = true;
      },
      (e) => {
        failure = e;
        finished = true;
      },
    );

    const deadline = Date.now() + RUN_TIMEOUT_MS;
    while (!finished) {
      runtime.executePendingJobs();
      await Promise.resolve();
      if (finished) break;
      if (Date.now() > deadline) {
        failure = new Error(`执行超时（${RUN_TIMEOUT_MS / 1000}s）`);
        break;
      }
      await new Promise((r) => setTimeout(r, 2));
    }
    promiseHandle.dispose();
    if (failure) throw failure;

    const valueHandle = vm.unwrapResult(resolved as VmCallResult<QuickJSHandle>);
    const value = vm.dump(valueHandle);
    valueHandle.dispose();
    return normalize(value);
  } catch (e) {
    return { status: "failed", summary: e instanceof Error ? e.message : "运行出错", items: [] };
  } finally {
    // Interrupted/timed-out scripts can leave the engine in a state where
    // disposal aborts the WASM instance. Swallow that, and drop the cached
    // module so the next run rebuilds a clean engine.
    let aborted = false;
    try {
      vm.dispose();
    } catch {
      aborted = true;
    }
    try {
      runtime.dispose();
    } catch {
      aborted = true;
    }
    if (aborted) modulePromise = null;
  }
}
