import { NextResponse, type NextRequest } from "next/server";
import { FORM_TOKEN_COOKIE, FORM_TOKEN_HEADER, issueFormToken, verifyFormToken } from "@/server/auth/session";

/**
 * Issues the anonymous form token.
 *
 * The value is minted here rather than during the render because a Server
 * Component cannot set a cookie, and it is handed to the render through a
 * request header so the very first page view already carries a valid token in
 * its hidden field. The same value is what the POST handler compares the body
 * field against.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  const existing = request.cookies.get(FORM_TOKEN_COOKIE)?.value;
  const token = existing && verifyFormToken(existing) ? existing : issueFormToken();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(FORM_TOKEN_HEADER, token);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (token !== existing) {
    response.cookies.set(FORM_TOKEN_COOKIE, token, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
      maxAge: 60 * 120,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"],
};
