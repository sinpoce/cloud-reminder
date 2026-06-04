import type { AutomationResult } from "../../types";
import type { AutomationModule, ModuleContext } from "../module";

async function runCheck(ctx: ModuleContext): Promise<AutomationResult> {
  const url = String(ctx.config.url ?? "").trim();
  if (!url) return { status: "failed", summary: "未配置 URL", items: [] };
  const expect = Number(ctx.config.expect_status) || 0;
  const keyword = String(ctx.config.keyword ?? "").trim();
  const timeout = Number(ctx.config.timeout_ms) || 10_000;

  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "cloud-reminder-healthcheck/1.0" },
      signal: AbortSignal.timeout(timeout),
    });
    const ms = Date.now() - t0;
    const statusOk = expect ? res.status === expect : res.status >= 200 && res.status < 400;
    let kwOk = true;
    if (keyword) {
      const body = await res.text().catch(() => "");
      kwOk = body.includes(keyword);
    }
    const ok = statusOk && kwOk;
    const detail = `HTTP ${res.status} · ${ms}ms` + (keyword ? ` · 关键字${kwOk ? "命中" : "未命中"}` : "");
    ctx.log(`GET ${url} → ${detail}`);
    return {
      status: ok ? "success" : "failed",
      summary: ok ? `服务正常（${detail}）` : `服务异常（${detail}）`,
      items: [{ item: url, action: ok ? "ok" : "failed", detail }],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "网络错误";
    return { status: "failed", summary: `请求失败：${msg}`, items: [{ item: url, action: "failed", detail: msg }] };
  }
}

// A second built-in module — proves the framework isn't tied to DigitalPlat.
// Periodically requests a URL and reports/alerts when it's unhealthy.
const httpCheckModule: AutomationModule = {
  key: "http_check",
  label: "HTTP 健康检查",
  description: "定时请求一个 URL，状态码异常、超时或关键字缺失时判定为异常（可推送告警）。",
  icon: "activity",
  fields: [
    { key: "url", label: "URL", required: true, placeholder: "https://example.com/health" },
    { key: "expect_status", label: "期望状态码", type: "number", placeholder: "默认 2xx/3xx 即正常" },
    { key: "keyword", label: "响应需包含关键字（可选）", placeholder: "ok" },
    { key: "timeout_ms", label: "超时（毫秒）", type: "number", placeholder: "10000" },
  ],
  run: runCheck,
  test: async (ctx) => {
    const r = await runCheck(ctx);
    return { ok: r.status === "success", detail: r.summary };
  },
};

export default httpCheckModule;
