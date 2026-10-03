import { createHash } from "node:crypto";
import { parsePasswordHash } from "./password";

/**
 * Dashboard access configuration (server-side env only; never sent to the browser).
 *
 *   DASHBOARD_USERS           comma/newline-separated "email:scrypt-hash" entries (the allowlist)
 *   DASHBOARD_SESSION_SECRET  ≥ 32 characters; signs session cookies
 *   DASHBOARD_SESSION_HOURS   optional session lifetime (default 168 = 7 days, max 720)
 *   DASHBOARD_AUTH_DISABLED   "true" disables auth in local development only (ignored in production)
 *   DASHBOARD_ADMIN_EMAILS    optional comma-separated emails allowed to see admin views
 *                             (/admin/readiness). Unset → every signed-in user may.
 *   DASHBOARD_ALLOWED_EMAILS  comma/newline-separated emails allowed to sign in with Atlassian.
 *                             Password users (DASHBOARD_USERS) are always allowed too, so one
 *                             email = one dashboard user whichever way they sign in.
 *   DASHBOARD_JIRA_PROJECT_ACCESS  "true" → anyone with access (Browse Projects) to the Jira
 *                             project may sign in with Atlassian, checked by Atlassian account ID
 *                             through the Jira service account. The email allowlist still applies too.
 *   ATLASSIAN_CLIENT_ID / ATLASSIAN_CLIENT_SECRET / ATLASSIAN_CALLBACK_URL
 *                             Atlassian OAuth 2.0 (3LO) app — identity only (scope read:me).
 *                             All three or none.
 */

export const ATLASSIAN_CALLBACK_PATH = "/api/auth/atlassian/callback";

/** Admin allowlist (lowercased). Empty set = no admin restriction. */
export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[,\n]/)
      .map(normalizeEmail)
      .filter((email) => email.length > 0),
  );
}

export function isAdminEmail(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const admins = parseAdminEmails(env.DASHBOARD_ADMIN_EMAILS);
  return admins.size === 0 || admins.has(normalizeEmail(email));
}

export type DashboardUser = { email: string; passwordHash: string };

export type AtlassianConfig = { clientId: string; clientSecret: string; callbackUrl: string };

export type AuthConfig =
  | {
      status: "enabled";
      /** Password users (DASHBOARD_USERS). */
      users: ReadonlyMap<string, DashboardUser>;
      /** Everyone allowed in: DASHBOARD_ALLOWED_EMAILS ∪ password users (lowercased). */
      allowedEmails: ReadonlySet<string>;
      /** null when Atlassian sign-in is not configured (button hidden). */
      atlassian: AtlassianConfig | null;
      /** Atlassian users with access to the Jira project may sign in (DASHBOARD_JIRA_PROJECT_ACCESS). */
      projectAccess: boolean;
      sessionSecret: string;
      sessionMaxAgeSeconds: number;
    }
  | { status: "disabled" }
  | { status: "misconfigured"; problems: string[] };

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const EMAIL = /^[^\s@:,]+@[^\s@:,]+\.[^\s@:,]+$/;

/** Parses DASHBOARD_USERS. Returns valid users and whether any entry was malformed. */
export function parseUsers(raw: string | undefined): { users: Map<string, DashboardUser>; malformed: number } {
  const users = new Map<string, DashboardUser>();
  let malformed = 0;
  for (const entry of (raw ?? "").split(/[,\n]/)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    const email = normalizeEmail(separator === -1 ? trimmed : trimmed.slice(0, separator));
    const passwordHash = separator === -1 ? "" : trimmed.slice(separator + 1).trim();
    if (!EMAIL.test(email) || !parsePasswordHash(passwordHash)) {
      malformed++;
      continue;
    }
    users.set(email, { email, passwordHash });
  }
  return { users, malformed };
}

/** Parses DASHBOARD_ALLOWED_EMAILS (lowercased); counts invalid entries. */
export function parseAllowedEmails(raw: string | undefined): { emails: Set<string>; malformed: number } {
  const emails = new Set<string>();
  let malformed = 0;
  for (const entry of (raw ?? "").split(/[,\n]/)) {
    const email = normalizeEmail(entry);
    if (!email) continue;
    if (EMAIL.test(email)) emails.add(email);
    else malformed++;
  }
  return { emails, malformed };
}

