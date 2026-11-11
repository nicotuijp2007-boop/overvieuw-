import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/secrets";

/**
 * Password protection for the whole dashboard (HTTP Basic auth: the browser shows a login
 * prompt and remembers it). Username: anything. Password: DASHBOARD_PASSWORD.
 *
 * Excluded, because they have their own secret: /api/ingest/* (INGEST_SECRET, for the sync
 * script) and exactly /api/widget (WIDGET_TOKEN, read-only, for the home-screen widget).
 * Also excluded: the web app manifest and the icons, which iOS fetches without the password.
 * Without DASHBOARD_PASSWORD the dashboard is open in `npm run dev` and refuses to serve in production.
 */
export function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "development") return NextResponse.next();
    return new NextResponse("DASHBOARD_PASSWORD is not set. Add it to the site's environment variables.", { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {}
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (decoded.includes(":") && safeEqual(given, password)) return NextResponse.next();
  }

  return new NextResponse("Login required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Usage dashboard", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/ingest/|api/widget$|manifest.webmanifest$|icons/|icon.svg$|apple-icon.png$|_next/static|_next/image|favicon.ico).*)"],
};
