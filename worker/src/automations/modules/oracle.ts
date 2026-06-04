import type { AutomationItemResult, AutomationResult } from "../../types";
import type { AutomationModule } from "../module";

// Oracle Cloud (甲骨文) tenancy liveness check — core logic only (name-only).
//
// Probes https://myservices-{tenancy}.console.oraclecloud.com/mycloud/cloudportal/gettingStarted
// with a HEAD request (same as the check_oracle_bot approach):
//   200 / 302 → 正常存活 (live)
//   503       → 已封禁 / 死亡 (dead)
//   其它 / 连不上 → 租户不存在 (void)
interface OracleConfig {
  tenancies?: string | string[];
}

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  return String(v ?? "")
    .split(/[\s,，]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type State = "live" | "dead" | "void";

async function checkTenant(tenancy: string): Promise<State> {
  const url = `https://myservices-${encodeURIComponent(
    tenancy.trim().toLowerCase(),
  )}.console.oraclecloud.com/mycloud/cloudportal/gettingStarted`;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(10000) });
    await res.body?.cancel().catch(() => undefined);
    const s = res.status;
    if (s === 200 || s === 302) return "live";
    if (s === 503) return "dead";
    return "void";
  } catch {
    return "void";
  }
}

async function run(cfg: OracleConfig): Promise<AutomationResult> {
  const names = toList(cfg.tenancies);
  if (names.length === 0) return { status: "failed", summary: "未填写任何租户名", items: [] };

  const states = await Promise.all(names.map((n) => checkTenant(n)));
  const items: AutomationItemResult[] = [];
  const live: string[] = [];
  const dead: string[] = [];
  const gone: string[] = [];
  names.forEach((name, i) => {
    const st = states[i];
    if (st === "live") {
      live.push(name);
      items.push({ item: name, action: "ok", detail: "正常存活" });
    } else if (st === "dead") {
      dead.push(name);
      items.push({ item: name, action: "failed", detail: "已封禁 / 死亡（503）" });
    } else {
      gone.push(name);
      items.push({ item: name, action: "failed", detail: "租户不存在" });
    }
  });

  const abnormal = dead.length + gone.length;
  const status: AutomationResult["status"] = abnormal === 0 ? "success" : live.length > 0 ? "partial" : "failed";
  let summary = `🟢 正常 ${live.length} · 💀 异常 ${abnormal}`;
  if (dead.length) summary += ` · 封禁 ${dead.length}（${dead.slice(0, 10).join("、")}${dead.length > 10 ? "…" : ""}）`;
  if (gone.length) summary += ` · 不存在 ${gone.length}（${gone.slice(0, 10).join("、")}${gone.length > 10 ? "…" : ""}）`;
  if (abnormal === 0) summary += " · 全部存活 🎉";

  const configPatch = {
    _alive: live.length,
    _dead: dead.length,
    _void: gone.length,
    _total: names.length,
    _checked_at: Date.now(),
  };
  return { status, summary, items, configPatch };
}

const oracleModule: AutomationModule = {
  key: "oracle_alive",
  label: "甲骨文账号测活",
  description: "定期检测多个 Oracle Cloud（甲骨文）租户是否存活/被封，汇总正常 / 封禁 / 不存在数量并推送提醒（只需租户名）。",
  icon: "globe",
  fields: [
    {
      key: "tenancies",
      label: "租户名（空格 / 换行 / 逗号分隔多个）",
      required: true,
      type: "textarea",
      placeholder: "tenant-a\ntenant-b\ntenant-c",
      hint: "甲骨文「云账户名 / Tenancy」，可填多个；只需名字，无需密码",
    },
  ],
  run: (ctx) => run(ctx.config as unknown as OracleConfig),
  test: async (ctx) => {
    const names = toList((ctx.config as OracleConfig).tenancies);
    if (names.length === 0) return { ok: false, detail: "未填写租户名" };
    const st = await checkTenant(names[0]);
    const label = st === "live" ? "正常存活" : st === "dead" ? "已封禁 / 死亡" : "租户不存在";
    return { ok: st === "live", detail: `${names[0]}：${label}` };
  },
};

export default oracleModule;
