import { createHash, createHmac } from "node:crypto";
import { safeEqual } from "./secrets";

/**
 * Login cookie for the dashboard, so it also works as a home-screen app (iOS standalone mode
 * doesn't reliably show or remember the HTTP Basic auth prompt).
 *
 * Value: "<expires>.<signature>", where the signature is an HMAC-SHA256 with SESSION_SECRET
 * over the expiry and a hash of DASHBOARD_PASSWORD. So the cookie can't be forged or extended,
 * and changing either secret logs every device out.
 */
export const SESSION_COOKIE = "limieten_sessie";
export const SESSION_DAYS = 30;

function signature(expires: number, secret: string, password: string): string {
  const pw = createHash("sha256").update(password).digest("hex");
  return createHmac("sha256", secret).update(`v1.${expires}.${pw}`).digest("base64url");
}

/** Null when SESSION_SECRET or DASHBOARD_PASSWORD isn't set (then only Basic auth works). */
export function createSession(now = Date.now()): { value: string; maxAge: number } | null {
  const secret = process.env.SESSION_SECRET;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!secret || !password) return null;
  const maxAge = SESSION_DAYS * 86_400;
  const expires = Math.floor(now / 1000) + maxAge;
  return { value: `${expires}.${signature(expires, secret, password)}`, maxAge };
}

export function verifySession(value: string | undefined, now = Date.now()): boolean {
  const secret = process.env.SESSION_SECRET;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!value || !secret || !password) return false;
  const [exp, sig] = value.split(".");
  const expires = Number(exp);
  if (!Number.isInteger(expires) || expires * 1000 <= now || !sig) return false;
  return safeEqual(sig, signature(expires, secret, password));
}

/** Cookie attributes: not readable by scripts, HTTPS only, sent on normal navigation. */
export function sessionCookie(value: string, maxAge: number) {
  return { name: SESSION_COOKIE, value, httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge };
}

/** Only same-site paths, so the login can't be used to redirect elsewhere. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
