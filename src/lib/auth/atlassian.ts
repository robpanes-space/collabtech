import { z } from "zod";
import { normalizeEmail, type AtlassianConfig } from "./config";

/**
 * "Sign in with Atlassian" — OAuth 2.0 (3LO) authorization-code flow, used ONLY to learn who the
 * user is. Scope: read:me. The access token is used once, server-side, to call GET /me and is
 * then discarded: never stored, logged, put in a cookie or session, or used for Jira data
 * (dashboard data always comes from the server's Jira service account).
 */

export const ATLASSIAN_AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
export const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
export const ATLASSIAN_ME_URL = "https://api.atlassian.com/me";
/** Identity only — no Jira scopes. */
export const ATLASSIAN_SCOPES = ["read:me"] as const;
const TIMEOUT_MS = 10_000;

export type AtlassianLoginError =
  | "cancelled"
  | "invalid_state"
  | "expired"
  | "unavailable"
  | "failed"
  | "no_email"
  | "not_allowed"
  | "not_configured";

export function buildAuthorizeUrl(config: AtlassianConfig, state: string): string {
  const url = new URL(ATLASSIAN_AUTHORIZE_URL);
  url.searchParams.set("audience", "api.atlassian.com");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("scope", ATLASSIAN_SCOPES.join(" "));
  url.searchParams.set("redirect_uri", config.callbackUrl);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

const tokenSchema = z.object({ access_token: z.string().min(1) });
const tokenErrorSchema = z.object({ error: z.string().optional(), error_description: z.string().optional() });

/**
 * Bad/expired/reused authorization codes. Standard OAuth uses `invalid_grant`; Atlassian (verified
 * live) answers `invalid_request` with "authorization_code is invalid".
 */
export function isExpiredCodeError(error: { error?: string; error_description?: string }): boolean {
  if (error.error === "invalid_grant") return true;
  return error.error === "invalid_request" && /authorization[_ ]code/i.test(error.error_description ?? "");
}
const identitySchema = z.object({
  account_type: z.string().nullish(),
  account_status: z.string().nullish(),
  email: z.string().nullish(),
  name: z.string().nullish(),
  account_id: z.string().nullish(),
});

type Result<T> = ({ ok: true } & T) | { ok: false; error: AtlassianLoginError };

async function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

export async function exchangeCodeForToken(config: AtlassianConfig, code: string): Promise<Result<{ accessToken: string }>> {
  let response: Response;
  try {
    response = await post(ATLASSIAN_TOKEN_URL, {
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl,
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (response.status >= 500 || response.status === 429) return { ok: false, error: "unavailable" };
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = tokenErrorSchema.safeParse(json);
    return { ok: false, error: parsed.success && isExpiredCodeError(parsed.data) ? "expired" : "failed" };
  }
  const parsed = tokenSchema.safeParse(json);
  return parsed.success ? { ok: true, accessToken: parsed.data.access_token } : { ok: false, error: "failed" };
}

/** accountId is internal (used only to check Jira project access); never sent to the browser. */
export async function fetchAtlassianIdentity(
  accessToken: string,
): Promise<Result<{ email: string; displayName: string | null; accountId: string | null }>> {
  let response: Response;
  try {
    response = await fetch(ATLASSIAN_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (response.status >= 500 || response.status === 429) return { ok: false, error: "unavailable" };
  if (!response.ok) return { ok: false, error: "failed" };
  const parsed = identitySchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { ok: false, error: "failed" };
  const identity = parsed.data;
  // /me exposes no email_verified flag: require an active Atlassian-managed account with a
  // primary email (see docs/deployment.md — limitations).
  if (identity.account_type && identity.account_type !== "atlassian") return { ok: false, error: "failed" };
  if (identity.account_status && identity.account_status !== "active") return { ok: false, error: "failed" };
  const email = identity.email ? normalizeEmail(identity.email) : "";
  if (!email) return { ok: false, error: "no_email" };
  return { ok: true, email, displayName: identity.name?.trim() || null, accountId: identity.account_id?.trim() || null };
}

/**
 * Code → identity → access decision. Returns only the identity; the token never leaves here.
 *   1. email on the allowlist (DASHBOARD_ALLOWED_EMAILS ∪ DASHBOARD_USERS) → allowed
 *   2. otherwise, if project access is enabled: the Atlassian account has access to the Jira
 *      project (checked with the service account, cache bypassed) → allowed
 *   3. otherwise → not_allowed (no session)
 */
export async function completeAtlassianSignIn(input: {
  config: AtlassianConfig;
  allowedEmails: ReadonlySet<string>;
  code: string;
  /** Present only when DASHBOARD_JIRA_PROJECT_ACCESS=true. */
  isProjectMember?: (accountId: string) => Promise<boolean>;
}): Promise<Result<{ email: string; displayName: string | null; via: "allowlist" | "jira_project"; accountId: string | null }>> {
  const token = await exchangeCodeForToken(input.config, input.code);
  if (!token.ok) return token;
  const identity = await fetchAtlassianIdentity(token.accessToken);
  if (!identity.ok) return identity;
  if (input.allowedEmails.has(identity.email)) return { ...identity, via: "allowlist" };
  if (input.isProjectMember && identity.accountId) {
    let member = false;
    try {
      member = await input.isProjectMember(identity.accountId);
    } catch {
      return { ok: false, error: "unavailable" };
    }
    if (member) return { ...identity, via: "jira_project" };
  }
  return { ok: false, error: "not_allowed" };
}
