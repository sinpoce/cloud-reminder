import type { Automation, AutomationRun, Channel, Delivery, Reminder } from "./types";

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

export function uid(): string {
  return crypto.randomUUID();
}

// ── row mappers ──────────────────────────────────────────────────────────────
function mapChannel(r: Record<string, unknown>): Channel {
  return {
    id: r.id as string,
    type: r.type as Channel["type"],
    name: r.name as string,
    config: safeJSON(r.config as string, {}),
    enabled: !!r.enabled,
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
  };
}

function mapReminder(r: Record<string, unknown>): Reminder {
  return {
    id: r.id as string,
    title: r.title as string,
    body: (r.body as string) ?? "",
    schedule_type: r.schedule_type as Reminder["schedule_type"],
    run_at: (r.run_at as number) ?? null,
    cron_expr: (r.cron_expr as string) ?? null,
    interval_unit: (r.interval_unit as Reminder["interval_unit"]) ?? null,
    interval_value: (r.interval_value as number) ?? null,
    timezone: r.timezone as string,
    channel_ids: safeJSON(r.channel_ids as string, []),
    enabled: !!r.enabled,
    next_run: (r.next_run as number) ?? null,
    last_run: (r.last_run as number) ?? null,
    last_status: (r.last_status as Reminder["last_status"]) ?? null,
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
  };
}

function mapDelivery(r: Record<string, unknown>): Delivery {
  return {
    id: r.id as string,
    reminder_id: r.reminder_id as string,
    channel_id: (r.channel_id as string) ?? null,
    channel_type: (r.channel_type as string) ?? null,
    status: r.status as Delivery["status"],
    detail: (r.detail as string) ?? null,
    created_at: r.created_at as number,
  };
}

function safeJSON<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// ── channels ─────────────────────────────────────────────────────────────────
export async function listChannels(db: D1Database): Promise<Channel[]> {
  const { results } = await db
    .prepare("SELECT * FROM channels ORDER BY created_at DESC")
    .all();
  return (results as Record<string, unknown>[]).map(mapChannel);
}

export async function getChannel(db: D1Database, id: string): Promise<Channel | null> {
  const row = await db.prepare("SELECT * FROM channels WHERE id = ?").bind(id).first();
  return row ? mapChannel(row as Record<string, unknown>) : null;
}

export async function getChannelsByIds(db: D1Database, ids: string[]): Promise<Channel[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT * FROM channels WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all();
  return (results as Record<string, unknown>[]).map(mapChannel);
}

