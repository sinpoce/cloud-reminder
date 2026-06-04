import type { Channel, SendResult } from "../types";
import { sendTelegram, type TelegramConfig } from "./telegram";
import { sendWechat, type WechatConfig } from "./wechat";
import { sendFeishu, type FeishuConfig } from "./feishu";
import { sendWebhook, type WebhookConfig } from "./webhook";
import { sendEmail, type EmailConfig } from "./email";
import { sendBark, type BarkConfig } from "./bark";

// Built-in default notification template (event title + content + time).
// Pre-filled in the dashboard and editable; used when a channel leaves it blank.
export const DEFAULT_MESSAGE_TEMPLATE =
  "🔔 提醒事项：{{title}}\n\n{{body}}\n\n———————————\n🕐 触发时间：{{time}}\n📡 来自 Cloud Reminder · 自托管提醒服务";

// Built-in HTML email template — a branded card with a SINPOCE footer.
// Pre-filled in the dashboard and fully editable; {{title}} {{body}} {{time}}.
export const DEFAULT_EMAIL_HTML = `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 28px rgba(17,12,46,.08);">
        <tr><td style="background:linear-gradient(135deg,#7c6cff 0%,#5b4ddb 100%);padding:30px 34px;">
          <div style="color:rgba(255,255,255,.82);font-size:12px;letter-spacing:2px;font-weight:600;">CLOUD REMINDER</div>
          <div style="color:#ffffff;font-size:22px;font-weight:700;line-height:1.35;margin-top:8px;">🔔 {{title}}</div>
        </td></tr>
        <tr><td style="padding:32px 34px 8px;">
          <div style="color:#1f2430;font-size:15px;line-height:1.75;white-space:pre-wrap;">{{body}}</div>
        </td></tr>
        <tr><td style="padding:14px 34px 30px;">
          <span style="display:inline-block;background:#f1f0fb;color:#6b6580;font-size:13px;padding:7px 13px;border-radius:9px;">🕐 {{time}}</span>
        </td></tr>
        <tr><td style="padding:18px 34px;background:#fafafb;border-top:1px solid #efeff3;text-align:center;">
          <div style="color:#9a96a6;font-size:12px;letter-spacing:.3px;">本邮件由 <b style="color:#7c6cff;letter-spacing:1.5px;">SINPOCE</b> · Cloud Reminder 自动发送</div>
        </td></tr>
      </table>
      <div style="color:#b9b6c4;font-size:11px;margin-top:18px;">© Cloud Reminder · 自托管提醒服务</div>
    </td></tr>
  </table>
</body>
</html>`;

// Escape user text before inserting it into the HTML email template.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTemplate(tpl: string, vars: { title: string; body: string; time: string }): string {
  return tpl
    .replaceAll("{{title}}", vars.title)
    .replaceAll("{{body}}", vars.body)
    .replaceAll("{{time}}", vars.time);
}

