import type { Automation, AutomationResult, Env } from "./types";
import { runAutomation } from "./automations";
import {
  dueAutomations,
  getChannelsByIds,
  now,
  recordAutomationRun,
  uid,
  updateAutomationRow,
} from "./db";
import { dispatch } from "./channels";
import { nextCronRun } from "./schedule";

export function automationNextRun(a: Automation, fromEpoch: number): number | null {
  try {
    return nextCronRun(a.cron_expr, a.timezone, fromEpoch);
  } catch {
    return null;
  }
}

function buildMessage(a: Automation, result: AutomationResult): { title: string; body: string } {
  const lines = result.items
    .filter((i) => i.action !== "skipped")
    .slice(0, 20)
    .map((i) => `${i.action === "ok" ? "✅" : "❌"} ${i.item}：${i.detail}`);
  const icon = result.status === "success" ? "✅" : result.status === "partial" ? "⚠️" : "❌";
  return {
    title: `${icon} ${a.name}`,
    body: result.summary + (lines.length ? `\n${lines.join("\n")}` : ""),
  };
}

async function notify(env: Env, a: Automation, result: AutomationResult): Promise<void> {
  if (!a.notify_channel_ids.length) return;
  const channels = (await getChannelsByIds(env.DB, a.notify_channel_ids)).filter((c) => c.enabled);
  if (!channels.length) return;
  const { title, body } = buildMessage(a, result);
  await Promise.all(channels.map((ch) => dispatch(ch, title, body, a.timezone).catch(() => undefined)));
}

// Run one automation, persist the run + status, reschedule, and (optionally)
// notify the configured channels.
export async function runAutomationAndRecord(
  env: Env,
  a: Automation,
  opts: { notify?: boolean } = {},
): Promise<AutomationResult> {
  let result: AutomationResult;
  try {
    result = await runAutomation(a);
  } catch (e) {
    result = {
      status: "failed",
      summary: e instanceof Error ? e.message : "运行出错",
      items: [],
    };
  }

  const ts = now();
  await recordAutomationRun(env.DB, {
    id: uid(),
    automation_id: a.id,
    status: result.status,
    detail: result.summary,
    created_at: ts,
  });

  await updateAutomationRow(env.DB, {
    ...a,
    // Persist any config changes the run requested (e.g. a rotated refresh_token).
    config: result.configPatch ? { ...a.config, ...result.configPatch } : a.config,
    last_run: ts,
    last_status: result.status,
    last_detail: result.summary,
    next_run: a.enabled ? automationNextRun(a, ts) : null,
    updated_at: ts,
  });

  // Modules can explicitly control notification via result.notify; otherwise
  // fall back to "notify on failure, or when something actually succeeded".
  const shouldNotify =
    typeof result.notify === "boolean"
      ? result.notify
      : result.status !== "success" || result.items.some((i) => i.action === "ok");
  if (opts.notify && shouldNotify) {
    await notify(env, a, result);
  }

  return result;
}

// Called by the cron trigger each minute alongside the reminder dispatcher.
export async function runDueAutomations(env: Env): Promise<number> {
  const at = now();
  const due = await dueAutomations(env.DB, at);
  for (const a of due) {
    await runAutomationAndRecord(env, a, { notify: true });
  }
  return due.length;
}
