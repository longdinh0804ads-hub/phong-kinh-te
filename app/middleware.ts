import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/cron", // cron endpoint tự verify CRON_SECRET, bypass middleware auth
  "/_next",
  "/favicon.ico",
  "/manifest.json",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request, {
    cookiePrefix: "pkt",
  });

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.svg|.*\\.png).*)"],
};
