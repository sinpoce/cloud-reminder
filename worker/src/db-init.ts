// Self-initialising schema: runs idempotent CREATE TABLE IF NOT EXISTS once per
// isolate, so a freshly-provisioned D1 (e.g. from a one-click deploy) needs no
// manual `db:init` / migration step. Kept in sync with schema.sql.

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
    schedule_type TEXT NOT NULL DEFAULT 'once', run_at INTEGER, cron_expr TEXT,
    interval_unit TEXT, interval_value INTEGER,
    timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai', channel_ids TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1, next_run INTEGER, last_run INTEGER, last_status TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_reminders_next_run ON reminders (enabled, next_run)`,
  `CREATE TABLE IF NOT EXISTS deliveries (
    id TEXT PRIMARY KEY, reminder_id TEXT NOT NULL, channel_id TEXT, channel_type TEXT,
    status TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_deliveries_reminder ON deliveries (reminder_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_deliveries_created ON deliveries (created_at)`,
  `CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'builtin', code TEXT,
    name TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1,
    cron_expr TEXT NOT NULL DEFAULT '0 3 * * *', timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    notify_channel_ids TEXT NOT NULL DEFAULT '[]', next_run INTEGER, last_run INTEGER,
    last_status TEXT, last_detail TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_automations_next_run ON automations (enabled, next_run)`,
  `CREATE TABLE IF NOT EXISTS automation_runs (
    id TEXT PRIMARY KEY, automation_id TEXT NOT NULL, status TEXT NOT NULL, detail TEXT,
    created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_automation_runs ON automation_runs (automation_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
];

let initialized: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  if (!initialized) {
    initialized = db
      .batch(STATEMENTS.map((s) => db.prepare(s)))
      .then(() => undefined)
      .catch((e) => {
        initialized = null; // allow retry on next request
        throw e;
      });
  }
  return initialized;
}
