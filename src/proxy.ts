import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/auth/config";
import { resolveSession, sessionCookieName } from "@/lib/auth/session";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security/csp";

/**
 * Runs before every matched request (Node.js runtime):
 *  1. per-request CSP nonce,
 *  2. access control — unauthenticated pages redirect to /login, APIs get 401 JSON.
 * Pages and API routes re-check the session themselves (defense in depth).
 */

const PUBLIC_PATHS = ["/login", "/api/health", "/api/auth"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  const config = getAuthConfig();
  const authenticated =
    config.status === "disabled" ||
    resolveSession(request.cookies.get(sessionCookieName())?.value, config, new Date()) !== null;

  let response: NextResponse;
  if (!authenticated && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      response = NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to access project data." } },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    } else {
      // Next relativizes same-origin redirects from the proxy, so this is safe behind reverse proxies.
      const login = new URL("/login", request.url);
      login.searchParams.set("next", `${pathname}${search}`);
      response = NextResponse.redirect(login);
    }
  } else if (authenticated && pathname === "/login" && config.status === "enabled") {
    response = NextResponse.redirect(new URL("/", request.url));
  } else {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and Next internals.
    { source: "/((?!_next/static|_next/image|favicon.ico).*)" },
  ],
};
