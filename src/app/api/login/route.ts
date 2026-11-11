import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/secrets";
import { createSession, safeNext, sessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/** POST /api/login (form from /login): checks DASHBOARD_PASSWORD and sets the login cookie. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const next = safeNext(form?.get("next"));
  const password = process.env.DASHBOARD_PASSWORD;
  const given = form?.get("password");
  const back = (error: string) => NextResponse.redirect(new URL(`/login?fout=${error}&next=${encodeURIComponent(next)}`, req.url), 303);

  if (!password || typeof given !== "string" || !safeEqual(given, password)) {
    // Slow down guessing a little.
    await new Promise((r) => setTimeout(r, 600));
    return back("wachtwoord");
  }
  const session = createSession();
  if (!session) return back("geheim");

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(sessionCookie(session.value, session.maxAge));
  return res;
}
