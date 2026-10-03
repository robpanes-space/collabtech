import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl } from "@/lib/auth/atlassian";
import { getAuthConfig } from "@/lib/auth/config";
import { loginErrorRedirect, NO_STORE } from "@/lib/auth/oauth-responses";
import { createOAuthState, OAUTH_STATE_MAX_AGE_SECONDS, oauthStateCookieName } from "@/lib/auth/oauth-state";
import { safeNextPath, sessionCookieOptions } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/atlassian/start — begins "Sign in with Atlassian" (identity only). */
export function GET(request: NextRequest) {
  const config = getAuthConfig();
  if (config.status !== "enabled" || !config.atlassian) return loginErrorRedirect(request, "not_configured");

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const { state, cookieValue } = createOAuthState(next, config.sessionSecret, new Date());
  const response = NextResponse.redirect(buildAuthorizeUrl(config.atlassian, state), { headers: NO_STORE });
  response.cookies.set(oauthStateCookieName(), cookieValue, sessionCookieOptions(OAUTH_STATE_MAX_AGE_SECONDS));
  return response;
}
