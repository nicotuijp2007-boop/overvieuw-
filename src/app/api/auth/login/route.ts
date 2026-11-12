import { NextResponse } from "next/server";
import { createSession, isAllowed, loginConfigured, safeNext, sessionCookie } from "@/lib/session";
import { signInWithPassword } from "@/lib/supabaseAuth";

export const dynamic = "force-dynamic";

/** POST /api/auth/login (form): check the password with Supabase, then set the 30-day session cookie. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").trim().toLowerCase();
  const password = String(form?.get("password") ?? "");
  const next = safeNext(form?.get("next"));

  const back = (error: string) => {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", error);
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url, 303);
  };

  if (!loginConfigured()) return back("config");
  if (!email || !password || email.length > 200 || password.length > 200) return back("invalid");

  // Same answer for "not allowed" and "wrong password", so the page doesn't reveal which emails exist.
  // The allowlist matters: the Supabase project may have other users (e.g. of another app).
  if (!isAllowed(email)) return back("invalid");
  const result = await signInWithPassword(email, password);
  if (!result.ok) return back(result.reason);
  if (!isAllowed(result.email)) return back("invalid");

  const session = await createSession(result.email);
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(sessionCookie(session.value, session.maxAge));
  return res;
}
