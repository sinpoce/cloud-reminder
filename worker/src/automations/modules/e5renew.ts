import type { AutomationItemResult, AutomationResult } from "../../types";
import type { AutomationModule } from "../module";

// Microsoft 365 E5 (developer) subscription keep-alive.
//
// Core logic only (no Docker / web UI / mail — Cloud Reminder already schedules
// and notifies): use an OAuth2 refresh_token to get an access token, then call
// a batch of read-only Microsoft Graph endpoints to simulate activity so the
// subscription stays active. The rotated refresh_token from each token response
// is persisted back to the automation's config (always use the newest one).
interface E5Config {
  client_id: string;
  client_secret?: string; // confidential clients only; public clients leave blank
  refresh_token: string;
  tenant?: string; // default "common"
}

// A spread of read-only Graph calls. Not all require the same scope — whichever
// the granted token allows will succeed; the rest just 403 harmlessly. The
// point is to generate genuine API activity.
const GRAPH_ENDPOINTS = [
  "/me",
  "/users?$top=5",
  "/me/drive/root",
  "/me/messages?$top=5&$select=subject",
  "/me/mailFolders",
  "/me/contacts?$top=5",
  "/me/calendars",
  "/me/events?$top=5",
  "/me/drive/root/children",
  "/me/people",
  "/subscribedSkus",
  "/me/memberOf",
  "/me/outlook/masterCategories",
  "/me/onenote/notebooks",
];

interface TokenResult {
  ok: boolean;
  detail: string;
  access_token?: string;
  refresh_token?: string;
}

async function getToken(cfg: E5Config): Promise<TokenResult> {
  const tenant = (cfg.tenant || "common").trim() || "common";
  const body = new URLSearchParams({
    client_id: cfg.client_id.trim(),
    grant_type: "refresh_token",
    refresh_token: cfg.refresh_token.trim(),
  });
  if (cfg.client_secret) body.set("client_secret", cfg.client_secret);
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };
    if (res.ok && data.access_token) {
      return {
        ok: true,
        detail: "获取 access_token 成功",
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      };
    }
    const detail = (data.error_description || "").split(/[\r\n]/)[0] || data.error || `HTTP ${res.status}`;
    return { ok: false, detail };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "网络错误" };
  }
}

async function callGraph(token: string, path: string): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0" + path, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    await res.body?.cancel().catch(() => undefined); // drain without buffering
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function run(cfg: E5Config): Promise<AutomationResult> {
  if (!cfg.client_id || !cfg.refresh_token) {
    return { status: "failed", summary: "缺少 Client ID 或 Refresh Token", items: [] };
  }
  const tok = await getToken(cfg);
  if (!tok.ok || !tok.access_token) {
    return { status: "failed", summary: `获取令牌失败：${tok.detail}`, items: [] };
  }

  const items: AutomationItemResult[] = [];
  let success = 0;
  for (const path of GRAPH_ENDPOINTS) {
    const r = await callGraph(tok.access_token, path);
    if (r.ok) success++;
    items.push({
      item: path,
      action: r.ok ? "ok" : "failed",
      detail: r.ok ? `HTTP ${r.status}` : `HTTP ${r.status || "请求失败"}（权限不足或不可用）`,
    });
  }

  // Persist the rotated refresh_token so the next run uses the freshest one.
  const configPatch =
    tok.refresh_token && tok.refresh_token !== cfg.refresh_token
      ? { refresh_token: tok.refresh_token }
      : undefined;

  return {
    status: success > 0 ? "success" : "partial",
    summary: `E5 保活完成：令牌有效，${success}/${GRAPH_ENDPOINTS.length} 个 Graph 接口调用成功`,
    items,
    configPatch,
  };
}

const e5RenewModule: AutomationModule = {
  key: "e5_renew",
  label: "Microsoft 365 E5 续订",
  description: "用 OAuth Refresh Token 定期调用 Microsoft Graph API 模拟活跃，保活 E5 开发者订阅。",
  icon: "activity",
  docsUrl: "https://github.com/hongyonghan/Docker_Microsoft365_E5_Renew_X",
  fields: [
    { key: "client_id", label: "Client ID", required: true, placeholder: "Azure AD 应用(客户端) ID", hint: "Azure 门户 → 应用注册里的「应用程序(客户端) ID」" },
    { key: "client_secret", label: "Client Secret（机密客户端填）", required: false, secret: true, placeholder: "公共客户端可留空" },
    { key: "refresh_token", label: "Refresh Token", required: true, secret: true, placeholder: "OAuth 授权得到的 refresh_token", hint: "每次运行后会自动轮换并保存新的 refresh_token" },
    { key: "tenant", label: "租户（可选）", required: false, placeholder: "common", hint: "默认 common；也可填 organizations 或具体租户 ID" },
  ],
  run: (ctx) => run(ctx.config as unknown as E5Config),
  test: async (ctx) => {
    const cfg = ctx.config as unknown as E5Config;
    if (!cfg.client_id || !cfg.refresh_token) return { ok: false, detail: "缺少 Client ID 或 Refresh Token" };
    const tok = await getToken(cfg);
    return { ok: tok.ok, detail: tok.ok ? "凭据有效，可成功获取 access_token" : tok.detail };
  },
};

export default e5RenewModule;
