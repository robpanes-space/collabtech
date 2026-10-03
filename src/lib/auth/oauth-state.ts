import { randomBytes } from "node:crypto";
import { safeEqual, safeNextPath, sign } from "./session";

/**
 * OAuth `state` (CSRF protection): a random value bound to this browser by a short-lived,
 * HMAC-signed, HttpOnly cookie. The callback must present the same state within 10 minutes.
 * The cookie also carries the post-login destination (validated as a same-origin path).
 */
export const OAUTH_STATE_MAX_AGE_SECONDS = 600;

export function oauthStateCookieName(env: NodeJS.ProcessEnv = process.env): string {
  return env.NODE_ENV === "production" ? "__Host-jira_dashboard_oauth" : "jira_dashboard_oauth";
}

/** Domain-separated signature so a session token can never be replayed as a state cookie. */
const signState = (body: string, secret: string) => sign(`oauth-state:${body}`, secret);

export function createOAuthState(next: string, secret: string, now: Date): { state: string; cookieValue: string } {
  const state = randomBytes(32).toString("base64url");
  const body = Buffer.from(JSON.stringify({ s: state, n: safeNextPath(next), iat: Math.floor(now.getTime() / 1000) })).toString("base64url");
  return { state, cookieValue: `${body}.${signState(body, secret)}` };
}

export function verifyOAuthState(
  cookieValue: string | undefined,
  stateParam: string | null,
  secret: string,
  now: Date,
): { ok: true; next: string } | { ok: false } {
  if (!cookieValue || !stateParam || cookieValue.length > 2048 || stateParam.length > 256) return { ok: false };
  const [body, signature, extra] = cookieValue.split(".");
  if (!body || !signature || extra !== undefined || !safeEqual(signState(body, secret), signature)) return { ok: false };
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false };
  }
  const p = payload as { s?: unknown; n?: unknown; iat?: unknown };
  if (typeof p.s !== "string" || typeof p.iat !== "number") return { ok: false };
  const age = Math.floor(now.getTime() / 1000) - p.iat;
  if (age < 0 || age > OAUTH_STATE_MAX_AGE_SECONDS) return { ok: false };
  if (!safeEqual(p.s, stateParam)) return { ok: false };
  return { ok: true, next: safeNextPath(p.n) };
}
