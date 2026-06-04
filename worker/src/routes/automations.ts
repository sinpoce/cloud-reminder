import { Hono } from "hono";
import type { Automation, AutomationType, Env } from "../types";
import {
  deleteAutomation,
  deleteSetting,
  getAutomation,
  getChannelsByIds,
  getSetting,
  insertAutomation,
  listAutomationRuns,
  listAutomations,
  now,
  setSetting,
  uid,
  updateAutomationRow,
} from "../db";
import { getModule, testModule, inspectModule, actModule } from "../automations";
import { dispatch } from "../channels";
import { automationNextRun, runAutomationAndRecord } from "../automation-runner";
import { validateCron } from "../schedule";

const app = new Hono<{ Bindings: Env }>();

interface AutomationInput {
  type?: AutomationType;
  kind?: "builtin" | "custom";
  code?: string;
  name?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  cron_expr?: string;
  timezone?: string;
  notify_channel_ids?: string[];
}

// Redact secret config values (per the module's field specs) before sending to
// the dashboard.
function redact(a: Automation): Automation {
  const m = getModule(a.type);
  const secretKeys = new Set((m?.fields ?? []).filter((f) => f.secret).map((f) => f.key));
  const config: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a.config)) {
    const isSecret = secretKeys.has(k) || (!m && /token|secret|key|password/i.test(k));
    config[k] = typeof v === "string" && v && isSecret ? "••••••••" : v;
  }
  return { ...a, config };
}

function buildAutomation(
  input: AutomationInput,
  base: Automation | null,
  fallbackTz: string,
): Automation | string {
  const kind = input.kind ?? base?.kind ?? "builtin";

  const name = (input.name ?? base?.name ?? "").trim();
  if (!name) return "请填写名称";

  const cron_expr = (input.cron_expr ?? base?.cron_expr ?? "0 3 * * *").trim();
  const cronErr = validateCron(cron_expr);
  if (cronErr) return cronErr;

  const timezone = input.timezone || base?.timezone || fallbackTz;
  const notify_channel_ids = Array.isArray(input.notify_channel_ids)
    ? input.notify_channel_ids.filter((x) => typeof x === "string")
    : base?.notify_channel_ids ?? [];

  // Merge config; keep existing secrets when the client sends back the redaction.
  const incoming = input.config ?? {};
  const config: Record<string, unknown> = { ...(base?.config ?? {}) };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === "••••••••") continue;
    config[k] = v;
  }

  let type: string;
  let code: string | null = base?.code ?? null;

  if (kind === "custom") {
    type = "custom";
    code = String(input.code ?? base?.code ?? "");
    if (!code.trim()) return "请填写模块代码";
  } else {
    type = input.type ?? base?.type ?? "";
    const module = getModule(type);
    if (!module) return `未知模块：${type || "(空)"}`;
    code = null;
    // Validate required fields and coerce numbers, driven by the module's schema.
    for (const f of module.fields) {
      if (f.required && !String(config[f.key] ?? "").trim()) return `请填写「${f.label}」`;
      if (f.type === "number" && config[f.key] != null && config[f.key] !== "") {
        const n = Number(config[f.key]);
        if (Number.isFinite(n)) config[f.key] = n;
      }
    }
  }

  const ts = now();
  const enabled = input.enabled ?? base?.enabled ?? true;
  const automation: Automation = {
    id: base?.id ?? uid(),
    type,
    kind,
    code,
    name,
    config,
    enabled,
    cron_expr,
    timezone,
    notify_channel_ids,
    next_run: null,
    last_run: base?.last_run ?? null,
    last_status: base?.last_status ?? null,
    last_detail: base?.last_detail ?? null,
    created_at: base?.created_at ?? ts,
    updated_at: ts,
  };
  automation.next_run = enabled ? automationNextRun(automation, ts) : null;
  return automation;
}

app.get("/", async (c) => {
  const automations = (await listAutomations(c.env.DB)).map(redact);
  return c.json({ automations });
});

app.post("/", async (c) => {
  const input = (await c.req.json().catch(() => ({}))) as AutomationInput;
  const built = buildAutomation(input, null, c.env.DEFAULT_TIMEZONE);
  if (typeof built === "string") return c.json({ error: built }, 400);
  await insertAutomation(c.env.DB, built);
  return c.json({ automation: redact(built) }, 201);
});

interface TargetInput {
  id?: string;
  type?: string;
  config?: Record<string, unknown>;
  action?: string;
  item?: string;
}

// Resolve { type, config } for inspect/act. When editing (id given), fill any
// redacted secret values (••••) from the stored automation so the real token
// is used; when creating, the client sends the real token directly.
async function resolveTarget(db: Env["DB"], input: TargetInput) {
  let type = input.type ?? "";
  let config: Record<string, unknown> = { ...(input.config ?? {}) };
  if (input.id) {
    const a = await getAutomation(db, input.id);
    if (a) {
      type = type || a.type;
      const merged: Record<string, unknown> = { ...a.config };
      for (const [k, v] of Object.entries(config)) if (v !== "••••••••") merged[k] = v;
      config = merged;
    }
  }
  return { type, config };
}

// List a module's manageable items (e.g. DigitalPlat domains) for the panel.
app.post("/inspect", async (c) => {
  const input = (await c.req.json().catch(() => ({}))) as TargetInput;
  const { type, config } = await resolveTarget(c.env.DB, input);
  const res = await inspectModule(type, config);
  return c.json(res, res.ok ? 200 : 502);
});

