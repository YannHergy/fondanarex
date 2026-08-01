import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` and runs it on the Node.js
 * runtime. That is what lets this use the database-backed Auth.js session
 * directly — under the old Edge middleware a Prisma adapter was not reachable
 * and a JWT strategy was effectively mandatory.
 *
 * Everything except the public paths below requires a session. This is the
 * coarse gate; each route handler and server action still resolves the session
 * itself and scopes queries by userId. Defence in depth is deliberate — the
 * legacy app's single worst flaw was unauthenticated endpoints, so
 * authorisation is never left to a single choke point.
 */

const PUBLIC_PATHS = ["/signin", "/api/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const session = await auth();
  if (session?.user) return NextResponse.next();

  // Cron endpoints authenticate with a bearer secret, not a session.
  if (pathname.startsWith("/api/cron")) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/signin", request.url);
  signInUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
