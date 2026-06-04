import type { SendResult } from "../types";

// 飞书 / Lark custom bot webhook, with optional signature verification.
export interface FeishuConfig {
  webhook: string;
  secret?: string;
}

async function feishuSign(secret: string, timestamp: number): Promise<string> {
  const stringToSign = `${timestamp}\n${secret}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(stringToSign),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new Uint8Array(0));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function sendFeishu(
  config: FeishuConfig,
  title: string,
  body: string,
  rendered?: string,
): Promise<SendResult> {
  if (!config.webhook) return { ok: false, detail: "Missing Feishu webhook URL" };
  const text = typeof rendered === "string" ? rendered : body ? `${title}\n${body}` : title;
  const payload: Record<string, unknown> = {
    msg_type: "text",
    content: { text },
  };
  if (config.secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    payload.timestamp = String(timestamp);
    payload.sign = await feishuSign(config.secret, timestamp);
  }
  try {
    const res = await fetch(config.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      code?: number;
      StatusCode?: number;
      msg?: string;
    };
    const code = data.code ?? data.StatusCode;
    if (res.ok && (code === 0 || code === undefined)) return { ok: true };
    return { ok: false, detail: data.msg || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Network error" };
  }
}
