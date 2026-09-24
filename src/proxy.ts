import { NextResponse, type NextRequest } from "next/server";

import { PASSCODE_COOKIE, demoPasscode, isAuthorised } from "@/lib/auth";

/**
 * Puts the whole app behind the shared passcode (see `src/lib/auth.ts`).
 *
 * Runs before every page and route handler, so there is no page that forgets
 * to check. With `DEMO_PASSCODE` unset it does nothing at all.
 */
export function proxy(request: NextRequest) {
  if (!demoPasscode()) return NextResponse.next();
  if (isAuthorised(request.cookies.get(PASSCODE_COOKIE)?.value)) return NextResponse.next();

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  // Come back to where they were headed once they are through.
  login.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;

  return NextResponse.redirect(login);
}

export const config = {
  // Everything but the login screen itself and Next's own static output.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
