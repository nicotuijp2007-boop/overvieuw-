import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/secrets";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Password protection for the whole dashboard. Two ways in, both with DASHBOARD_PASSWORD:
 * - the login cookie set by /login (30 days, see src/lib/session.ts): works in the
 *   home-screen app, where iOS doesn't reliably show or remember a Basic auth prompt;
 * - HTTP Basic auth (any username), for scripts, curl and browsers that remember it.
 * A browser that has neither is sent to /login; other requests get a Basic auth 401.
 *
 * Excluded, because they have their own secret: /api/ingest/* (INGEST_SECRET, for the sync
 * script) and exactly /api/widget (WIDGET_TOKEN, read-only, for the home-screen widget).
 * Also excluded: the login and logout pages, the web app manifest and the icons.
 * Without DASHBOARD_PASSWORD the dashboard is open in `npm run dev` and refuses to serve in production.
 */
export function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "development") return NextResponse.next();
    return new NextResponse("DASHBOARD_PASSWORD is not set. Add it to the site's environment variables.", { status: 503 });
  }

  if (verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {}
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (decoded.includes(":") && safeEqual(given, password)) return NextResponse.next();
  }

  // A page opened in a browser (or the home-screen app): show the login page.
  const isPage = req.method === "GET" && !req.nextUrl.pathname.startsWith("/api/") && (req.headers.get("accept") ?? "").includes("text/html");
  if (isPage && process.env.SESSION_SECRET) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(login, 303);
  }

  return new NextResponse("Login required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Usage dashboard", charset="UTF-8"' },
  });
}

export const config = {
  matcher: [
    "/((?!api/ingest/|api/widget$|api/login$|login$|logout$|manifest.webmanifest$|icons/|icon.svg$|apple-icon.png$|_next/static|_next/image|favicon.ico).*)",
  ],
};