function formatTime(tz?: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: tz || "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

export async function dispatch(
  channel: Channel,
  title: string,
  body: string,
  tz?: string,
): Promise<SendResult> {
  const cfg = channel.config as Record<string, unknown>;
  const time = formatTime(tz);

  // Webhook keeps its own JSON payload.
  if (channel.type === "webhook") {
    return sendWebhook(cfg as unknown as WebhookConfig, title, body);
  }

  // Email: HTML body from the channel's editable email template (SINPOCE card).
  if (channel.type === "email") {
    const tpl =
      typeof cfg.email_template === "string" && cfg.email_template.trim()
        ? cfg.email_template
        : DEFAULT_EMAIL_HTML;
    const html = renderTemplate(tpl, { title: escapeHtml(title), body: escapeHtml(body), time });
    return sendEmail(cfg as unknown as EmailConfig, title, html);
  }

  // Text channels fall back to the built-in plain-text template; editable.
  const custom = typeof cfg.template === "string" ? cfg.template.trim() : "";
  const rendered = renderTemplate(custom || DEFAULT_MESSAGE_TEMPLATE, { title, body, time });
  switch (channel.type) {
    case "telegram":
      return sendTelegram(cfg as unknown as TelegramConfig, title, body, rendered);
    case "wechat":
      return sendWechat(cfg as unknown as WechatConfig, title, body, rendered);
    case "feishu":
      return sendFeishu(cfg as unknown as FeishuConfig, title, body, rendered);
    case "bark":
      return sendBark(cfg as unknown as BarkConfig, title, body, rendered);
    default:
      return { ok: false, detail: `Unknown channel type: ${(channel as Channel).type}` };
  }
}

// Message template, offered on every channel (webhook uses a JSON one). Comes
// pre-filled with the built-in default and is fully editable.
const MESSAGE_TEMPLATE = {
  key: "template",
  label: "消息模板",
  required: false,
  type: "textarea",
  default: DEFAULT_MESSAGE_TEMPLATE,
  placeholder: DEFAULT_MESSAGE_TEMPLATE,
  hint: "内置模板含「事件 / 内容 / 时间」，可自行修改；清空则用内置默认。占位符：{{title}} {{body}} {{time}}。",
} as const;

// HTML email template offered on the email channel (branded with SINPOCE, editable).
const EMAIL_TEMPLATE = {
  key: "email_template",
  label: "邮件模板 (HTML)",
  required: false,
  type: "textarea",
  default: DEFAULT_EMAIL_HTML,
  placeholder: "留空则使用内置带 SINPOCE 的默认模板",
  hint: "内置一套带 SINPOCE 品牌的 HTML 邮件模板，可自行修改；清空则用内置默认。占位符：{{title}} {{body}} {{time}}。",
} as const;

// Field metadata used by the dashboard to render channel config forms.
export const CHANNEL_SCHEMA = {
  telegram: {
    label: "Telegram",
    fields: [
      { key: "token", label: "Bot Token", required: true, secret: true, placeholder: "123456:ABC-DEF..." },
      { key: "chat_id", label: "Chat ID", required: true, placeholder: "@channel or 123456789" },
      MESSAGE_TEMPLATE,
    ],
  },
  wechat: {
    label: "企业微信 (WeCom)",
    fields: [
      { key: "webhook", label: "Webhook URL", required: true, secret: true, placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." },
      MESSAGE_TEMPLATE,
    ],
  },
  feishu: {
    label: "飞书 (Feishu/Lark)",
    fields: [
      { key: "webhook", label: "Webhook URL", required: true, secret: true, placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/..." },
      { key: "secret", label: "Signing Secret", required: false, secret: true, placeholder: "optional" },
      MESSAGE_TEMPLATE,
    ],
  },
  email: {
    label: "邮箱 (Email)",
    fields: [
      { key: "provider", label: "发送方式", type: "select", default: "resend", options: [{ value: "resend", label: "Resend API（最简单，推荐）" }, { value: "smtp", label: "SMTP 服务器（QQ / Gmail / 163 / 自建）" }], hint: "Resend 走 HTTP API；SMTP 直连你的邮箱服务器发送。" },
      { key: "api_key", label: "Resend API Key", required: true, secret: true, placeholder: "re_...", hint: "在 resend.com 创建 API Key", showIf: { key: "provider", in: ["resend"] } },
      { key: "smtp_host", label: "SMTP 服务器", required: true, placeholder: "smtp.qq.com / smtp.gmail.com", showIf: { key: "provider", in: ["smtp"] } },
      { key: "smtp_port", label: "端口", required: false, placeholder: "465", hint: "465 用 SSL，587 用 STARTTLS；不确定填 465。", showIf: { key: "provider", in: ["smtp"] } },
      { key: "smtp_user", label: "账号 / 邮箱", required: true, placeholder: "you@qq.com", showIf: { key: "provider", in: ["smtp"] } },
      { key: "smtp_pass", label: "密码 / 授权码", required: true, secret: true, placeholder: "邮箱授权码（非登录密码）", hint: "QQ / 163 / Gmail 等需用「授权码 / 应用专用密码」，不是登录密码。", showIf: { key: "provider", in: ["smtp"] } },
      { key: "from", label: "发件人", required: true, placeholder: "Cloud Reminder <you@qq.com>", hint: "SMTP 通常需与账号同邮箱；Resend 需用已验证域名。" },
      { key: "to", label: "收件人", required: true, placeholder: "you@example.com（多个用逗号分隔）" },
      EMAIL_TEMPLATE,
    ],
  },
  bark: {
    label: "Bark (iOS 推送)",
    fields: [
      { key: "device_key", label: "Bark 推送地址 / Device Key", required: true, secret: true, placeholder: "https://api.day.app/xxxxxxxxxxxx", hint: "直接粘贴 Bark App 里复制的完整推送地址即可，会自动识别服务器与 Device Key（也可只填地址末尾的 Device Key）。" },
      { key: "server", label: "服务器地址（可选）", required: false, placeholder: "https://api.day.app", hint: "仅当上面只填了 Device Key、且用自建 Bark 服务器时才需填写。" },
      { key: "sound", label: "提示音（可选）", required: false, placeholder: "如 birdsong / alarm" },
      { key: "group", label: "分组（可选）", required: false, placeholder: "如：提醒" },
      MESSAGE_TEMPLATE,
    ],
  },
  webhook: {
    label: "Generic Webhook",
    fields: [
      { key: "url", label: "URL", required: true, placeholder: "https://example.com/hook" },
      { key: "method", label: "Method", required: false, placeholder: "POST" },
      { key: "template", label: "请求体模板（可选 JSON）", required: false, type: "textarea", placeholder: '{"text":"{{title}}: {{body}}"}', hint: "支持 {{title}} {{body}} {{timestamp}}；留空发送默认 JSON。" },
    ],
  },
} as const;