export async function insertChannel(db: D1Database, c: Channel): Promise<void> {
  await db
    .prepare(
      `INSERT INTO channels (id, type, name, config, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(c.id, c.type, c.name, JSON.stringify(c.config), c.enabled ? 1 : 0, c.created_at, c.updated_at)
    .run();
}

export async function updateChannelRow(db: D1Database, c: Channel): Promise<void> {
  await db
    .prepare(
      `UPDATE channels SET type=?, name=?, config=?, enabled=?, updated_at=? WHERE id=?`,
    )
    .bind(c.type, c.name, JSON.stringify(c.config), c.enabled ? 1 : 0, c.updated_at, c.id)
    .run();
}

export async function deleteChannel(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM channels WHERE id = ?").bind(id).run();
}

// ── reminders ────────────────────────────────────────────────────────────────
export async function listReminders(db: D1Database): Promise<Reminder[]> {
  const { results } = await db
    .prepare("SELECT * FROM reminders ORDER BY (next_run IS NULL), next_run ASC, created_at DESC")
    .all();
  return (results as Record<string, unknown>[]).map(mapReminder);
}

export async function getReminder(db: D1Database, id: string): Promise<Reminder | null> {
  const row = await db.prepare("SELECT * FROM reminders WHERE id = ?").bind(id).first();
  return row ? mapReminder(row as Record<string, unknown>) : null;
}

export async function dueReminders(db: D1Database, atEpoch: number): Promise<Reminder[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM reminders WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ? ORDER BY next_run ASC LIMIT 100",
    )
    .bind(atEpoch)
    .all();
  return (results as Record<string, unknown>[]).map(mapReminder);
}

export async function insertReminder(db: D1Database, r: Reminder): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reminders
        (id, title, body, schedule_type, run_at, cron_expr, interval_unit, interval_value,
         timezone, channel_ids, enabled, next_run, last_run, last_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      r.id, r.title, r.body, r.schedule_type, r.run_at, r.cron_expr, r.interval_unit,
      r.interval_value, r.timezone, JSON.stringify(r.channel_ids), r.enabled ? 1 : 0,
      r.next_run, r.last_run, r.last_status, r.created_at, r.updated_at,
    )
    .run();
}

export async function updateReminderRow(db: D1Database, r: Reminder): Promise<void> {
  await db
    .prepare(
      `UPDATE reminders SET
        title=?, body=?, schedule_type=?, run_at=?, cron_expr=?, interval_unit=?,
        interval_value=?, timezone=?, channel_ids=?, enabled=?, next_run=?, last_run=?,
        last_status=?, updated_at=?
       WHERE id=?`,
    )
    .bind(
      r.title, r.body, r.schedule_type, r.run_at, r.cron_expr, r.interval_unit,
      r.interval_value, r.timezone, JSON.stringify(r.channel_ids), r.enabled ? 1 : 0,
      r.next_run, r.last_run, r.last_status, r.updated_at, r.id,
    )
    .run();
}

export async function deleteReminder(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM reminders WHERE id = ?").bind(id).run();
}

// ── deliveries ───────────────────────────────────────────────────────────────
export async function recordDelivery(db: D1Database, d: Delivery): Promise<void> {
  await db
    .prepare(
      `INSERT INTO deliveries (id, reminder_id, channel_id, channel_type, status, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(d.id, d.reminder_id, d.channel_id, d.channel_type, d.status, d.detail, d.created_at)
    .run();
}

export async function listDeliveries(db: D1Database, limit = 50): Promise<Delivery[]> {
  const { results } = await db
    .prepare("SELECT * FROM deliveries ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .all();
  return (results as Record<string, unknown>[]).map(mapDelivery);
}

export async function clearDeliveries(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM deliveries").run();
}

// ── automations ──────────────────────────────────────────────────────────────
function mapAutomation(r: Record<string, unknown>): Automation {
  return {
    id: r.id as string,
    type: r.type as Automation["type"],
    kind: ((r.kind as string) === "custom" ? "custom" : "builtin") as Automation["kind"],
    code: (r.code as string) ?? null,
    name: r.name as string,
    config: safeJSON(r.config as string, {}),
    enabled: !!r.enabled,
    cron_expr: r.cron_expr as string,
    timezone: r.timezone as string,
    notify_channel_ids: safeJSON(r.notify_channel_ids as string, []),
    next_run: (r.next_run as number) ?? null,
    last_run: (r.last_run as number) ?? null,
    last_status: (r.last_status as Automation["last_status"]) ?? null,
    last_detail: (r.last_detail as string) ?? null,
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
  };
}

export async function listAutomations(db: D1Database): Promise<Automation[]> {
  const { results } = await db
    .prepare("SELECT * FROM automations ORDER BY created_at DESC")
    .all();
  return (results as Record<string, unknown>[]).map(mapAutomation);
}

export async function getAutomation(db: D1Database, id: string): Promise<Automation | null> {
  const row = await db.prepare("SELECT * FROM automations WHERE id = ?").bind(id).first();
  return row ? mapAutomation(row as Record<string, unknown>) : null;
}

export async function dueAutomations(db: D1Database, atEpoch: number): Promise<Automation[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM automations WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ? ORDER BY next_run ASC LIMIT 50",
    )
    .bind(atEpoch)
    .all();
  return (results as Record<string, unknown>[]).map(mapAutomation);
}

export async function insertAutomation(db: D1Database, a: Automation): Promise<void> {
  await db
    .prepare(
      `INSERT INTO automations
        (id, type, kind, code, name, config, enabled, cron_expr, timezone, notify_channel_ids,
         next_run, last_run, last_status, last_detail, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      a.id, a.type, a.kind, a.code, a.name, JSON.stringify(a.config), a.enabled ? 1 : 0,
      a.cron_expr, a.timezone, JSON.stringify(a.notify_channel_ids), a.next_run, a.last_run,
      a.last_status, a.last_detail, a.created_at, a.updated_at,
    )
    .run();
}

export async function updateAutomationRow(db: D1Database, a: Automation): Promise<void> {
  await db
    .prepare(
      `UPDATE automations SET
        type=?, kind=?, code=?, name=?, config=?, enabled=?, cron_expr=?, timezone=?,
        notify_channel_ids=?, next_run=?, last_run=?, last_status=?, last_detail=?, updated_at=?
       WHERE id=?`,
    )
    .bind(
      a.type, a.kind, a.code, a.name, JSON.stringify(a.config), a.enabled ? 1 : 0, a.cron_expr,
      a.timezone, JSON.stringify(a.notify_channel_ids), a.next_run, a.last_run, a.last_status,
      a.last_detail, a.updated_at, a.id,
    )
    .run();
}

export async function deleteAutomation(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM automations WHERE id = ?").bind(id).run();
}

export async function recordAutomationRun(db: D1Database, run: AutomationRun): Promise<void> {
  await db
    .prepare(
      "INSERT INTO automation_runs (id, automation_id, status, detail, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(run.id, run.automation_id, run.status, run.detail, run.created_at)
    .run();
}

// ── settings (key/value) ─────────────────────────────────────────────────────
export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function deleteSetting(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM settings WHERE key = ?").bind(key).run();
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?")
    .bind(key, value, value)
    .run();
}

export async function listAutomationRuns(
  db: D1Database,
  automationId: string,
  limit = 20,
): Promise<AutomationRun[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .bind(automationId, limit)
    .all();
  return (results as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    automation_id: r.automation_id as string,
    status: r.status as AutomationRun["status"],
    detail: (r.detail as string) ?? null,
    created_at: r.created_at as number,
  }));
}
