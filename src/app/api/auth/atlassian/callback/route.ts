import type { NextRequest } from "next/server";
import { completeAtlassianSignIn } from "@/lib/auth/atlassian";
import { emailFingerprint, getAuthConfig } from "@/lib/auth/config";
import { clearOAuthStateCookie, loginErrorRedirect, redirectTo } from "@/lib/auth/oauth-responses";
import { oauthStateCookieName, verifyOAuthState } from "@/lib/auth/oauth-state";
import { createSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { isProjectMember } from "@/lib/jira/project-access";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/atlassian/callback — must match ATLASSIAN_CALLBACK_URL exactly (registered in
 * the Atlassian developer console). Validates state, exchanges the code server-side, reads the
 * identity, checks the allowlist and creates the normal dashboard session. Never echoes OAuth
 * payloads; the access token is discarded inside completeAtlassianSignIn().
 */
export async function GET(request: NextRequest) {
  const config = getAuthConfig();
  if (config.status !== "enabled" || !config.atlassian) return loginErrorRedirect(request, "not_configured");

  const params = request.nextUrl.searchParams;
  const state = verifyOAuthState(request.cookies.get(oauthStateCookieName())?.value, params.get("state"), config.sessionSecret, new Date());

  // The user declined consent (or Atlassian reported an error) — no state needed to show that.
  const providerError = params.get("error");
  if (providerError) {
    log("info", "auth.oauth_provider_error", { provider: "atlassian", cancelled: providerError === "access_denied" });
    return loginErrorRedirect(request, providerError === "access_denied" ? "cancelled" : "failed", state.ok ? state.next : "/");
  }
  if (!state.ok) {
    log("warn", "auth.oauth_invalid_state", { provider: "atlassian" });
    return loginErrorRedirect(request, "invalid_state");
  }
  const code = params.get("code");
  if (!code || code.length > 4096) return loginErrorRedirect(request, "failed", state.next);

  const result = await completeAtlassianSignIn({
    config: config.atlassian,
    allowedEmails: config.allowedEmails,
    code,
    // Project access is read with the Jira service account (fresh, so newly invited people get in).
    isProjectMember: config.projectAccess ? (accountId) => isProjectMember(accountId, { fresh: true }) : undefined,
  });
  if (!result.ok) {
    log(result.error === "not_allowed" ? "warn" : "error", "auth.oauth_failed", { provider: "atlassian", reason: result.error });
    return loginErrorRedirect(request, result.error, state.next);
  }

  const token = createSessionToken(
    { provider: "atlassian", email: result.email, displayName: result.displayName, via: result.via, accountId: result.accountId ?? undefined },
    config.sessionSecret,
    new Date(),
    config.sessionMaxAgeSeconds,
  );
  const response = redirectTo(state.next); // state.next is a validated same-origin path
  response.cookies.set(sessionCookieName(), token, sessionCookieOptions(config.sessionMaxAgeSeconds));
  clearOAuthStateCookie(response);
  log("info", "auth.login_succeeded", { user: emailFingerprint(result.email), provider: "atlassian", via: result.via });
  return response;
}
