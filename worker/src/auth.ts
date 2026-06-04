import type { Context, Next } from "hono";
import type { Env } from "./types";
import { getSetting, setSetting } from "./db";

// Default credentials so a fresh deploy works with zero config.
// Change the password immediately in Settings after first login.
export const DEFAULT_ADMIN_PASSWORD = "admin";

// ── base64url helpers ────────────────────────────────────────────────────────
function b64urlEncode(data: ArrayBuffer | string): string {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = new Uint8Array(data);
  }
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// ── JWT (HS256) ──────────────────────────────────────────────────────────────
export async function signToken(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 7,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = b64urlEncode(JSON.stringify(header));
  const bodyB64 = b64urlEncode(JSON.stringify(body));
  const data = `${headerB64}.${bodyB64}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${b64urlEncode(sig)}`;
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, sigB64] = parts;
  const data = `${headerB64}.${bodyB64}`;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlToBytes(sigB64),
    new TextEncoder().encode(data),
  );
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(bodyB64)));
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// ── Password hashing (PBKDF2-SHA256) ─────────────────────────────────────────
const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64urlEncode(salt.buffer)}$${b64urlEncode(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10) || PBKDF2_ITERATIONS;
  const salt = b64urlToBytes(parts[2]);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return safeEqual(b64urlEncode(bits), parts[3]);
}

// Constant-time string comparison to avoid timing attacks on the password.
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// Verify a password against the stored hash (preferred), else the bootstrap
// ADMIN_PASSWORD secret, else the built-in default ("admin").
export async function verifyAdminPassword(
  password: string,
  storedHash: string | null,
  envPassword: string | undefined,
): Promise<boolean> {
  if (storedHash) return verifyPassword(password, storedHash);
  return safeEqual(password, envPassword || DEFAULT_ADMIN_PASSWORD);
}

// Resolve the JWT signing secret: the JWT_SECRET env var, else a random secret
// generated once and persisted in D1 — so the app works with no secrets set.
let cachedJwtSecret: string | null = null;
export async function getJwtSecret(env: Env): Promise<string> {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (cachedJwtSecret) return cachedJwtSecret;
  let secret = await getSetting(env.DB, "jwt_secret");
  if (!secret) {
    secret = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer);
    await setSetting(env.DB, "jwt_secret", secret);
  }
  cachedJwtSecret = secret;
  return secret;
}

// ── Hono auth middleware ─────────────────────────────────────────────────────
export function requireAuth() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const header = c.req.header("Authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    const payload = await verifyToken(token, await getJwtSecret(c.env));
    if (!payload) return c.json({ error: "Invalid or expired session" }, 401);
    await next();
  };
}
