/**
 * Email + password check against Supabase Auth (GoTrue REST API), with the project's public
 * "publishable" (anon) key. Only used to check the password: the dashboard then sets its own
 * session cookie (src/lib/session.ts). No Supabase tokens are stored.
 *
 * SUPABASE_URL:              https://<project-ref>.supabase.co
 * SUPABASE_PUBLISHABLE_KEY:  Supabase > Project Settings > API Keys (publishable / anon key)
 */
export type SignInResult = { ok: true; email: string } | { ok: false; reason: "invalid" | "unavailable" | "config" };

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { ok: false, reason: "config" };

  let res: Response;
  try {
    res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  // 400 = wrong email/password or unconfirmed account. Anything 5xx/429 = try again later.
  if (res.status === 400 || res.status === 401 || res.status === 422) return { ok: false, reason: "invalid" };
  if (!res.ok) return { ok: false, reason: "unavailable" };

  const body = (await res.json().catch(() => null)) as { user?: { email?: string } } | null;
  const confirmed = body?.user?.email;
  return confirmed ? { ok: true, email: confirmed } : { ok: false, reason: "unavailable" };
}
