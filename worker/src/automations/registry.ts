import type { AutomationModule } from "./module";
import digitalplat from "./modules/digitalplat";
import httpCheck from "./modules/httpcheck";
import e5renew from "./modules/e5renew";

// ─────────────────────────────────────────────────────────────────────────────
// Automation module registry.
//
// Every module the dashboard can use is listed here. To add your own:
//   1. Create src/automations/modules/<name>.ts (copy modules/TEMPLATE.ts).
//   2. Import it below and add it to MODULES.
//   3. Redeploy. It then appears in the dashboard's module catalog.
// ─────────────────────────────────────────────────────────────────────────────
export const MODULES: Record<string, AutomationModule> = {
  [digitalplat.key]: digitalplat,
  [e5renew.key]: e5renew,
  [httpCheck.key]: httpCheck,
  // [myModule.key]: myModule,
};

export function getModule(key: string): AutomationModule | null {
  return MODULES[key] ?? null;
}

// Public, serialisable description of every module (no run/test fns) — sent to
// the dashboard so it can render the catalog and per-module config forms.
export function moduleCatalog() {
  return Object.values(MODULES).map((m) => ({
    key: m.key,
    label: m.label,
    description: m.description,
    icon: m.icon ?? "puzzle",
    docsUrl: m.docsUrl ?? null,
    fields: m.fields,
    hasTest: typeof m.test === "function",
    hasInspect: typeof m.inspect === "function",
  }));
}
