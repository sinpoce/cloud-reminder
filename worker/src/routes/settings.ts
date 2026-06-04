import { Hono } from "hono";
import type { Env } from "../types";
import { getSetting, setSetting } from "../db";
import { hashPassword, verifyAdminPassword } from "../auth";

const app = new Hono<{ Bindings: Env }>();

// Current mutable settings (default timezone, whether a custom password is set).
app.get("/settings", async (c) => {
  const tz = (await getSetting(c.env.DB, "default_timezone")) || c.env.DEFAULT_TIMEZONE || "Asia/Shanghai";
  const hasCustomPassword = !!(await getSetting(c.env.DB, "admin_password_hash"));
  return c.json({ defaultTimezone: tz, hasCustomPassword });
});

app.put("/settings", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { defaultTimezone?: string };
  if (typeof body.defaultTimezone === "string" && body.defaultTimezone.trim()) {
    const tz = body.defaultTimezone.trim();
    // Validate it's a real IANA zone.
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch {
      return c.json({ error: "无效的时区" }, 400);
    }
    await setSetting(c.env.DB, "default_timezone", tz);
  }
  return c.json({ ok: true });
});

// Change the admin password.
app.post("/account/password", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    current_password?: string;
    new_password?: string;
  };
  const current = body.current_password ?? "";
  const next = body.new_password ?? "";
  if (next.length < 6) return c.json({ error: "新密码至少 6 位" }, 400);

  const storedHash = await getSetting(c.env.DB, "admin_password_hash");
  if (!(await verifyAdminPassword(current, storedHash, c.env.ADMIN_PASSWORD))) {
    return c.json({ error: "当前密码不正确" }, 401);
  }
  await setSetting(c.env.DB, "admin_password_hash", await hashPassword(next));
  return c.json({ ok: true });
});

export default app;
