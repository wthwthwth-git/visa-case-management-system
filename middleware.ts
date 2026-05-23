import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const sessionCookieNames = ["next-auth.session-token", "__Secure-next-auth.session-token"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const hasSessionCookie = sessionCookieNames.some((name) => request.cookies.has(name));

  if (!hasSessionCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
