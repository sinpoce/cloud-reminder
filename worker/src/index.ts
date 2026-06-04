import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { getJwtSecret, requireAuth, signToken, verifyAdminPassword } from "./auth";
import { getSetting } from "./db";
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

app.post("/api/login", async (c) => {
  const { password } = (await c.req.json().catch(() => ({}))) as { password?: string };
  const storedHash = await getSetting(c.env.DB, "admin_password_hash");
  if (typeof password !== "string" || !(await verifyAdminPassword(password, storedHash, c.env.ADMIN_PASSWORD))) {
    return c.json({ error: "Incorrect password" }, 401);
  }
  const token = await signToken({ sub: "admin" }, await getJwtSecret(c.env));
  return c.json({ token });
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
