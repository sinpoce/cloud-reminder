import type { AutomationResult } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Automation module interface.
//
// An automation "module" is a self-contained, reusable task (e.g. renew
// DigitalPlat domains, ping a URL). Modules are plain code — they live in
// src/automations/modules/ and are registered in registry.ts. The dashboard
// reads the registry and lets users create scheduled instances of any module
// and fill in its `fields`.
//
// To add your own module: copy modules/TEMPLATE.ts, implement `run`, then
// register it in registry.ts and redeploy. (Cloudflare Workers disallow
// evaluating code from strings, so modules must be real files, not DB text.)
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleField {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean; // stored value is redacted when read back by the dashboard
  type?: "text" | "number" | "textarea";
  placeholder?: string;
  hint?: string;
}

export interface ModuleContext {
  // User-configured values for this automation instance (keyed by field key).
  config: Record<string, unknown>;
  // Emit a progress/log line, surfaced in the run result.
  log: (message: string) => void;
}

// A manageable item surfaced by a module's inspect() (e.g. a domain). The
// dashboard renders each with a per-item action button and an auto on/off switch.
export interface ManagedItem {
  id: string; // stable id passed back to act() (e.g. the domain name)
  title: string; // display name
  subtitle?: string; // e.g. expiry date + days remaining
  status?: "ok" | "warn" | "danger"; // colour hint (warn = in renewal window)
  canAction?: boolean; // whether the per-item action is currently allowed
  auto?: boolean; // whether this item is included in the scheduled (auto) run
}

export interface InspectResult {
  ok: boolean;
  detail: string;
  items: ManagedItem[];
  actionLabel?: string; // label for the per-item action button (e.g. "续期")
}

export interface AutomationModule {
  key: string; // unique id, stored as automation.type (e.g. "digitalplat_renew")
  label: string;
  description: string;
  icon?: string; // hint for the dashboard icon (e.g. "globe", "activity")
  docsUrl?: string;
  fields: ModuleField[];
  // The task itself. Should never throw — return a failed result instead.
  run: (ctx: ModuleContext) => Promise<AutomationResult>;
  // Optional connectivity/credential check for the "Test" button.
  test?: (ctx: ModuleContext) => Promise<{ ok: boolean; detail: string }>;
  // Optional: list manageable items (e.g. domains) for an interactive panel.
  inspect?: (ctx: ModuleContext) => Promise<InspectResult>;
  // Optional: run a per-item action (e.g. renew one domain).
  act?: (ctx: ModuleContext, action: string, itemId: string) => Promise<{ ok: boolean; detail: string }>;
}

// Convenience for modules: build a result from per-item outcomes.
export function summarize(
  items: AutomationResult["items"],
  emptySummary = "无需处理",
): AutomationResult {
  const ok = items.filter((i) => i.action === "ok").length;
  const failed = items.filter((i) => i.action === "failed").length;
  const skipped = items.filter((i) => i.action === "skipped").length;
  const status: AutomationResult["status"] =
    failed > 0 ? (ok > 0 ? "partial" : "failed") : "success";
  const parts: string[] = [];
  if (ok) parts.push(`成功 ${ok} 个`);
  if (failed) parts.push(`失败 ${failed} 个`);
  if (skipped) parts.push(`跳过 ${skipped} 个`);
  return { status, summary: parts.length ? parts.join("，") : emptySummary, items };
}
