import type { AutomationItemResult, AutomationResult } from "../../types";
import type { AutomationModule, InspectResult, ManagedItem } from "../module";

// DigitalPlat Domain API. Create a token (dp_live_…) at:
//   https://dash.domain.digitalplat.org/dashboard/api/keys
const API_BASE = "https://domain-api.digitalplat.org/api/v1";

interface DigitalPlatConfig {
  api_token: string;
  renew_before_days?: number; // renew when expiry is within N days (default 120)
  domains?: string[] | string; // optional whitelist; empty = all domains
  auto_off?: string[] | string; // domains with auto-renew switched off (skipped by run)
}

// DigitalPlat's API host is behind Cloudflare Bot Management, which challenges
// requests that don't look like a browser. Browser-ish headers pass it.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "sec-ch-ua": '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Accept-Language": "en-US,en;q=0.9",
};

async function dpFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(API_BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...BROWSER_HEADERS,
      ...(init.headers || {}),
    },
  });
}

function unwrap(data: unknown): unknown {
  if (data && typeof data === "object" && "data" in (data as Record<string, unknown>)) {
    const inner = (data as Record<string, unknown>).data;
    if (inner && typeof inner === "object") return inner;
  }
  return data;
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function extractList(raw: unknown): Record<string, unknown>[] {
  for (const data of [raw, unwrap(raw)]) {
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (data && typeof data === "object") {
      for (const key of ["domains", "results", "items", "list", "data"]) {
        const v = (data as Record<string, unknown>)[key];
        if (Array.isArray(v)) return v as Record<string, unknown>[];
      }
    }
  }
  return [];
}

function daysUntil(expiry: string | undefined): number | null {
  if (!expiry) return null;
  let ms: number;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(expiry.trim()); // "20270604"
  if (compact) ms = Date.UTC(+compact[1], +compact[2] - 1, +compact[3]);
  else ms = Date.parse(expiry);
  if (Number.isNaN(ms)) return null;
  return Math.ceil((ms - Date.now()) / 86_400_000);
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const err = j.error;
    if (err && typeof err === "object") {
      const m = pickStr(err as Record<string, unknown>, ["message", "code"]);
      if (m) return m;
    }
    const msg = pickStr(j, ["message", "error", "detail", "msg"]);
    if (msg) return msg;
  } catch {
    /* not JSON */
  }
  if (/challenge|cf-mitigated|just a moment|attention required/i.test(text)) {
    return "被 Cloudflare 拦截（出口被风控），稍后重试或更换出口 IP";
  }
  const trace = /Trace ID:\s*([A-Za-z0-9-]+)/i.exec(text);
  if (/<!doctype html|<html/i.test(text)) {
    return `DigitalPlat 返回错误页（HTTP ${res.status}${trace ? `，Trace ${trace[1]}` : ""}）`;
  }
  return text.slice(0, 160) || `HTTP ${res.status}`;
}

async function listDomains(token: string): Promise<{ ok: boolean; detail: string; domains: string[] }> {
  try {
    const res = await dpFetch(token, "/domains");
    if (!res.ok) return { ok: false, detail: await readError(res), domains: [] };
    const list = extractList(await res.json());
    const domains = list
      .map((r) => pickStr(r, ["domain", "name", "full_domain", "fqdn"]))
      .filter((x): x is string => !!x);
    const within = list.filter((r) => {
      const d = daysUntil(pickStr(r, ["expiry_date", "expires_at", "expiryDate", "expiresAt", "expiration_date"]));
      return d != null && d <= 120;
    }).length;
    const detail =
      `连接成功 · 共 ${domains.length} 个域名` +
      (within ? `（${within} 个已进入续订窗口）` : "（暂无域名进入 120 天续订窗口）");
    return { ok: true, detail, domains };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "网络错误", domains: [] };
  }
}

function fmtExpiry(expiry: string): string {
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(expiry.trim());
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return expiry.slice(0, 10);
}

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const EXPIRY_KEYS = ["expiry_date", "expires_at", "expiryDate", "expiresAt", "expiration_date"];

// List the account's domains with expiry info as ManagedItems for the panel.
async function inspect(config: DigitalPlatConfig): Promise<InspectResult> {
  const token = config.api_token;
  if (!token) return { ok: false, detail: "未配置 API Token", items: [] };
  const before = Number(config.renew_before_days) || 120;
  const autoOff = toList(config.auto_off).map((d) => d.toLowerCase());
  try {
    const res = await dpFetch(token, "/domains");
    if (!res.ok) return { ok: false, detail: await readError(res), items: [] };
    const list = extractList(await res.json());
    const items: ManagedItem[] = [];
    for (const rec of list) {
      const name = pickStr(rec, ["domain", "name", "full_domain", "fqdn"]);
      if (!name) continue;
      const expiry = pickStr(rec, EXPIRY_KEYS);
      const days = daysUntil(expiry);
      const inWindow = days != null && days <= before;
      const expired = days != null && days < 0;
      const expStr = expiry ? fmtExpiry(expiry) : "未知";
      const subtitle =
        days == null
          ? `到期日 ${expStr}`
          : expired
            ? `已过期 · ${expStr}`
            : `到期 ${expStr} · 剩 ${days} 天${inWindow ? " · 可续订" : ""}`;
      items.push({
        id: name,
        title: name,
        subtitle,
        status: expired ? "danger" : inWindow ? "warn" : "ok",
        canAction: rec.can_renew !== false && (days == null || inWindow),
        auto: !autoOff.includes(name.toLowerCase()),
      });
    }
    const within = items.filter((i) => i.status === "warn").length;
    return {
      ok: true,
      detail: `共 ${items.length} 个域名` + (within ? `，${within} 个进入续订窗口` : "（暂无进入 120 天窗口）"),
      items,
      actionLabel: "续期",
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "网络错误", items: [] };
  }
}

