import { Hono } from "hono";
import type { Channel, ChannelType, Env } from "../types";
import {
  deleteChannel,
  getChannel,
  insertChannel,
  listChannels,
  now,
  uid,
  updateChannelRow,
} from "../db";
import { dispatch } from "../channels";

const app = new Hono<{ Bindings: Env }>();

const VALID_TYPES: ChannelType[] = ["telegram", "wechat", "feishu", "email", "bark", "webhook"];

interface ChannelInput {
  type?: ChannelType;
  name?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

// Strip secrets before returning channels to the dashboard. The dashboard only
// needs to know whether a field is configured, not its value.
function redact(ch: Channel): Channel {
  const config: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ch.config)) {
    if (typeof v === "string" && v.length > 0 && isSecretKey(k)) {
      config[k] = "••••••••";
    } else {
      config[k] = v;
    }
  }
  return { ...ch, config };
}

function isSecretKey(k: string): boolean {
  return ["token", "secret", "webhook"].includes(k) || k.toLowerCase().includes("key");
}

app.get("/", async (c) => {
  const channels = (await listChannels(c.env.DB)).map(redact);
  return c.json({ channels });
});

app.post("/", async (c) => {
  const input = (await c.req.json().catch(() => ({}))) as ChannelInput;
  if (!input.type || !VALID_TYPES.includes(input.type)) {
    return c.json({ error: "Invalid channel type" }, 400);
  }
  const name = (input.name ?? "").trim();
  if (!name) return c.json({ error: "Name is required" }, 400);
  const ts = now();
  const channel: Channel = {
    id: uid(),
    type: input.type,
    name,
    config: input.config ?? {},
    enabled: input.enabled ?? true,
    created_at: ts,
    updated_at: ts,
  };
  await insertChannel(c.env.DB, channel);
  return c.json({ channel: redact(channel) }, 201);
});

app.put("/:id", async (c) => {
  const existing = await getChannel(c.env.DB, c.req.param("id"));
  if (!existing) return c.json({ error: "Not found" }, 404);
  const input = (await c.req.json().catch(() => ({}))) as ChannelInput;

  // Merge config: keep existing secret values when the client sends the redacted
  // placeholder back unchanged.
  const incoming = input.config ?? {};
  const merged: Record<string, unknown> = { ...existing.config };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === "••••••••") continue; // unchanged secret
    merged[k] = v;
  }

  const updated: Channel = {
    ...existing,
    type: input.type && VALID_TYPES.includes(input.type) ? input.type : existing.type,
    name: (input.name ?? existing.name).trim() || existing.name,
    config: merged,
    enabled: input.enabled ?? existing.enabled,
    updated_at: now(),
  };
  await updateChannelRow(c.env.DB, updated);
  return c.json({ channel: redact(updated) });
});

app.delete("/:id", async (c) => {
  await deleteChannel(c.env.DB, c.req.param("id"));
  return c.json({ ok: true });
});

// Send a sample message through this channel to verify the configuration.
app.post("/:id/test", async (c) => {
  const ch = await getChannel(c.env.DB, c.req.param("id"));
  if (!ch) return c.json({ error: "Not found" }, 404);
  const res = await dispatch(
    ch,
    "✅ Cloud Reminder 测试通知",
    "This is a test message. If you can read this, the channel works!",
  );
  return c.json(res, res.ok ? 200 : 502);
});

export default app;
