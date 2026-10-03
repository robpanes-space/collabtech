import { NextResponse, type NextRequest } from "next/server";
import type { AtlassianLoginError } from "./atlassian";
import { oauthStateCookieName } from "./oauth-state";
import { sessionCookieOptions } from "./session";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Same-origin redirect with a RELATIVE Location (resolved by the browser against the public
 * URL). Never derived from request Host headers, so it is correct behind reverse proxies and
 * immune to Host-header injection. `path` must already be a validated same-origin path.
 */
export function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { ...NO_STORE, Location: path } });
}

/** Redirect to /login with a client-safe error code; always clears the OAuth state cookie. */
export function loginErrorRedirect(_request: NextRequest, error: AtlassianLoginError, next = "/"): NextResponse {
  const params = new URLSearchParams({ error: `atlassian_${error}` });
  if (next !== "/") params.set("next", next);
  const response = redirectTo(`/login?${params.toString()}`);
  clearOAuthStateCookie(response);
  return response;
}

export function clearOAuthStateCookie(response: NextResponse): void {
  response.cookies.set(oauthStateCookieName(), "", sessionCookieOptions(0));
}

export { NO_STORE };
