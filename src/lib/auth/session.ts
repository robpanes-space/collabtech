import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeEmail, passwordVersion, type AuthConfig } from "./config";

/**
 * Stateless signed session token: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * One session shape for every sign-in method. The payload holds only the user's email, display
 * name, sign-in provider, a password-version fingerprint (password sign-in) and timestamps —
 * never OAuth/Jira tokens, Atlassian account IDs or other secrets.
 */

export type AuthProvider = "password" | "atlassian";
/** allowlist = DASHBOARD_USERS / DASHBOARD_ALLOWED_EMAILS; jira_project = has access to the Jira project. */
export type AccessVia = "allowlist" | "jira_project";

/** v1 = legacy password sessions (still accepted); v2 = current. */
type SessionPayloadV1 = { v: 1; sub: string; pv: string; iat: number; exp: number };
/**
 * `via` says why an Atlassian user was let in; `aid` (Atlassian account ID) is present only for
 * "jira_project" sessions, which must be re-checked against Jira project access. The cookie is
 * HttpOnly; the ID never reaches DTOs, pages or logs.
 */
type SessionPayloadV2 = {
  v: 2;
  sub: string;
  prv: AuthProvider;
  name: string | null;
  pv: string | null;
  via?: AccessVia;
  aid?: string;
  iat: number;
  exp: number;
};
export type SessionPayload = SessionPayloadV1 | SessionPayloadV2;

export type Session = {
  email: string;
  displayName: string | null;
  authProvider: AuthProvider;
  accessVia: AccessVia;
  expiresAt: string;
  /** Internal only (jira_project sessions): used to re-check Jira project access. */
  projectAccountId?: string;
};

export const SESSION_COOKIE_PRODUCTION = "__Host-jira_dashboard_session";
export const SESSION_COOKIE_DEVELOPMENT = "jira_dashboard_session";

export function sessionCookieName(env: NodeJS.ProcessEnv = process.env): string {
  return env.NODE_ENV === "production" ? SESSION_COOKIE_PRODUCTION : SESSION_COOKIE_DEVELOPMENT;
}

export function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type SessionSubject =
  | { provider: "password"; email: string; passwordHash: string; displayName?: string | null }
  | { provider: "atlassian"; email: string; displayName: string | null; via?: AccessVia; accountId?: string };

export function createSessionToken(subject: SessionSubject, secret: string, now: Date, maxAgeSeconds: number): string {
  const iat = Math.floor(now.getTime() / 1000);
  const payload: SessionPayloadV2 = {
    v: 2,
    sub: normalizeEmail(subject.email),
    prv: subject.provider,
    name: subject.displayName?.trim().slice(0, 120) || null,
    pv: subject.provider === "password" ? passwordVersion(subject.passwordHash) : null,
    ...(subject.provider === "atlassian" && subject.via === "jira_project" && subject.accountId
      ? { via: "jira_project" as const, aid: subject.accountId }
      : {}),
    iat,
    exp: iat + maxAgeSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** Verifies signature and expiry only. Use `resolveSession` to also enforce the allowlist. */
export function verifySessionToken(token: string | undefined, secret: string, now: Date): SessionPayload | null {
  if (!token || token.length > 2048) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  if (!safeEqual(sign(body, secret), signature)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.sub !== "string" || typeof p.iat !== "number" || typeof p.exp !== "number") return null;
  if (p.exp <= Math.floor(now.getTime() / 1000)) return null;
  if (p.v === 1) return typeof p.pv === "string" ? (p as unknown as SessionPayloadV1) : null;
  if (p.v === 2) {
    if (p.prv !== "password" && p.prv !== "atlassian") return null;
    if (p.prv === "password" && typeof p.pv !== "string") return null;
    if (p.name !== null && typeof p.name !== "string") return null;
    if (p.via !== undefined && p.via !== "jira_project") return null;
    if (p.via === "jira_project" && (typeof p.aid !== "string" || p.aid.length === 0 || p.aid.length > 128)) return null;
    return p as unknown as SessionPayloadV2;
  }
  return null;
}

/**
 * Full check used on every request:
 *   password  — user still in DASHBOARD_USERS and password unchanged since sign-in
 *   atlassian — email still on the allowlist (DASHBOARD_ALLOWED_EMAILS ∪ password users)
 */
export function resolveSession(token: string | undefined, config: AuthConfig, now: Date): Session | null {
  if (config.status !== "enabled") return null;
  const payload = verifySessionToken(token, config.sessionSecret, now);
  if (!payload) return null;
  const expiresAt = new Date(payload.exp * 1000).toISOString();

  const provider: AuthProvider = payload.v === 1 ? "password" : payload.prv;
  if (provider === "password") {
    const user = config.users.get(payload.sub);
    if (!user || passwordVersion(user.passwordHash) !== payload.pv) return null;
    return { email: user.email, displayName: payload.v === 2 ? payload.name : null, authProvider: "password", accessVia: "allowlist", expiresAt };
  }
  const displayName = payload.v === 2 ? payload.name : null;
  if (config.allowedEmails.has(payload.sub)) {
    return { email: payload.sub, displayName, authProvider: "atlassian", accessVia: "allowlist", expiresAt };
  }
  // Project-access sessions are valid only while the mode is on; the server re-checks Jira
  // project access (getSession) — the proxy cannot, it only verifies the signature here.
  if (config.projectAccess && payload.v === 2 && payload.via === "jira_project" && payload.aid) {
    return { email: payload.sub, displayName, authProvider: "atlassian", accessVia: "jira_project", expiresAt, projectAccountId: payload.aid };
  }
  return null;
}

/** Only same-origin relative paths are allowed as post-login destinations. */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 512) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f]/.test(raw) || raw.startsWith("/login") || raw.startsWith("/api/")) return "/";
  return raw;
}

/** Cookie attributes shared by every place that sets or clears the session cookie. */
export function sessionCookieOptions(maxAgeSeconds: number, env: NodeJS.ProcessEnv = process.env) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