async function renewOne(token: string, domain: string): Promise<{ ok: boolean; detail: string }> {
  const res = await dpFetch(token, `/domains/${encodeURIComponent(domain)}/renew`, {
    method: "POST",
    body: JSON.stringify({ renewal_type: "free", years: 1 }),
  });
  if (res.ok) {
    const data = unwrap(await res.json().catch(() => ({}))) as Record<string, unknown>;
    const newExpiry = pickStr(data, ["expiry_date", "expires_at", "expiryDate", "new_expiry"]);
    return { ok: true, detail: newExpiry ? `续订成功，到期 ${newExpiry.slice(0, 10)}` : "续订成功" };
  }
  return { ok: false, detail: await readError(res) };
}

async function run(config: DigitalPlatConfig): Promise<AutomationResult> {
  if (!config.api_token) return { status: "failed", summary: "未配置 API Token", items: [] };
  const before = Number(config.renew_before_days) || 120;
  const rawDomains = Array.isArray(config.domains)
    ? config.domains
    : String(config.domains ?? "").split(",");
  const whitelist = rawDomains.map((d) => d.trim().toLowerCase()).filter(Boolean);
  const autoOff = toList(config.auto_off).map((d) => d.toLowerCase());

  let list: Record<string, unknown>[];
  try {
    const res = await dpFetch(config.api_token, "/domains");
    if (!res.ok) return { status: "failed", summary: `获取域名列表失败：${await readError(res)}`, items: [] };
    list = extractList(await res.json());
  } catch (e) {
    return { status: "failed", summary: `获取域名列表失败：${e instanceof Error ? e.message : "网络错误"}`, items: [] };
  }
  if (list.length === 0) return { status: "success", summary: "账户内没有域名", items: [] };

  const items: AutomationItemResult[] = [];
  for (const rec of list) {
    const name = pickStr(rec, ["domain", "name", "full_domain", "fqdn"]);
    if (!name) continue;
    if (whitelist.length && !whitelist.includes(name.toLowerCase())) continue;
    if (autoOff.includes(name.toLowerCase())) {
      items.push({ item: name, action: "skipped", detail: "已关闭自动续期" });
      continue;
    }

    const days = daysUntil(pickStr(rec, ["expiry_date", "expires_at", "expiryDate", "expiresAt", "expiration_date"]));
    if (rec.can_renew === false) {
      items.push({ item: name, action: "skipped", detail: "当前不可续订（can_renew=false）" });
      continue;
    }
    // DigitalPlat opens free renewal only when < ~120 days remain.
    if (days != null && days > before) {
      items.push({ item: name, action: "skipped", detail: `还有 ${days} 天到期，未进入续订窗口（少于 ${before} 天才可续）` });
      continue;
    }
    try {
      const r = await renewOne(config.api_token, name);
      items.push({ item: name, action: r.ok ? "ok" : "failed", detail: r.detail });
    } catch (e) {
      items.push({ item: name, action: "failed", detail: e instanceof Error ? e.message : "网络错误" });
    }
  }

  const renewed = items.filter((i) => i.action === "ok").length;
  const failed = items.filter((i) => i.action === "failed").length;
  const status: AutomationResult["status"] = failed > 0 ? (renewed > 0 ? "partial" : "failed") : "success";
  const skipped = items.filter((i) => i.action === "skipped").length;
  const windowSkips = items.filter((i) => i.action === "skipped" && i.detail.includes("续订窗口")).length;
  const parts: string[] = [];
  if (renewed) parts.push(`续订 ${renewed} 个`);
  if (failed) parts.push(`失败 ${failed} 个`);
  if (skipped) parts.push(`跳过 ${skipped} 个`);
  let summary = parts.length ? parts.join("，") : "无需续订";
  if (!renewed && !failed && items.length > 0 && windowSkips === items.length) {
    summary = `${items.length} 个域名均未进入续订窗口（少于 ${before} 天才可续）`;
  }
  return { status, summary, items };
}

const digitalplatModule: AutomationModule = {
  key: "digitalplat_renew",
  label: "DigitalPlat 域名续订",
  description: "到期前（少于 120 天）自动调用 DigitalPlat API 免费续订域名 1 年。",
  icon: "globe",
  docsUrl: "https://dash.domain.digitalplat.org/dashboard/api/keys",
  fields: [
    { key: "api_token", label: "API Token", required: true, secret: true, placeholder: "dp_live_...", hint: "在 DigitalPlat 控制台 → API Keys 创建" },
    { key: "renew_before_days", label: "提前续订天数", type: "number", placeholder: "120", hint: "DigitalPlat 免费续费窗口为「剩余少于 120 天」" },
    { key: "domains", label: "指定域名（可选）", placeholder: "a.dpdns.org, b.dpdns.org", hint: "逗号分隔；留空表示账户内全部域名" },
  ],
  run: (ctx) => run(ctx.config as unknown as DigitalPlatConfig),
  test: (ctx) => listDomains(String(ctx.config.api_token ?? "")),
  inspect: (ctx) => inspect(ctx.config as unknown as DigitalPlatConfig),
  act: (ctx, action, item) =>
    action === "renew"
      ? renewOne(String(ctx.config.api_token ?? ""), item)
      : Promise.resolve({ ok: false, detail: `未知操作：${action}` }),
};

export default digitalplatModule;
