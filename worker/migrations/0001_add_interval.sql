-- Adds interval ("every N units") recurrence support to existing databases.
-- Run once per environment:
--   Local : wrangler d1 execute cloud_reminder --local  --file=./migrations/0001_add_interval.sql
--   Remote: wrangler d1 execute cloud_reminder --remote --file=./migrations/0001_add_interval.sql
-- (Fresh installs already include these columns via schema.sql.)

ALTER TABLE reminders ADD COLUMN interval_unit TEXT;
ALTER TABLE reminders ADD COLUMN interval_value INTEGER;