/**
 * Atlassian OAuth settings: all three variables or none. The callback must be the exact
 * registered URL, end in /api/auth/atlassian/callback, and use https (http only for localhost
 * outside production). Returns problems by variable NAME only.
 */
export function parseAtlassianConfig(env: NodeJS.ProcessEnv): { config: AtlassianConfig | null; problems: string[] } {
  const clientId = env.ATLASSIAN_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.ATLASSIAN_CLIENT_SECRET?.trim() ?? "";
  const callbackUrl = env.ATLASSIAN_CALLBACK_URL?.trim() ?? "";
  if (!clientId && !clientSecret && !callbackUrl) return { config: null, problems: [] };

  const problems: string[] = [];
  if (!clientId) problems.push("ATLASSIAN_CLIENT_ID");
  if (!clientSecret) problems.push("ATLASSIAN_CLIENT_SECRET");
  let callbackOk = false;
  try {
    const url = new URL(callbackUrl);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const secureEnough = url.protocol === "https:" || (url.protocol === "http:" && local && env.NODE_ENV !== "production");
    callbackOk = secureEnough && url.pathname === ATLASSIAN_CALLBACK_PATH && !url.search && !url.hash && !url.username;
  } catch {
    callbackOk = false;
  }
  if (!callbackOk) problems.push("ATLASSIAN_CALLBACK_URL");
  return problems.length > 0 ? { config: null, problems } : { config: { clientId, clientSecret, callbackUrl }, problems };
}

export function getAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = env.NODE_ENV === "production";
  if (!production && env.DASHBOARD_AUTH_DISABLED === "true") return { status: "disabled" };

  const problems: string[] = [];
  const { users, malformed } = parseUsers(env.DASHBOARD_USERS);
  if (malformed > 0) problems.push("DASHBOARD_USERS");
  const allowed = parseAllowedEmails(env.DASHBOARD_ALLOWED_EMAILS);
  if (allowed.malformed > 0) problems.push("DASHBOARD_ALLOWED_EMAILS");
  const atlassian = parseAtlassianConfig(env);
  problems.push(...atlassian.problems);
  const projectAccessRaw = env.DASHBOARD_JIRA_PROJECT_ACCESS?.trim().toLowerCase() ?? "";
  if (projectAccessRaw && projectAccessRaw !== "true" && projectAccessRaw !== "false") problems.push("DASHBOARD_JIRA_PROJECT_ACCESS");
  const projectAccess = projectAccessRaw === "true";
  // Someone must be able to sign in: a password user, or Atlassian with an allowlist / project access.
  if (users.size === 0 && !(atlassian.config && (allowed.emails.size > 0 || projectAccess))) {
    problems.push(atlassian.config ? "DASHBOARD_ALLOWED_EMAILS" : "DASHBOARD_USERS");
  }
  const sessionSecret = env.DASHBOARD_SESSION_SECRET ?? "";
  if (sessionSecret.length < 32) problems.push("DASHBOARD_SESSION_SECRET");
  const hours = env.DASHBOARD_SESSION_HOURS ? Number(env.DASHBOARD_SESSION_HOURS) : 168;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 720) problems.push("DASHBOARD_SESSION_HOURS");

  if (problems.length > 0) return { status: "misconfigured", problems: [...new Set(problems)] };
  return {
    status: "enabled",
    users,
    allowedEmails: new Set([...allowed.emails, ...users.keys()]),
    atlassian: atlassian.config,
    projectAccess: projectAccess && atlassian.config !== null,
    sessionSecret,
    sessionMaxAgeSeconds: Math.round(hours * 3600),
  };
}

/**
 * Short fingerprint of a user's password hash, stored in the session so that changing a
 * user's password (or removing them) invalidates their existing sessions.
 */
export function passwordVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 12);
}

/** Non-reversible identifier for logs (no raw emails in logs). */
export function emailFingerprint(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 12);
}
