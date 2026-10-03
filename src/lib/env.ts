import { getAuthConfig } from "@/lib/auth/config";
import { jiraEnvProblems } from "@/lib/jira/env-schema";

/**
 * Whole-application configuration check (startup + /api/health). Reports variable NAMES only.
 *
 * Production requires: JIRA_* (see .env.example), DASHBOARD_USERS, DASHBOARD_SESSION_SECRET and
 * a valid DASHBOARD_TIME_ZONE. Outside production a missing time zone or disabled auth are
 * warnings only.
 */
export type EnvironmentReport = { ok: boolean; problems: string[]; warnings: string[] };

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): EnvironmentReport {
  const production = env.NODE_ENV === "production";
  const problems = [...jiraEnvProblems(env)];
  const warnings: string[] = [];

  const auth = getAuthConfig(env);
  if (auth.status === "misconfigured") problems.push(...auth.problems);
  if (auth.status === "disabled") warnings.push("DASHBOARD_AUTH_DISABLED (development only)");

  const timeZone = env.DASHBOARD_TIME_ZONE?.trim();
  if (!timeZone) (production ? problems : warnings).push("DASHBOARD_TIME_ZONE");
  else if (!validTimeZone(timeZone)) problems.push("DASHBOARD_TIME_ZONE");

  if (env.DASHBOARD_JIRA_LINKS && !["true", "false"].includes(env.DASHBOARD_JIRA_LINKS)) {
    problems.push("DASHBOARD_JIRA_LINKS");
  }

  return { ok: problems.length === 0, problems: [...new Set(problems)], warnings };
}
