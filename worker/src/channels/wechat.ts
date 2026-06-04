import type { SendResult } from "../types";

// 企业微信群机器人 (WeCom group bot) webhook.
// Create one in a WeCom group → "添加群机器人", then paste the Webhook URL.
export interface WechatConfig {
  webhook: string;
}

export async function sendWechat(
  config: WechatConfig,
  title: string,
  body: string,
  rendered?: string,
): Promise<SendResult> {
  if (!config.webhook) return { ok: false, detail: "Missing WeCom webhook URL" };
  const content =
    typeof rendered === "string" ? rendered : body ? `**${title}**\n${body}` : `**${title}**`;
  try {
    const res = await fetch(config.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "markdown", markdown: { content } }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      errcode?: number;
      errmsg?: string;
    };
    if (res.ok && (data.errcode === 0 || data.errcode === undefined)) {
      return { ok: true };
    }
    return { ok: false, detail: data.errmsg || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Network error" };
  }
}
