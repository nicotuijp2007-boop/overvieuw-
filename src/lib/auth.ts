import { safeEqual } from "./secrets";
import { verifySession } from "./session";

/**
 * Shared login check for the proxy (who may pass) and the page (what to show).
 *
 * DASHBOARD_PUBLIC=true makes the dashboard read-only public: pages and GET requests work
 * without logging in, but writes (POST/PUT/PATCH/DELETE, e.g. /api/manual) still need a
 * session or DASHBOARD_PASSWORD. Without it, everything needs a login.
 */
export function isPublic(): boolean {
  return process.env.DASHBOARD_PUBLIC === "true";
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isWrite(method: string): boolean {
  return WRITE_METHODS.has(method.toUpperCase());
}

/** True for HTTP Basic auth with DASHBOARD_PASSWORD (any username). */
export function basicAuthOk(authorization: string | null | undefined): boolean {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password || !authorization?.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(authorization.slice(6));
  } catch {
    return false;
  }
  return decoded.includes(":") && safeEqual(decoded.slice(decoded.indexOf(":") + 1), password);
}

/** Who is logged in: { email } for a session, { email: null } for Basic auth, or null for nobody. */
export async function authenticate(
  sessionCookie: string | undefined,
  authorization: string | null | undefined,
): Promise<{ email: string | null } | null> {
  const email = await verifySession(sessionCookie);
  if (email) return { email };
  if (basicAuthOk(authorization)) return { email: null };
  return null;
}
