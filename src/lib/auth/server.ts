import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAuthConfig, isAdminEmail } from "./config";
import { toJiraApiError } from "@/lib/jira/errors";
import { isProjectMember } from "@/lib/jira/project-access";
import { log } from "@/lib/log";
import { resolveSession, sessionCookieName, sessionCookieOptions, type Session } from "./session";

/** Development-only session used when DASHBOARD_AUTH_DISABLED=true outside production. */
const DEV_SESSION: Session = {
  email: "local-development",
  displayName: "Local development",
  authProvider: "password",
  accessVia: "allowlist",
  expiresAt: "9999-12-31T00:00:00.000Z",
};

/**
 * Current session from the request cookie, or null. Never throws.
 * Sessions granted through Jira project access are re-checked against the (5-minute cached)
 * project member list, so removing someone from the Jira project removes dashboard access.
 * If the check cannot be made (Jira unavailable and nothing cached) access is denied.
 */
export async function getSession(): Promise<Session | null> {
  const config = getAuthConfig();
  if (config.status === "disabled") return DEV_SESSION;
  const token = (await cookies()).get(sessionCookieName())?.value;
  const session = resolveSession(token, config, new Date());
  if (!session || session.accessVia !== "jira_project" || !session.projectAccountId) return session;
  try {
    return (await isProjectMember(session.projectAccountId)) ? session : null;
  } catch (error) {
    log("warn", "auth.project_access_check_failed", { code: toJiraApiError(error).code });
    return null;
  }
}

/** Defense in depth for pages (the proxy already redirects). */
export async function requireSession(nextPath = "/"): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return session;
}

export async function setSessionCookie(token: string, maxAgeSeconds: number): Promise<void> {
  (await cookies()).set(sessionCookieName(), token, sessionCookieOptions(maxAgeSeconds));
}

/**
 * Expires the cookie with the SAME attributes it was set with — browsers ignore a deletion of
 * a `__Host-` cookie that lacks `Secure`/`Path=/`, which would leave the user signed in.
 */
export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(sessionCookieName(), "", sessionCookieOptions(0));
}

/** Admin pages: signed in AND (no admin list configured OR listed). Others get a 404. */
export async function requireAdmin(nextPath = "/"): Promise<Session> {
  const session = await requireSession(nextPath);
  if (!isAdminEmail(session.email)) notFound();
  return session;
}

/** Admin APIs: null when signed out, "forbidden" when not an admin. */
export async function getAdminSession(): Promise<Session | null | "forbidden"> {
  const session = await getSession();
  if (!session) return null;
  return isAdminEmail(session.email) ? session : "forbidden";
}
