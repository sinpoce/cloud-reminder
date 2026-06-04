import type { SendResult } from "../types";

// Bark — iOS push (https://bark.day.app). The Bark app hands you the FULL push
// URL (e.g. https://api.day.app/QHRzjoCUVaQNtZpdUn92dA/), so we accept either
// that whole URL or just the device key; self-hosted servers work too.
export interface BarkConfig {
  server?: string; // default https://api.day.app
  device_key: string; // a bare key, OR the full push URL copied from the app
  sound?: string;
  group?: string;
  icon?: string;
}

// Accept whatever the user pastes: a bare device key, or the full push URL the
// Bark app gives you (https://host/KEY[/...]). Returns the resolved server + key.
function resolveBark(config: BarkConfig): { server: string; key: string } | null {
  const raw = (config.device_key || "").trim();
  if (!raw) return null;
  const serverField = (config.server || "").trim().replace(/\/+$/, "");

  // Pasted a URL like https://api.day.app/QHRzjoCUVaQNtZpdUn92dA/ — pull the
  // server (origin) and the key (first path segment after the host).
  if (/^https?:\/\//i.test(raw) || raw.includes("/")) {
    const urlStr = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(urlStr);
      const key = u.pathname.split("/").filter(Boolean)[0] || "";
      if (key) return { server: serverField || `${u.protocol}//${u.host}`, key };
    } catch {
      // not a URL after all — fall through and treat as a bare key
    }
  }
  return { server: serverField || "https://api.day.app", key: raw };
}

export async function sendBark(
  config: BarkConfig,
  title: string,
  body: string,
  rendered?: string,
): Promise<SendResult> {
  const resolved = resolveBark(config);
  if (!resolved) return { ok: false, detail: "缺少 Bark 推送地址 / Device Key" };
  const { server, key } = resolved;
  const payload: Record<string, unknown> = {
    title,
    body: rendered ?? body ?? title,
  };
  if (config.sound) payload.sound = config.sound;
  if (config.group) payload.group = config.group;
  if (config.icon) payload.icon = config.icon;
  try {
    const res = await fetch(`${server}/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    if (res.ok && (data.code === 200 || data.code === undefined)) return { ok: true };
    return { ok: false, detail: data.message || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "网络错误" };
  }
}
