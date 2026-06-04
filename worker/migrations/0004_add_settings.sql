-- Adds the mutable settings store (admin password hash, default timezone).
-- Run once per environment:
--   Local : wrangler d1 execute cloud_reminder --local  --file=./migrations/0004_add_settings.sql
--   Remote: wrangler d1 execute cloud_reminder --remote --file=./migrations/0004_add_settings.sql
-- (Fresh installs already include this table via schema.sql.)

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
