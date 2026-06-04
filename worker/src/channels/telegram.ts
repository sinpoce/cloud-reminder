import type { SendResult } from "../types";

export interface TelegramConfig {
  token: string;
  chat_id: string;
}

export async function sendTelegram(
  config: TelegramConfig,
  title: string,
  body: string,
  rendered?: string,
): Promise<SendResult> {
  if (!config.token || !config.chat_id) {
    return { ok: false, detail: "Missing Telegram token or chat_id" };
  }
  // With a custom template, send it verbatim (no Markdown auto-formatting).
  const useTemplate = typeof rendered === "string";
  const text = useTemplate
    ? rendered
    : body
      ? `*${escapeMd(title)}*\n\n${escapeMd(body)}`
      : `*${escapeMd(title)}*`;
  try {
    const payload: Record<string, unknown> = {
      chat_id: config.chat_id,
      text,
      disable_web_page_preview: true,
    };
    if (!useTemplate) payload.parse_mode = "Markdown";
    const res = await fetch(
      `https://api.telegram.org/bot${config.token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (res.ok && data.ok) return { ok: true };
    return { ok: false, detail: data.description || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Network error" };
  }
}

// Escape characters that break Telegram's legacy Markdown parser.
function escapeMd(s: string): string {
  return s.replace(/([_*`\[])/g, "\\$1");
}
