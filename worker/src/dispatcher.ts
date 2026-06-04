import type { Env, Reminder } from "./types";
import { dispatch } from "./channels";
import {
  dueReminders,
  getChannelsByIds,
  now,
  recordDelivery,
  uid,
  updateReminderRow,
} from "./db";
import { nextCronRun, nextIntervalRun } from "./schedule";

// Compute the next epoch second this reminder should fire, searching strictly
// after `fromEpoch`. Returns null when the reminder has no future occurrence.
export function computeNextRun(r: Reminder, fromEpoch: number): number | null {
  if (r.schedule_type === "once") {
    if (r.run_at && r.run_at > fromEpoch) return r.run_at;
    return null; // one-shot already in the past → fires once, then finishes
  }
  if (r.schedule_type === "interval" && r.interval_unit && r.interval_value && r.run_at) {
    return nextIntervalRun(r.run_at, r.interval_unit, r.interval_value, r.timezone, fromEpoch);
  }
  if (r.schedule_type === "cron" && r.cron_expr) {
    try {
      return nextCronRun(r.cron_expr, r.timezone, fromEpoch);
    } catch {
      return null;
    }
  }
  return null;
}

export type FireStatus = "sent" | "failed" | "partial";
export interface ChannelResult {
  channel_id: string;
  channel_type: string;
  name: string;
  ok: boolean;
  detail: string | null;
}

// Send arbitrary content to a set of channels. Returns per-channel results
// (does not touch the deliveries log) — used for ad-hoc test sends.
export async function sendToChannels(
  env: Env,
  channelIds: string[],
  title: string,
  body: string,
  tz?: string,
): Promise<ChannelResult[]> {
  const channels = (await getChannelsByIds(env.DB, channelIds)).filter((c) => c.enabled);
  return Promise.all(
    channels.map(async (ch) => {
      const res = await dispatch(ch, title, body, tz);
      return {
        channel_id: ch.id,
        channel_type: ch.type,
        name: ch.name,
        ok: res.ok,
        detail: res.detail ?? null,
      };
    }),
  );
}

// Send one reminder to all of its channels, logging each delivery.
// Returns the aggregate status and per-channel results.
export async function fireReminder(
  env: Env,
  r: Reminder,
): Promise<{ status: FireStatus; results: ChannelResult[] }> {
  const channels = (await getChannelsByIds(env.DB, r.channel_ids)).filter((c) => c.enabled);

  if (channels.length === 0) {
    await recordDelivery(env.DB, {
      id: uid(),
      reminder_id: r.id,
      channel_id: null,
      channel_type: null,
      status: "failed",
      detail: "No enabled channels configured",
      created_at: now(),
    });
    return { status: "failed", results: [] };
  }

  const results = await Promise.all(
    channels.map(async (ch): Promise<ChannelResult> => {
      const res = await dispatch(ch, r.title, r.body, r.timezone);
      await recordDelivery(env.DB, {
        id: uid(),
        reminder_id: r.id,
        channel_id: ch.id,
        channel_type: ch.type,
        status: res.ok ? "success" : "failed",
        detail: res.detail ?? null,
        created_at: now(),
      });
      return { channel_id: ch.id, channel_type: ch.type, name: ch.name, ok: res.ok, detail: res.detail ?? null };
    }),
  );

  const okCount = results.filter((x) => x.ok).length;
  const status: FireStatus = okCount === results.length ? "sent" : okCount === 0 ? "failed" : "partial";
  return { status, results };
}

// Called by the cron trigger every minute: fire everything that's due and
// reschedule recurring reminders.
export async function runDueReminders(env: Env): Promise<number> {
  const at = now();
  const due = await dueReminders(env.DB, at);
  for (const r of due) {
    let status: FireStatus;
    try {
      status = (await fireReminder(env, r)).status;
    } catch {
      status = "failed";
    }
    const next = computeNextRun(r, at);
    await updateReminderRow(env.DB, {
      ...r,
      last_run: at,
      last_status: status,
      next_run: next,
      updated_at: at,
    });
  }
  return due.length;
}
