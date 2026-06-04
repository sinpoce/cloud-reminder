import type { AutomationItemResult, AutomationResult } from "../../types";
import type { AutomationModule } from "../module";

// Microsoft 365 E5 (developer) subscription keep-alive — core API logic only.
//
// Login (delegated): exchange an OAuth2 refresh_token for an access token, then
// call a batch of read-only Microsoft Graph endpoints to simulate activity so
// the subscription stays active. The rotated refresh_token is persisted back
// each run (always use the newest one). Stats and a sustained-failure timer are
// persisted in config too, so the card can show login/success/failure counts
// and only notify after ≥10 minutes of continuous failure.
interface E5Config {
  client_id: string;
  client_secret?: string; // confidential clients only; public clients leave blank
  refresh_token: string;
  tenant?: string; // default "common"
  // Internal state (underscore-prefixed; persisted via configPatch, not form fields).
  _fail_since?: number; // epoch ms of the first failure in the current failing streak (0 = healthy)
  _total_success?: number;
  _total_fail?: number;
}

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

const FAIL_NOTIFY_MS = 10 * 60 * 1000; // notify only after sustained failure ≥ 10 min

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
  const now = Date.now();
  const prevFailSince = Number(cfg._fail_since) || 0;
  const prevTotalOk = Number(cfg._total_success) || 0;
  const prevTotalFail = Number(cfg._total_fail) || 0;

  const items: AutomationItemResult[] = [];
  let loginOk = false;
  let success = 0;
  let fail = 0;
  let loginDetail = "";
  let newRefresh: string | undefined;

  if (!cfg.client_id || !cfg.refresh_token) {
    loginDetail = "缺少 Client ID 或 Refresh Token";
  } else {
    const tok = await getToken(cfg);
    if (!tok.ok || !tok.access_token) {
      loginDetail = tok.detail;
    } else {
      loginOk = true;
      if (tok.refresh_token && tok.refresh_token !== cfg.refresh_token) newRefresh = tok.refresh_token;
      for (const path of GRAPH_ENDPOINTS) {
        const r = await callGraph(tok.access_token, path);
        if (r.ok) success++;
        else fail++;
        items.push({
          item: path,
          action: r.ok ? "ok" : "failed",
          detail: r.ok ? `HTTP ${r.status}` : `HTTP ${r.status || "请求失败"}`,
        });
      }
    }
  }

  // A run "fails" if login failed or no Graph call succeeded.
  const isFailure = !loginOk || success === 0;
  const failSince = isFailure ? prevFailSince || now : 0;
  const failedMin = isFailure && failSince ? Math.round((now - failSince) / 60000) : 0;
  const notify = isFailure && failSince > 0 && now - failSince >= FAIL_NOTIFY_MS;

  const configPatch: Record<string, unknown> = {
    _login_ok: loginOk,
    _last_success: success,
    _last_fail: fail,
    _total_success: prevTotalOk + success,
    _total_fail: prevTotalFail + fail,
    _fail_since: failSince,
    _last_run: now,
  };
  if (newRefresh) configPatch.refresh_token = newRefresh;

  let status: AutomationResult["status"];
  let summary: string;
  if (!loginOk) {
    status = "failed";
    summary = notify ? `⚠️ 已连续失败约 ${failedMin} 分钟 · 登录失败：${loginDetail}` : `登录失败：${loginDetail}`;
  } else if (success > 0) {
    status = "success";
    summary = `登录成功 · ${success}/${GRAPH_ENDPOINTS.length} 个 Graph 接口调用成功`;
  } else {
    status = "partial";
    summary = notify
      ? `⚠️ 已连续失败约 ${failedMin} 分钟 · 登录成功但所有接口调用失败`
      : "登录成功，但所有接口调用失败";
  }

  return { status, summary, items, notify, configPatch };
}

const e5RenewModule: AutomationModule = {
  key: "e5_renew",
  label: "Microsoft 365 E5 续订",
  description: "用 OAuth Refresh Token 登录并定期调用 Microsoft Graph API 模拟活跃，保活 E5 开发者订阅。",
  icon: "activity",
  fields: [
    { key: "client_id", label: "Client ID", required: true, placeholder: "Azure AD 应用(客户端) ID", hint: "Azure 门户 → 应用注册里的「应用程序(客户端) ID」" },
    { key: "client_secret", label: "Client Secret（机密客户端填）", required: false, secret: true, placeholder: "公共客户端可留空" },
    { key: "refresh_token", label: "Refresh Token", required: true, secret: true, placeholder: "用 rclone 登录授权得到的 refresh_token", hint: "获取方式见下方文档；每次运行后会自动轮换并保存新值" },
    { key: "tenant", label: "租户（可选）", required: false, placeholder: "common", hint: "默认 common；也可填 organizations 或具体租户 ID" },
  ],
  run: (ctx) => run(ctx.config as unknown as E5Config),
  test: async (ctx) => {
    const cfg = ctx.config as unknown as E5Config;
    if (!cfg.client_id || !cfg.refresh_token) return { ok: false, detail: "缺少 Client ID 或 Refresh Token" };
    const tok = await getToken(cfg);
    return { ok: tok.ok, detail: tok.ok ? "登录成功，凭据有效" : `登录失败：${tok.detail}` };
  },
};

export default e5RenewModule;
