import type {
  AppConfig,
  Automation,
  AutomationResult,
  AutomationRun,
  AutomationType,
  Channel,
  ChannelTestResult,
  ChannelType,
  Delivery,
  InspectResult,
  Overview,
  Reminder,
} from "./types";

interface AutomationBody {
  type?: AutomationType;
  kind?: "builtin" | "custom";
  code?: string;
  name: string;
  config: Record<string, unknown>;
  enabled?: boolean;
  cron_expr: string;
  timezone: string;
  notify_channel_ids: string[];
}

const BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const TOKEN_KEY = "cr_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  // A 401 on an authenticated request means the session expired → redirect to
  // login. A 401 without a token (e.g. wrong password on /api/login) is a
  // normal error — fall through and surface the server's message instead.
  if (res.status === 401 && token) {
    clearToken();
    window.dispatchEvent(new CustomEvent("cr:unauthorized"));
    throw new ApiError("登录已过期，请重新登录", 401);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error || `HTTP ${res.status}`, res.status);
  }
  return data as T;
}

export const api = {
  // auth
  async login(password: string): Promise<string> {
    const data = await request<{ token: string }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    return data.token;
  },
  me: () => request<{ ok: boolean }>("/api/me"),

  // settings & account
  getSettings: () =>
    request<{ defaultTimezone: string; hasCustomPassword: boolean }>("/api/settings"),
  updateSettings: (body: { defaultTimezone?: string }) =>
    request<{ ok: boolean }>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  changePassword: (body: { current_password: string; new_password: string }) =>
    request<{ ok: boolean }>("/api/account/password", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // meta
  config: () => request<AppConfig>("/api/config"),
  overview: () => request<Overview>("/api/overview"),
  deliveries: (limit = 40) =>
    request<{ deliveries: Delivery[] }>(`/api/deliveries?limit=${limit}`).then((d) => d.deliveries),
  clearDeliveries: () => request<{ ok: boolean }>("/api/deliveries", { method: "DELETE" }),

  // reminders
  listReminders: () =>
    request<{ reminders: Reminder[] }>("/api/reminders").then((d) => d.reminders),
  createReminder: (body: Partial<Reminder> & { local_datetime?: string }) =>
    request<{ reminder: Reminder }>("/api/reminders", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((d) => d.reminder),
  updateReminder: (id: string, body: Partial<Reminder> & { local_datetime?: string }) =>
    request<{ reminder: Reminder }>(`/api/reminders/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }).then((d) => d.reminder),
  deleteReminder: (id: string) =>
    request<{ ok: boolean }>(`/api/reminders/${id}`, { method: "DELETE" }),
  toggleReminder: (id: string) =>
    request<{ reminder: Reminder }>(`/api/reminders/${id}/toggle`, { method: "POST" }).then(
      (d) => d.reminder,
    ),
  testReminder: (id: string) =>
    request<{ status: string; results: ChannelTestResult[] }>(
      `/api/reminders/${id}/test`,
      { method: "POST" },
    ),
  // Ad-hoc test: send given content to channels (works before saving).
  testSend: (body: { title: string; body: string; channel_ids: string[] }) =>
    request<{ results: ChannelTestResult[] }>("/api/reminders/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // channels
  listChannels: () =>
    request<{ channels: Channel[] }>("/api/channels").then((d) => d.channels),
  createChannel: (body: { type: ChannelType; name: string; config: Record<string, unknown>; enabled?: boolean }) =>
    request<{ channel: Channel }>("/api/channels", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((d) => d.channel),
  updateChannel: (id: string, body: Partial<Channel>) =>
    request<{ channel: Channel }>(`/api/channels/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }).then((d) => d.channel),
  deleteChannel: (id: string) =>
    request<{ ok: boolean }>(`/api/channels/${id}`, { method: "DELETE" }),
  testChannel: (id: string) =>
    request<{ ok: boolean; detail?: string }>(`/api/channels/${id}/test`, { method: "POST" }),

  // automations
  listAutomations: () =>
    request<{ automations: Automation[] }>("/api/automations").then((d) => d.automations),
  createAutomation: (body: AutomationBody) =>
    request<{ automation: Automation }>("/api/automations", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((d) => d.automation),
  updateAutomation: (id: string, body: Partial<AutomationBody>) =>
    request<{ automation: Automation }>(`/api/automations/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }).then((d) => d.automation),
  deleteAutomation: (id: string) =>
    request<{ ok: boolean }>(`/api/automations/${id}`, { method: "DELETE" }),
  toggleAutomation: (id: string) =>
    request<{ automation: Automation }>(`/api/automations/${id}/toggle`, {
      method: "POST",
    }).then((d) => d.automation),
  runAutomation: (id: string) =>
    request<{ result: AutomationResult }>(`/api/automations/${id}/run`, {
      method: "POST",
    }).then((d) => d.result),
  testAutomation: (id: string) =>
    request<{ ok: boolean; detail: string; domains?: string[] }>(
      `/api/automations/${id}/test`,
      { method: "POST" },
    ),
  automationRuns: (id: string) =>
    request<{ runs: AutomationRun[] }>(`/api/automations/${id}/runs`).then((d) => d.runs),
  // List a module's manageable items (e.g. DigitalPlat domains).
  inspectAutomation: (body: { id?: string; type: string; config: Record<string, unknown> }) =>
    request<InspectResult>("/api/automations/inspect", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // Run a per-item action (e.g. renew one domain).
  actAutomation: (body: {
    id?: string;
    type: string;
    config: Record<string, unknown>;
    action: string;
    item: string;
  }) =>
    request<{ ok: boolean; detail: string }>("/api/automations/act", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  // Microsoft 365 E5 OAuth login: start (returns the Microsoft authorize URL)
  // and result (poll for the refresh_token once the popup finishes).
  e5AuthStart: (body: {
    client_id: string;
    client_secret?: string;
    tenant?: string;
    redirect_uri: string;
    login_hint?: string;
  }) =>
    request<{ authUrl: string; state: string }>("/api/automations/e5/auth-start", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  e5AuthResult: (state: string) =>
    request<{ ok?: boolean; pending?: boolean; refresh_token?: string; tenant?: string; error?: string }>(
      `/api/automations/e5/auth-result?state=${encodeURIComponent(state)}`,
    ),
};
