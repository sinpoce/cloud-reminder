import type { SendResult } from "../types";
import { sendSmtp } from "./smtp";

// Email channel — two providers:
//   • Resend  (HTTP API, simplest; create a key at resend.com)
//   • SMTP    (connect straight to your mailbox server: QQ/Gmail/163/self-hosted)
// The body is HTML, rendered from the channel's editable email template.
export interface EmailConfig {
  provider?: "resend" | "smtp";
  // Resend
  api_key?: string;
  // SMTP
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_pass?: string;
  // shared
  from: string;
  to: string; // one or more, comma-separated
  email_template?: string;
}

export async function sendEmail(
  config: EmailConfig,
  subject: string,
  html: string,
): Promise<SendResult> {
  const to = (config.to || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!config.from || to.length === 0) {
    return { ok: false, detail: "缺少发件人 / 收件人" };
  }

  // SMTP path
  if (config.provider === "smtp") {
    if (!config.smtp_host || !config.smtp_user || !config.smtp_pass) {
      return { ok: false, detail: "缺少 SMTP 服务器 / 账号 / 密码" };
    }
    const port = parseInt(config.smtp_port || "465", 10) || 465;
    // 587 / 25 use STARTTLS; everything else (incl. 465) uses implicit TLS.
    const secure = port !== 587 && port !== 25;
    return sendSmtp({
      host: config.smtp_host.trim(),
      port,
      username: config.smtp_user.trim(),
      password: config.smtp_pass,
      secure,
      from: config.from,
      to,
      subject,
      html,
    });
  }

  // Resend path (default)
  if (!config.api_key) return { ok: false, detail: "缺少 Resend API Key" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to,
        subject: subject || "(无主题)",
        html,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: { message?: string } | string;
      name?: string;
    };
    if (res.ok) return { ok: true };
    const detail =
      data.message ||
      (typeof data.error === "object" ? data.error?.message : data.error) ||
      data.name ||
      `HTTP ${res.status}`;
    return { ok: false, detail };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "网络错误" };
  }
}
