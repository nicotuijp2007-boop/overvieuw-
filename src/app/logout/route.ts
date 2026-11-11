import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /logout: removes the login cookie on this device and goes back to the login page. */
export function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login?uit=1", req.url), 303);
  res.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
