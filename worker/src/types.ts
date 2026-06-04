export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  DEFAULT_TIMEZONE: string;
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
  // Present only in the unified deploy (Worker also serves the built SPA).
  ASSETS?: Fetcher;
}

export type ChannelType = "telegram" | "wechat" | "feishu" | "email" | "bark" | "webhook";

export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export type ScheduleType = "once" | "interval" | "cron";

export type IntervalUnit = "minute" | "hour" | "day" | "week" | "month" | "year";

export interface Reminder {
  id: string;
  title: string;
  body: string;
  schedule_type: ScheduleType;
  run_at: number | null; // 'once': fire time · 'interval': anchor/start time
  cron_expr: string | null;
  interval_unit: IntervalUnit | null;
  interval_value: number | null;
  timezone: string;
  channel_ids: string[];
  enabled: boolean;
  next_run: number | null;
  last_run: number | null;
  last_status: "sent" | "failed" | "partial" | null;
  created_at: number;
  updated_at: number;
}

export interface Delivery {
  id: string;
  reminder_id: string;
  channel_id: string | null;
  channel_type: string | null;
  status: "success" | "failed";
  detail: string | null;
  created_at: number;
}

export interface SendResult {
  ok: boolean;
  detail?: string;
}

// ── Automations ──────────────────────────────────────────────────────────────
// An automation's `type` is the key of a registered module (see automations/registry.ts).
export type AutomationType = string;
export type RunStatus = "success" | "failed" | "partial";

export type AutomationKind = "builtin" | "custom";

export interface Automation {
  id: string;
  type: AutomationType; // builtin module key, or "custom"
  kind: AutomationKind;
  code: string | null; // user JS source (kind="custom")
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  cron_expr: string;
  timezone: string;
  notify_channel_ids: string[];
  next_run: number | null;
  last_run: number | null;
  last_status: RunStatus | null;
  last_detail: string | null;
  created_at: number;
  updated_at: number;
}

export interface AutomationRun {
  id: string;
  automation_id: string;
  status: RunStatus;
  detail: string | null;
  created_at: number;
}

// Per-item result produced by an automation run (e.g. one domain / one URL).
export interface AutomationItemResult {
  item: string;
  action: "ok" | "skipped" | "failed";
  detail: string;
}

export interface AutomationResult {
  status: RunStatus;
  summary: string;
  items: AutomationItemResult[];
  log?: string; // optional free-form log lines emitted via ctx.log()
  // Optional config values to persist back after a run (e.g. a rotated
  // refresh_token). Merged into the automation's stored config by the runner.
  configPatch?: Record<string, unknown>;
  // Explicit notify override. When set, the runner uses it instead of its
  // default heuristic — e.g. E5 only notifies after sustained (≥10 min) failure.
  notify?: boolean;
}
