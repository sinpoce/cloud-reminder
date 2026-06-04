-- Adds support for in-UI custom (user-authored JS) automation modules.
-- Run once per environment:
--   Local : wrangler d1 execute cloud_reminder --local  --file=./migrations/0003_add_custom_modules.sql
--   Remote: wrangler d1 execute cloud_reminder --remote --file=./migrations/0003_add_custom_modules.sql
-- (Fresh installs already include these columns via schema.sql.)

ALTER TABLE automations ADD COLUMN kind TEXT NOT NULL DEFAULT 'builtin';
ALTER TABLE automations ADD COLUMN code TEXT;
