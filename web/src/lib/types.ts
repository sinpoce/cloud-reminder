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
  run_at: number | null;
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
  reminder_title: string | null;
  channel_type: string | null;
  status: "success" | "failed";
  detail: string | null;
  created_at: number;
}

export interface Overview {
  stats: {
    total: number;
    active: number;
    channels: number;
    sentToday: number;
    failedToday: number;
  };
  upcoming: Array<{
    id: string;
    title: string;
    schedule_type: ScheduleType;
    run_at: number | null;
    cron_expr: string | null;
    interval_unit: IntervalUnit | null;
    interval_value: number | null;
    timezone: string;
    next_run: number | null;
  }>;
  server_time: number;
}

// ── Automations ──────────────────────────────────────────────────────────────
export type AutomationType = string; // a registered module key, or "custom"
export type AutomationKind = "builtin" | "custom";
export type RunStatus = "success" | "failed" | "partial";

export interface Automation {
  id: string;
  type: AutomationType;
  kind: AutomationKind;
  code: string | null;
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

export interface AutomationItemResult {
  item: string;
  action: "ok" | "skipped" | "failed";
  detail: string;
}

export interface AutomationResult {
  status: RunStatus;
  summary: string;
  items: AutomationItemResult[];
  log?: string;
}

export interface AutomationFieldSpec {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  type?: string;
  placeholder?: string;
  hint?: string;
}

// A registered automation module (from /api/config.modules).
export interface ModuleSpec {
  key: string;
  label: string;
  description: string;
  icon: string;
  docsUrl: string | null;
  fields: AutomationFieldSpec[];
  hasTest: boolean;
  hasInspect: boolean;
}

// A manageable item surfaced by a module's inspect() (e.g. a domain).
export interface ManagedItem {
  id: string;
  title: string;
  subtitle?: string;
  status?: "ok" | "warn" | "danger";
  canAction?: boolean;
  auto?: boolean;
}

export interface InspectResult {
  ok: boolean;
  detail: string;
  items: ManagedItem[];
  actionLabel?: string;
}

export interface ChannelTestResult {
  channel_id: string;
  channel_type: ChannelType;
  name: string;
  ok: boolean;
  detail: string | null;
}

export interface ChannelFieldSpec {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  type?: string;
  default?: string;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  showIf?: { key: string; in: string[] };
}

export interface AppConfig {
  channelSchema: Record<ChannelType, { label: string; fields: ChannelFieldSpec[] }>;
  modules: ModuleSpec[];
  timezones: string[];
  defaultTimezone: string;
  serverTime: number;
}
