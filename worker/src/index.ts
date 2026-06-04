import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { getJwtSecret, requireAuth, signToken, verifyAdminPassword } from "./auth";
import { getSetting, setSetting } from "./db";
import { ensureSchema } from "./db-init";
import remindersRoute from "./routes/reminders";
import channelsRoute from "./routes/channels";
import automationsRoute from "./routes/automations";
import settingsRoute from "./routes/settings";
import metaRoute from "./routes/meta";
import { runDueReminders } from "./dispatcher";
import { runDueAutomations } from "./automation-runner";

const app = new Hono<{ Bindings: Env }>();

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use("*", (c, next) =>
  cors({
    origin: (origin) => {
      const allowed = (c.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (allowed.includes("*")) return origin || "*";
      return allowed.includes(origin) ? origin : allowed[0] ?? null;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86400,
  })(c, next),
);

// Ensure the D1 schema exists (self-init for one-click / fresh deploys).
app.use("*", async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

// ── public routes ────────────────────────────────────────────────────────────
app.get("/", (c) =>
  c.json({ name: "Cloud Reminder API", status: "ok", docs: "/health" }),
);

app.get("/health", (c) => c.json({ ok: true, time: Math.floor(Date.now() / 1000) }));

// Login with brute-force protection: after 10 consecutive wrong passwords the
// login is locked for 30 minutes (counters persisted in D1, reset on success).
const LOGIN_FAIL_LIMIT = 10;
const LOGIN_LOCK_SECONDS = 30 * 60;

app.post("/api/login", async (c) => {
  const nowSec = Math.floor(Date.now() / 1000);

  const lockedUntil = parseInt((await getSetting(c.env.DB, "login_locked_until")) || "0", 10);
  if (lockedUntil > nowSec) {
    const mins = Math.ceil((lockedUntil - nowSec) / 60);
    return c.json({ error: `登录尝试过于频繁，请 ${mins} 分钟后再试` }, 429);
  }

  const { password } = (await c.req.json().catch(() => ({}))) as { password?: string };
  const storedHash = await getSetting(c.env.DB, "admin_password_hash");
  const ok =
    typeof password === "string" &&
    (await verifyAdminPassword(password, storedHash, c.env.ADMIN_PASSWORD));

  if (!ok) {
    const fails = parseInt((await getSetting(c.env.DB, "login_fail_count")) || "0", 10) + 1;
    if (fails >= LOGIN_FAIL_LIMIT) {
      await setSetting(c.env.DB, "login_locked_until", String(nowSec + LOGIN_LOCK_SECONDS));
      await setSetting(c.env.DB, "login_fail_count", "0");
      return c.json({ error: `密码连续错误 ${LOGIN_FAIL_LIMIT} 次，已锁定 30 分钟` }, 429);
    }
    await setSetting(c.env.DB, "login_fail_count", String(fails));
    return c.json({ error: `密码错误，还可尝试 ${LOGIN_FAIL_LIMIT - fails} 次` }, 401);
  }

  await setSetting(c.env.DB, "login_fail_count", "0");
  await setSetting(c.env.DB, "login_locked_until", "0");
  const token = await signToken({ sub: "admin" }, await getJwtSecret(c.env));
  return c.json({ token });
});

// ── Microsoft 365 E5 OAuth callback (public — Microsoft redirects here, no JWT) ─
function e5ResultPage(ok: boolean, msg: string, state = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>E5 授权</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f0f14;color:#e6e6ea;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;padding:24px">
<p style="font-size:18px;margin:0 0 8px">${ok ? "✅" : "❌"} ${msg}</p>
<p style="color:#8a8a96;font-size:13px;margin:0">此窗口将自动关闭…</p>
</div>
<script>
try{window.opener&&window.opener.postMessage({type:"e5-oauth",ok:${ok},state:${JSON.stringify(state)},msg:${JSON.stringify(msg)}},"*")}catch(e){}
setTimeout(function(){window.close()},${ok ? 1000 : 4000});
</script></body></html>`;
}

app.get("/api/e5/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state") || "";
  const oauthErr = c.req.query("error_description") || c.req.query("error");
  const raw = state ? await getSetting(c.env.DB, `e5oauth:${state}`) : null;
  if (!raw) return c.html(e5ResultPage(false, "授权会话无效或已过期"));
  const pending = JSON.parse(raw) as {
    client_id: string;
    client_secret: string;
    tenant: string;
    redirect_uri: string;
    verifier: string;
  };
  const fail = (msg: string) =>
    setSetting(c.env.DB, `e5oauth:${state}`, JSON.stringify({ ...pending, error: msg })).then(() =>
      c.html(e5ResultPage(false, msg, state)),
    );
  if (oauthErr || !code) return fail(String(oauthErr || "未收到授权码"));
  try {
    const body = new URLSearchParams({
      client_id: pending.client_id,
      grant_type: "authorization_code",
      code,
      redirect_uri: pending.redirect_uri,
      code_verifier: pending.verifier,
      scope: "offline_access https://graph.microsoft.com/.default",
    });
    if (pending.client_secret) body.set("client_secret", pending.client_secret);
    const res = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(pending.tenant)}/oauth2/v2.0/token`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() },
    );
    const data = (await res.json().catch(() => ({}))) as {
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.refresh_token) {
      return fail((data.error_description || "").split(/[\r\n]/)[0] || data.error || "换取令牌失败");
    }
    await setSetting(c.env.DB, `e5oauth:${state}`, JSON.stringify({ ...pending, refresh_token: data.refresh_token, done: true }));
    return c.html(e5ResultPage(true, "授权成功，Refresh Token 已获取", state));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "网络错误");
  }
});

// ── guarded API ──────────────────────────────────────────────────────────────
const api = new Hono<{ Bindings: Env }>();
api.use("*", requireAuth());
api.get("/me", (c) => c.json({ ok: true }));
api.route("/reminders", remindersRoute);
api.route("/channels", channelsRoute);
api.route("/automations", automationsRoute);
api.route("/", settingsRoute);
api.route("/", metaRoute);
app.route("/api", api);

// Unified deploy: serve the SPA for any non-API route (client-side routing).
// Static files are served by the platform before the Worker runs; this only
// handles app routes like /reminders. No-op when assets aren't configured.
app.get("*", async (c) => {
  if (c.env.ASSETS && !c.req.path.startsWith("/api")) {
    return c.env.ASSETS.fetch(new Request(new URL("/", c.req.url), c.req.raw));
  }
  return c.json({ error: "Not found" }, 404);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal error" }, 500);
});

// ── Worker entry (fetch + cron) ──────────────────────────────────────────────
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      ensureSchema(env.DB).then(() => Promise.all([
        runDueReminders(env).then(
          (n) => n && console.log(`Dispatched ${n} reminder(s)`),
          (e) => console.error("Reminder cron error:", e),
        ),
        runDueAutomations(env).then(
          (n) => n && console.log(`Ran ${n} automation(s)`),
          (e) => console.error("Automation cron error:", e),
        ),
      ])),
    );
  },
};
