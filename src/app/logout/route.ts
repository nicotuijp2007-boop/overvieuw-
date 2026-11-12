import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/** POST /logout: remove the session cookie and go to the login page. */
export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
