import { safeEqual } from "./secrets";

/**
 * Login session for the dashboard, set after a successful Supabase sign-in (see /api/auth/login).
 * Works in the iOS home-screen app too, which doesn't keep the browser's Basic auth.
 *
 * Cookie value: "v1.<expires>.<email, base64url>.<signature>", where the signature is an
 * HMAC-SHA256 with SESSION_SECRET over the rest. It can't be forged or extended; rotating
 * SESSION_SECRET logs every device out, and removing an email from DASHBOARD_ALLOWED_EMAILS
 * locks that person out immediately.
 *
 * Uses Web Crypto (not node:crypto) because the proxy runs as an edge function on Netlify.
 */
export const SESSION_COOKIE = "limieten_sessie";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload))));
}

/** Lower-cased emails allowed in (DASHBOARD_ALLOWED_EMAILS, comma-separated). */
export function allowedEmails(): string[] {
  return (process.env.DASHBOARD_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string): boolean {
  return allowedEmails().includes(email.trim().toLowerCase());
}

/** Login via Supabase is set up when these are all present. */
export function loginConfigured(): boolean {
  return Boolean(process.env.SESSION_SECRET && process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && allowedEmails().length);
}

export async function createSession(email: string, now = Date.now()): Promise<{ value: string; maxAge: number }> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const maxAge = SESSION_DAYS * 86_400;
  const expires = Math.floor(now / 1000) + maxAge;
  const payload = `v1.${expires}.${b64url(enc.encode(email.trim().toLowerCase()))}`;
  return { value: `${payload}.${await sign(payload, secret)}`, maxAge };
}

/** The signed-in email, or null when the cookie is missing, forged, expired or no longer allowed. */
export async function verifySession(value: string | undefined, now = Date.now()): Promise<string | null> {
  const secret = process.env.SESSION_SECRET;
  if (!value || !secret) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, exp, emailB64, sig] = parts;
  const expires = Number(exp);
  if (!Number.isInteger(expires) || expires * 1000 <= now) return null;
  if (!safeEqual(sig, await sign(`v1.${exp}.${emailB64}`, secret))) return null;
  let email: string;
  try {
    email = fromB64url(emailB64);
  } catch {
    return null;
  }
  return isAllowed(email) ? email : null;
}

/** Cookie attributes: not readable by scripts, HTTPS only (except local dev), sent on normal navigation. */
export function sessionCookie(value: string, maxAge: number) {
  return {
    name: SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !process.env.ALLOW_INSECURE_COOKIE,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Only same-site paths, so the login can't be used to redirect elsewhere. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
