import { connect } from "cloudflare:sockets";
import type { SendResult } from "../types";

// Minimal SMTP client over Cloudflare Workers' built-in TCP sockets.
// Supports implicit TLS (port 465) and STARTTLS (port 587), AUTH LOGIN, and a
// single HTML message. Port 25 is blocked by Workers, so use 465/587.
export interface SmtpParams {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean; // true = implicit TLS (465); false = STARTTLS (587)
  from: string; // raw "Name <addr>" or "addr"
  to: string[];
  subject: string;
  html: string;
}

const CRLF = "\r\n";
const enc = new TextEncoder();
const dec = new TextDecoder();

function extractAddr(s: string): string {
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
}

// RFC 2047 encoded-word for non-ASCII header values (subject, display name).
function encodeWord(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return `=?UTF-8?B?${btoa(String.fromCharCode(...enc.encode(s)))}?=`;
}

function encodeFrom(from: string): string {
  const m = from.match(/^(.*?)\s*<([^>]+)>$/);
  if (m && m[1].trim()) return `${encodeWord(m[1].trim())} <${m[2].trim()}>`;
  return from;
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64Wrapped(s: string): string {
  const raw = base64(enc.encode(s));
  return (raw.match(/.{1,76}/g) || [raw]).join(CRLF);
}

// Find a complete SMTP reply in the buffer. The final line of a reply is
// "NNN <text>" (space after the code); intermediate lines use "NNN-<text>".
function parseReply(buf: string): { code: number; text: string; rest: string } | null {
  const lines = buf.split(CRLF);
  for (let i = 0; i < lines.length; i++) {
    if (/^\d{3} /.test(lines[i])) {
      return {
        code: parseInt(lines[i].slice(0, 3), 10),
        text: lines.slice(0, i + 1).map((l) => l.slice(4)).join(" ").trim(),
        rest: lines.slice(i + 1).join(CRLF),
      };
    }
  }
  return null;
}

export async function sendSmtp(p: SmtpParams): Promise<SendResult> {
  const run = async (): Promise<SendResult> => {
    let socket = connect(
      { hostname: p.host, port: p.port },
      { secureTransport: p.secure ? "on" : "starttls", allowHalfOpen: false },
    );
    let reader = socket.readable.getReader();
    let writer = socket.writable.getWriter();
    let buffer = "";

    const readReply = async (): Promise<{ code: number; text: string }> => {
      for (;;) {
        const parsed = parseReply(buffer);
        if (parsed) {
          buffer = parsed.rest;
          return { code: parsed.code, text: parsed.text };
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("SMTP 连接被服务器关闭");
        buffer += dec.decode(value);
      }
    };
    const send = (line: string) => writer.write(enc.encode(line + CRLF));
    const expect = async (line: string | null, want: number, label: string) => {
      if (line !== null) await send(line);
      const r = await readReply();
      if (r.code !== want) throw new Error(`${label}失败（${r.code} ${r.text}）`);
      return r;
    };

    try {
      const domain = extractAddr(p.from).split("@")[1] || "cloud-reminder";
      await expect(null, 220, "连接服务器");
      await expect(`EHLO ${domain}`, 250, "EHLO");

      if (!p.secure) {
        await expect("STARTTLS", 220, "STARTTLS");
        reader.releaseLock();
        writer.releaseLock();
        socket = socket.startTls();
        reader = socket.readable.getReader();
        writer = socket.writable.getWriter();
        buffer = "";
        await expect(`EHLO ${domain}`, 250, "EHLO");
      }

      await expect("AUTH LOGIN", 334, "AUTH LOGIN");
      await expect(btoa(p.username), 334, "用户名认证");
      await expect(btoa(p.password), 235, "密码认证");

      await expect(`MAIL FROM:<${extractAddr(p.from)}>`, 250, "MAIL FROM");
      for (const rcpt of p.to) await expect(`RCPT TO:<${extractAddr(rcpt)}>`, 250, "RCPT TO");
      await expect("DATA", 354, "DATA");

      const message =
        [
          `From: ${encodeFrom(p.from)}`,
          `To: ${p.to.join(", ")}`,
          `Subject: ${encodeWord(p.subject || "(无主题)")}`,
          `Date: ${new Date().toUTCString()}`,
          `Message-ID: <${crypto.randomUUID()}@cloud-reminder>`,
          "MIME-Version: 1.0",
          "Content-Type: text/html; charset=UTF-8",
          "Content-Transfer-Encoding: base64",
        ].join(CRLF) +
        CRLF +
        CRLF +
        base64Wrapped(p.html);
      // Dot-stuffing: a lone "." would terminate DATA early.
      const stuffed = message.replace(/\r\n\./g, "\r\n..");
      await send(stuffed + CRLF + ".");
      await expect(null, 250, "邮件投递");

      try {
        await send("QUIT");
      } catch {
        /* server may close first */
      }
      return { ok: true };
    } finally {
      try {
        await socket.close();
      } catch {
        /* ignore */
      }
    }
  };

  try {
    return await Promise.race([
      run(),
      new Promise<SendResult>((_, reject) =>
        setTimeout(() => reject(new Error("SMTP 超时（20 秒）")), 20000),
      ),
    ]);
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "SMTP 发送失败" };
  }
}
