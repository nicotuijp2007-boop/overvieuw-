import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/secrets";
import { loginConfigured, SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Who may see the dashboard:
 *  1. A valid session cookie, set by /login after a Supabase sign-in by an allowed email
 *     (DASHBOARD_ALLOWED_EMAILS). This is the normal way, and keeps you logged in for 30 days.
 *  2. Optional fallback: HTTP Basic auth with DASHBOARD_PASSWORD (any username), handy for curl
 *     or scripts. Leave DASHBOARD_PASSWORD unset to switch it off.
 * Otherwise browsers are sent to /login, and other requests get a 401 (no browser popup).
 *
 * Excluded, because they have their own secret or must load before login: /login, /logout,
 * /api/auth/*, /api/ingest/* (INGEST_SECRET), exactly /api/widget (WIDGET_TOKEN), the web app
 * manifest and the icons (iOS fetches them without a session).
 */
export async function proxy(req: NextRequest) {
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const password = process.env.DASHBOARD_PASSWORD;
  const header = req.headers.get("authorization") ?? "";
  if (password && header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {}
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (decoded.includes(":") && safeEqual(given, password)) return NextResponse.next();
  }

  if (!loginConfigured() && !password) {
    if (process.env.NODE_ENV === "development") return NextResponse.next();
    return new NextResponse("Login is not set up. See README: Inloggen.", { status: 503 });
  }

  const isPage = req.method === "GET" && (req.headers.get("accept") ?? "").includes("text/html");
  if (isPage) {
    const url = new URL("/login", req.url);
    const next = req.nextUrl.pathname + req.nextUrl.search;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.json({ error: "Login vereist" }, { status: 401 });
}

export const config = {
  matcher: [
    "/((?!login$|logout$|api/auth/|api/ingest/|api/widget$|manifest.webmanifest$|icons/|icon.svg$|apple-icon.png$|_next/static|_next/image|favicon.ico).*)",
  ],
};
