import { NextResponse, type NextRequest } from "next/server";
import { authenticate, isPublic, isWrite } from "@/lib/auth";
import { loginConfigured, SESSION_COOKIE } from "@/lib/session";

/**
 * Who may see and change the dashboard:
 *  1. A valid session cookie, set by /login after a Supabase sign-in by an allowed email
 *     (DASHBOARD_ALLOWED_EMAILS). This is the normal way, and keeps you logged in for 30 days.
 *  2. Optional fallback: HTTP Basic auth with DASHBOARD_PASSWORD (any username), handy for curl
 *     or scripts. Leave DASHBOARD_PASSWORD unset to switch it off.
 *  3. DASHBOARD_PUBLIC=true: reading (pages, GET/HEAD/OPTIONS) needs no login at all. Writes
 *     (POST/PUT/PATCH/DELETE, e.g. /api/manual) still need 1 or 2.
 * Otherwise browsers are sent to /login, and other requests get a 401 (no browser popup).
 *
 * Excluded, because they have their own secret or must load before login: /login, /logout,
 * /api/auth/*, /api/ingest/* (INGEST_SECRET), exactly /api/widget (WIDGET_TOKEN), the web app
 * manifest and the icons (iOS fetches them without a session).
 */
export async function proxy(req: NextRequest) {
  if (await authenticate(req.cookies.get(SESSION_COOKIE)?.value, req.headers.get("authorization"))) {
    return NextResponse.next();
  }

  const write = isWrite(req.method);
  if (isPublic() && !write) return NextResponse.next();

  if (!loginConfigured() && !process.env.DASHBOARD_PASSWORD) {
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
  return NextResponse.json({ error: write && isPublic() ? "Inloggen nodig om te wijzigen" : "Login vereist" }, { status: 401 });
}

export const config = {
  matcher: [
    "/((?!login$|logout$|api/auth/|api/ingest/|api/widget$|manifest.webmanifest$|icons/|icon.svg$|apple-icon.png$|_next/static|_next/image|favicon.ico).*)",
  ],
};