// Run a per-item action (e.g. renew one domain) immediately. Manual actions on
// a saved automation also push the result to its configured notify channels.
app.post("/act", async (c) => {
  const input = (await c.req.json().catch(() => ({}))) as TargetInput;
  if (!input.item) return c.json({ ok: false, detail: "缺少操作目标" }, 400);
  const { type, config } = await resolveTarget(c.env.DB, input);
  const res = await actModule(type, config, input.action || "", String(input.item));

  if (input.id) {
    const a = await getAutomation(c.env.DB, input.id);
    if (a && a.notify_channel_ids.length) {
      const icon = res.ok ? "✅" : "❌";
      const title = `${icon} ${a.name} · 手动续期`;
      const body = `${input.item}：${res.detail}`;
      const channels = (await getChannelsByIds(c.env.DB, a.notify_channel_ids)).filter((ch) => ch.enabled);
      await Promise.all(channels.map((ch) => dispatch(ch, title, body, a.timezone).catch(() => undefined)));
    }
  }
  return c.json(res, res.ok ? 200 : 502);
});

// ── Microsoft 365 E5 OAuth login (authorization-code + PKCE) ───────────────────
function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const E5_SCOPE = "offline_access https://graph.microsoft.com/.default";

// Start login: build the Microsoft authorize URL and stash the PKCE verifier +
// client creds against a one-time state. The public /api/e5/callback completes it.
app.post("/e5/auth-start", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    client_id?: string;
    client_secret?: string;
    tenant?: string;
    redirect_uri?: string;
    login_hint?: string;
  };
  if (!body.client_id || !body.redirect_uri) return c.json({ error: "缺少 Client ID 或回调地址" }, 400);
  const tenant = (body.tenant || "common").trim() || "common";
  const state = uid();
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)).buffer);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  await setSetting(
    c.env.DB,
    `e5oauth:${state}`,
    JSON.stringify({
      client_id: body.client_id,
      client_secret: body.client_secret || "",
      tenant,
      redirect_uri: body.redirect_uri,
      verifier,
      ts: now(),
    }),
  );
  const params = new URLSearchParams({
    client_id: body.client_id,
    response_type: "code",
    redirect_uri: body.redirect_uri,
    response_mode: "query",
    scope: E5_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  if (body.login_hint) params.set("login_hint", body.login_hint);
  const authUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params.toString()}`;
  return c.json({ authUrl, state });
});

// Poll for the result after the popup finishes — returns the refresh_token once.
app.get("/e5/auth-result", async (c) => {
  const state = c.req.query("state") || "";
  const raw = state ? await getSetting(c.env.DB, `e5oauth:${state}`) : null;
  if (!raw) return c.json({ ok: false, error: "授权会话不存在或已过期" }, 404);
  const p = JSON.parse(raw) as { done?: boolean; refresh_token?: string; tenant?: string; error?: string };
  if (p.done && p.refresh_token) {
    await deleteSetting(c.env.DB, `e5oauth:${state}`);
    return c.json({ ok: true, refresh_token: p.refresh_token, tenant: p.tenant });
  }
  if (p.error) {
    await deleteSetting(c.env.DB, `e5oauth:${state}`);
    return c.json({ ok: false, error: p.error });
  }
  return c.json({ ok: false, pending: true });
});

app.get("/:id", async (c) => {
  const a = await getAutomation(c.env.DB, c.req.param("id"));
  if (!a) return c.json({ error: "Not found" }, 404);
  return c.json({ automation: redact(a) });
});

app.put("/:id", async (c) => {
  const existing = await getAutomation(c.env.DB, c.req.param("id"));
  if (!existing) return c.json({ error: "Not found" }, 404);
  const input = (await c.req.json().catch(() => ({}))) as AutomationInput;
  const built = buildAutomation(input, existing, c.env.DEFAULT_TIMEZONE);
  if (typeof built === "string") return c.json({ error: built }, 400);
  await updateAutomationRow(c.env.DB, built);
  return c.json({ automation: redact(built) });
});

app.delete("/:id", async (c) => {
  await deleteAutomation(c.env.DB, c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/:id/toggle", async (c) => {
  const a = await getAutomation(c.env.DB, c.req.param("id"));
  if (!a) return c.json({ error: "Not found" }, 404);
  const ts = now();
  const enabled = !a.enabled;
  const updated: Automation = {
    ...a,
    enabled,
    next_run: enabled ? automationNextRun(a, ts) : null,
    updated_at: ts,
  };
  await updateAutomationRow(c.env.DB, updated);
  return c.json({ automation: redact(updated) });
});

// Run immediately (manual) — same window logic as the scheduled run.
app.post("/:id/run", async (c) => {
  const a = await getAutomation(c.env.DB, c.req.param("id"));
  if (!a) return c.json({ error: "Not found" }, 404);
  const result = await runAutomationAndRecord(c.env, a, { notify: true });
  return c.json({ result });
});

// Module connectivity/credential test (does not change any state).
app.post("/:id/test", async (c) => {
  const a = await getAutomation(c.env.DB, c.req.param("id"));
  if (!a) return c.json({ error: "Not found" }, 404);
  const res = await testModule(a);
  return c.json(res, res.ok ? 200 : 502);
});

app.get("/:id/runs", async (c) => {
  const runs = await listAutomationRuns(c.env.DB, c.req.param("id"), 20);
  return c.json({ runs });
});

export default app;
