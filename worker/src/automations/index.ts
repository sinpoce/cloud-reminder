import type { Automation, AutomationResult } from "../types";
import type { ModuleContext, InspectResult } from "./module";
import { getModule, moduleCatalog } from "./registry";
import { runUserCode } from "./custom-runtime";

export { moduleCatalog, getModule };

// Run a custom (user-authored) module in the QuickJS sandbox.
async function runCustom(a: Automation): Promise<AutomationResult> {
  const logs: string[] = [];
  const result = await runUserCode(a.code ?? "", a.config ?? {}, (m) => logs.push(m));
  return logs.length ? { ...result, log: [result.log, logs.join("\n")].filter(Boolean).join("\n") } : result;
}

// Run an automation by dispatching to its module (builtin) or sandbox (custom).
export async function runAutomation(a: Automation): Promise<AutomationResult> {
  if (a.kind === "custom") return runCustom(a);
  const m = getModule(a.type);
  if (!m) return { status: "failed", summary: `未知模块：${a.type}`, items: [] };
  const logs: string[] = [];
  const ctx: ModuleContext = { config: a.config, log: (msg) => logs.push(String(msg)) };
  try {
    const result = await m.run(ctx);
    return logs.length ? { ...result, log: logs.join("\n") } : result;
  } catch (e) {
    return {
      status: "failed",
      summary: e instanceof Error ? e.message : "运行出错",
      items: [],
      log: logs.length ? logs.join("\n") : undefined,
    };
  }
}

// Optional connectivity/credential test for a module (or a dry run for custom).
export async function testModule(a: Automation): Promise<{ ok: boolean; detail: string }> {
  if (a.kind === "custom") {
    const r = await runCustom(a);
    return { ok: r.status !== "failed", detail: r.summary };
  }
  const m = getModule(a.type);
  if (!m) return { ok: false, detail: `未知模块：${a.type}` };
  if (!m.test) return { ok: false, detail: "该模块不支持连接测试" };
  try {
    return await m.test({ config: a.config, log: () => {} });
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "测试失败" };
  }
}

// Inspect a module's manageable items (e.g. domains) for the dashboard panel.
export async function inspectModule(
  type: string,
  config: Record<string, unknown>,
): Promise<InspectResult> {
  const m = getModule(type);
  if (!m?.inspect) return { ok: false, detail: "该模块不支持列表", items: [] };
  try {
    return await m.inspect({ config, log: () => {} });
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "加载失败", items: [] };
  }
}

// Run a per-item action (e.g. renew one domain).
export async function actModule(
  type: string,
  config: Record<string, unknown>,
  action: string,
  item: string,
): Promise<{ ok: boolean; detail: string }> {
  const m = getModule(type);
  if (!m?.act) return { ok: false, detail: "该模块不支持此操作" };
  try {
    return await m.act({ config, log: () => {} }, action, item);
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "操作失败" };
  }
}
