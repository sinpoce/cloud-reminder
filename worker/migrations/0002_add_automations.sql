-- Adds the Automations feature (scheduled tasks like DigitalPlat domain renewal).
-- Run once per environment:
--   Local : wrangler d1 execute cloud_reminder --local  --file=./migrations/0002_add_automations.sql
--   Remote: wrangler d1 execute cloud_reminder --remote --file=./migrations/0002_add_automations.sql
-- (Fresh installs already include these tables via schema.sql.)

CREATE TABLE IF NOT EXISTS automations (
  id                 TEXT PRIMARY KEY,
  type               TEXT NOT NULL,
  name               TEXT NOT NULL,
  config             TEXT NOT NULL DEFAULT '{}',
  enabled            INTEGER NOT NULL DEFAULT 1,
  cron_expr          TEXT NOT NULL DEFAULT '0 3 * * *',
  timezone           TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  notify_channel_ids TEXT NOT NULL DEFAULT '[]',
  next_run           INTEGER,
  last_run           INTEGER,
  last_status        TEXT,
  last_detail        TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automations_next_run ON automations (enabled, next_run);

CREATE TABLE IF NOT EXISTS automation_runs (
  id            TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  status        TEXT NOT NULL,
  detail        TEXT,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_runs ON automation_runs (automation_id, created_at);
