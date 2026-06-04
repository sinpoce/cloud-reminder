-- ─────────────────────────────────────────────────────────────────────────────
-- Cloud Reminder — D1 schema
-- All timestamps are stored as Unix epoch SECONDS (UTC).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channels (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,            -- 'telegram' | 'wechat' | 'feishu' | 'webhook'
  name        TEXT NOT NULL,
  config      TEXT NOT NULL DEFAULT '{}', -- JSON: tokens / webhook urls / chat ids
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  schedule_type TEXT NOT NULL DEFAULT 'once', -- 'once' | 'interval' | 'cron'
  run_at        INTEGER,                       -- epoch seconds ('once': fire time, 'interval': start/anchor)
  cron_expr     TEXT,                          -- 5-field cron (for 'cron')
  interval_unit  TEXT,                         -- 'minute'|'hour'|'day'|'week'|'month'|'year' (for 'interval')
  interval_value INTEGER,                      -- repeat every N units (for 'interval')
  timezone      TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  channel_ids   TEXT NOT NULL DEFAULT '[]',    -- JSON array of channel ids
  enabled       INTEGER NOT NULL DEFAULT 1,
  next_run      INTEGER,                        -- epoch seconds, NULL when finished
  last_run      INTEGER,
  last_status   TEXT,                           -- 'sent' | 'failed' | 'partial'
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminders_next_run
  ON reminders (enabled, next_run);

CREATE TABLE IF NOT EXISTS deliveries (
  id          TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL,
  channel_id  TEXT,
  channel_type TEXT,
  status      TEXT NOT NULL,            -- 'success' | 'failed'
  detail      TEXT,                     -- error text or provider response
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliveries_reminder
  ON deliveries (reminder_id, created_at);

CREATE INDEX IF NOT EXISTS idx_deliveries_created
  ON deliveries (created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Automations: scheduled tasks (e.g. auto-renew DigitalPlat free domains).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automations (
  id                 TEXT PRIMARY KEY,
  type               TEXT NOT NULL,            -- builtin module key, or 'custom'
  kind               TEXT NOT NULL DEFAULT 'builtin', -- 'builtin' | 'custom'
  code               TEXT,                     -- user JS source (for kind='custom')
  name               TEXT NOT NULL,
  config             TEXT NOT NULL DEFAULT '{}', -- JSON: api_token, options…
  enabled            INTEGER NOT NULL DEFAULT 1,
  cron_expr          TEXT NOT NULL DEFAULT '0 3 * * *',
  timezone           TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  notify_channel_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of channel ids
  next_run           INTEGER,
  last_run           INTEGER,
  last_status        TEXT,                     -- 'success' | 'failed' | 'partial'
  last_detail        TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automations_next_run
  ON automations (enabled, next_run);

CREATE TABLE IF NOT EXISTS automation_runs (
  id            TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  status        TEXT NOT NULL,
  detail        TEXT,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_runs
  ON automation_runs (automation_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Mutable app settings (admin password hash, default timezone, …).
-- The ADMIN_PASSWORD secret only bootstraps the first login; once changed in the
-- dashboard, the hash stored here takes precedence.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
