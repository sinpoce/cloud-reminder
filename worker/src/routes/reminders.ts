import { Hono } from "hono";
import type { Env, Reminder } from "../types";
import {
  deleteReminder,
  getChannelsByIds,
  getReminder,
  insertReminder,
  listReminders,
  now,
  uid,
  updateReminderRow,
} from "../db";
import { computeNextRun, fireReminder, sendToChannels } from "../dispatcher";
import { validateCron, validateInterval, zonedTimeToEpoch } from "../schedule";
import type { IntervalUnit } from "../types";

const app = new Hono<{ Bindings: Env }>();

interface ReminderInput {
  title?: string;
  body?: string;
  schedule_type?: "once" | "interval" | "cron";
  run_at?: number;
  local_datetime?: string; // "YYYY-MM-DDTHH:mm"
  cron_expr?: string;
  interval_unit?: IntervalUnit;
  interval_value?: number;
  timezone?: string;
  channel_ids?: string[];
  enabled?: boolean;
}

function localToEpoch(local: string, tz: string): number | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return zonedTimeToEpoch(+y, +mo, +d, +h, +mi, tz);
}

// Build a validated Reminder from request input. Returns a string on error.
function buildReminder(
  input: ReminderInput,
  base: Reminder | null,
  fallbackTz: string,
): Reminder | string {
  const title = (input.title ?? base?.title ?? "").trim();
  if (!title) return "Title is required";

  const timezone = input.timezone || base?.timezone || fallbackTz;
  const schedule_type = input.schedule_type || base?.schedule_type || "once";
  const channel_ids = Array.isArray(input.channel_ids)
    ? input.channel_ids.filter((x) => typeof x === "string")
    : base?.channel_ids ?? [];
  if (channel_ids.length === 0) return "Select at least one channel";

  let run_at: number | null = base?.run_at ?? null;
  let cron_expr: string | null = base?.cron_expr ?? null;
  let interval_unit: IntervalUnit | null = base?.interval_unit ?? null;
  let interval_value: number | null = base?.interval_value ?? null;
  const ts = now();

  // Resolve an anchor/fire time from `run_at` (epoch) or `local_datetime`.
  const resolveAnchor = (): number | null => {
    if (typeof input.run_at === "number") return Math.floor(input.run_at);
    if (input.local_datetime) return localToEpoch(input.local_datetime, timezone);
    return base?.run_at ?? null;
  };

  if (schedule_type === "once") {
    cron_expr = null;
    interval_unit = null;
    interval_value = null;
    const anchor = resolveAnchor();
    if (anchor == null) return "A valid date and time is required for one-time reminders";
    run_at = anchor;
  } else if (schedule_type === "interval") {
    cron_expr = null;
    const unit = input.interval_unit ?? base?.interval_unit ?? "day";
    const value = input.interval_value ?? base?.interval_value ?? 1;
    const err = validateInterval(unit, value);
    if (err) return err;
    interval_unit = unit;
    interval_value = value;
    // Start time (anchor); default to now when not supplied.
    run_at = resolveAnchor() ?? ts;
  } else if (schedule_type === "cron") {
    run_at = null;
    interval_unit = null;
    interval_value = null;
    cron_expr = (input.cron_expr ?? base?.cron_expr ?? "").trim();
    const err = validateCron(cron_expr);
    if (err) return err;
  } else {
    return "Invalid schedule type";
  }

  const enabled = input.enabled ?? base?.enabled ?? true;

  const reminder: Reminder = {
    id: base?.id ?? uid(),
    title,
    body: (input.body ?? base?.body ?? "").trim(),
    schedule_type,
    run_at,
    cron_expr,
    interval_unit,
    interval_value,
    timezone,
    channel_ids,
    enabled,
    next_run: null,
    last_run: base?.last_run ?? null,
    last_status: base?.last_status ?? null,
    created_at: base?.created_at ?? ts,
    updated_at: ts,
  };
  // (Re)compute the next firing time from now.
  reminder.next_run = enabled ? computeNextRun(reminder, ts) : null;
  return reminder;
}

app.get("/", async (c) => {
  const reminders = await listReminders(c.env.DB);
  return c.json({ reminders });
});

app.post("/", async (c) => {
  const input = (await c.req.json().catch(() => ({}))) as ReminderInput;
  const built = buildReminder(input, null, c.env.DEFAULT_TIMEZONE);
  if (typeof built === "string") return c.json({ error: built }, 400);
  await insertReminder(c.env.DB, built);
  return c.json({ reminder: built }, 201);
});

// Ad-hoc test send: deliver the given content to the given channels right now.
// Used by the editor's "测试发送" button (works before the reminder is saved).
app.post("/test", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    channel_ids?: string[];
  };
  const ids = Array.isArray(body.channel_ids)
    ? body.channel_ids.filter((x) => typeof x === "string")
    : [];
  if (ids.length === 0) return c.json({ error: "请至少选择一个渠道" }, 400);
  const channels = await getChannelsByIds(c.env.DB, ids);
  if (channels.filter((x) => x.enabled).length === 0) {
    return c.json({ error: "所选渠道均未启用" }, 400);
  }
  const title = (body.title ?? "").trim() || "🔔 测试提醒";
  const results = await sendToChannels(c.env, ids, title, (body.body ?? "").trim());
  return c.json({ results });
});

app.get("/:id", async (c) => {
  const r = await getReminder(c.env.DB, c.req.param("id"));
  if (!r) return c.json({ error: "Not found" }, 404);
  return c.json({ reminder: r });
});

app.put("/:id", async (c) => {
  const existing = await getReminder(c.env.DB, c.req.param("id"));
  if (!existing) return c.json({ error: "Not found" }, 404);
  const input = (await c.req.json().catch(() => ({}))) as ReminderInput;
  const built = buildReminder(input, existing, c.env.DEFAULT_TIMEZONE);
  if (typeof built === "string") return c.json({ error: built }, 400);
  await updateReminderRow(c.env.DB, built);
  return c.json({ reminder: built });
});

app.delete("/:id", async (c) => {
  await deleteReminder(c.env.DB, c.req.param("id"));
  return c.json({ ok: true });
});

// Toggle enabled state and recompute next_run.
app.post("/:id/toggle", async (c) => {
  const r = await getReminder(c.env.DB, c.req.param("id"));
  if (!r) return c.json({ error: "Not found" }, 404);
  const ts = now();
  const enabled = !r.enabled;
  const updated: Reminder = {
    ...r,
    enabled,
    next_run: enabled ? computeNextRun(r, ts) : null,
    updated_at: ts,
  };
  await updateReminderRow(c.env.DB, updated);
  return c.json({ reminder: updated });
});

// Fire a saved reminder immediately (sends its real content, logs deliveries),
// without changing its schedule. Returns per-channel results.
app.post("/:id/test", async (c) => {
  const r = await getReminder(c.env.DB, c.req.param("id"));
  if (!r) return c.json({ error: "Not found" }, 404);
  const { status, results } = await fireReminder(c.env, r);
  return c.json({ status, results });
});

export default app;
