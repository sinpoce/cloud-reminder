import { Hono } from "hono";
import type { Env } from "../types";
import { clearDeliveries, getSetting, now } from "../db";
import { CHANNEL_SCHEMA } from "../channels";
import { moduleCatalog } from "../automations";

const app = new Hono<{ Bindings: Env }>();

const COMMON_TIMEZONES = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

async function count(db: D1Database, sql: string, ...binds: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...binds).first<{ n: number }>();
  return row?.n ?? 0;
}

app.get("/overview", async (c) => {
  const db = c.env.DB;
  const ts = now();
  const dayAgo = ts - 86400;

  const [total, active, channels, sentToday, failedToday] = await Promise.all([
    count(db, "SELECT COUNT(*) AS n FROM reminders"),
    count(db, "SELECT COUNT(*) AS n FROM reminders WHERE enabled = 1 AND next_run IS NOT NULL"),
    count(db, "SELECT COUNT(*) AS n FROM channels WHERE enabled = 1"),
    count(db, "SELECT COUNT(*) AS n FROM deliveries WHERE status='success' AND created_at >= ?", dayAgo),
    count(db, "SELECT COUNT(*) AS n FROM deliveries WHERE status='failed' AND created_at >= ?", dayAgo),
  ]);

  const upcoming = await db
    .prepare(
      `SELECT id, title, schedule_type, run_at, cron_expr, interval_unit, interval_value,
              timezone, next_run
       FROM reminders WHERE enabled = 1 AND next_run IS NOT NULL
       ORDER BY next_run ASC LIMIT 6`,
    )
    .all();

  return c.json({
    stats: { total, active, channels, sentToday, failedToday },
    upcoming: upcoming.results,
    server_time: ts,
  });
});

app.get("/deliveries", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "40", 10) || 40, 200);
  const { results } = await c.env.DB
    .prepare(
      `SELECT d.id, d.reminder_id, d.channel_type, d.status, d.detail, d.created_at,
              r.title AS reminder_title
       FROM deliveries d
       LEFT JOIN reminders r ON r.id = d.reminder_id
       ORDER BY d.created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all();
  return c.json({ deliveries: results });
});

// Clear all delivery (send) records.
app.delete("/deliveries", async (c) => {
  await clearDeliveries(c.env.DB);
  return c.json({ ok: true });
});

// Public metadata used to render the dashboard forms.
app.get("/config", async (c) => {
  const defaultTimezone =
    (await getSetting(c.env.DB, "default_timezone")) || c.env.DEFAULT_TIMEZONE || "Asia/Shanghai";
  return c.json({
    channelSchema: CHANNEL_SCHEMA,
    modules: moduleCatalog(),
    timezones: COMMON_TIMEZONES,
    defaultTimezone,
    serverTime: now(),
  });
});

export default app;
