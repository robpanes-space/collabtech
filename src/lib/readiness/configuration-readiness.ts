import { check, listNames, type ReadinessContext } from "./context";
import type { ReadinessCheck } from "./types";

export function fieldChecks(ctx: ReadinessContext): ReadinessCheck[] {
  const { storyPointsField, sprintField } = ctx.data.metadata;
  return [
    check({
      code: "STORY_POINT_FIELD",
      category: "jira_configuration",
      importance: "important",
      title: "Story-point field",
      status: storyPointsField ? "pass" : "warning",
      message: storyPointsField ? "Story-point estimates are readable from Jira." : "No story-point field was found on the board.",
      action: storyPointsField ? null : 'Enable estimation on the board ("Story point estimate"), or set JIRA_STORY_POINTS_FIELD.',
    }),
    check({
      code: "SPRINT_FIELD",
      category: "jira_configuration",
      importance: "important",
      title: "Sprint history field",
      status: sprintField ? "pass" : "warning",
      message: sprintField
        ? "Sprint membership history is readable from Jira."
        : "The Sprint field was not found, so sprint membership history cannot be reconstructed.",
      action: sprintField ? null : "Check that the Jira account can see the Sprint field on project issues.",
    }),
  ];
}

/**
 * BLOCKED_STATUS_CONFIG
 *   important warning  a configured JIRA_BLOCKED_STATUSES name does not exist in the workflow (typo)
 *   info warning       the workflow has a status named exactly "Blocked" that is not configured
 *   pass               configured names all exist
 *   n/a                nothing configured and no such status
 * Only an exact (case-insensitive) "Blocked" name is suggested — names merely containing
 * "blocked" are never assumed to mean blocked.
 */
export function blockedStatusConfigCheck(ctx: ReadinessContext): ReadinessCheck {
  const configured = ctx.config.blockedStatusNames;
  const statuses = ctx.projectStatuses;
  const base = { code: "BLOCKED_STATUS_CONFIG", category: "jira_configuration", title: "Blocked status detection" } as const;
  const known = new Set((statuses ?? []).map((s) => s.name.trim().toLowerCase()));

  if (statuses !== null) {
    const unknown = configured.filter((name) => !known.has(name.trim().toLowerCase()));
    if (unknown.length > 0) {
      return check({
        ...base,
        importance: "important",
        status: "warning",
        message: `JIRA_BLOCKED_STATUSES lists ${listNames(unknown.map((n) => `"${n}"`))}, which ${unknown.length === 1 ? "is" : "are"} not a status in this project's workflow.`,
        action: "Correct JIRA_BLOCKED_STATUSES to match the exact Jira status names.",
      });
    }
  }
  if (configured.length > 0) {
    return check({
      ...base,
      importance: "informational",
      status: "pass",
      message: `Work in status ${listNames(configured.map((n) => `"${n}"`))} counts as blocked, in addition to "is blocked by" links.`,
    });
  }
  const blockedStatus = (statuses ?? []).find((s) => s.name.trim().toLowerCase() === "blocked");
  if (blockedStatus) {
    return check({
      ...base,
      importance: "informational",
      status: "warning",
      message: `Jira includes a "${blockedStatus.name}" workflow status, but status-based blocker detection is not configured.`,
      action: `If work in "${blockedStatus.name}" should count as blocked, set JIRA_BLOCKED_STATUSES=${blockedStatus.name} in the deployment environment.`,
    });
  }
  return check({
    ...base,
    importance: "informational",
    status: "not_applicable",
    message: 'Blockers come from Jira "is blocked by" links.',
  });
}

export function clientDashboardChecks(ctx: ReadinessContext): ReadinessCheck[] {
  const { authStatus, timeZone, timeZoneValid, jiraLinksEnabled } = ctx.config;
  return [
    check({
      code: "CLIENT_ACCESS",
      category: "client_dashboard",
      importance: "critical",
      title: "Client sign-in",
      status: authStatus === "enabled" ? "pass" : authStatus === "disabled" ? "warning" : "fail",
      message:
        authStatus === "enabled"
          ? "Sign-in is required for every page and API."
          : authStatus === "disabled"
            ? "Sign-in is disabled (development only)."
            : "Sign-in is not configured, so the dashboard is unavailable.",
      action:
        authStatus === "enabled"
          ? null
          : "Configure DASHBOARD_USERS and DASHBOARD_SESSION_SECRET (see docs/deployment.md).",
    }),
    projectAccessCheck(ctx),
    check({
      code: "DISPLAY_TIME_ZONE",
      category: "client_dashboard",
      importance: "important",
      title: "Display time zone",
      status: timeZone && timeZoneValid ? "pass" : "warning",
      message:
        timeZone && timeZoneValid
          ? `Dates and times are shown in ${timeZone}.`
          : timeZone
            ? `DASHBOARD_TIME_ZONE "${timeZone}" is not a valid time zone; UTC is used.`
            : "DASHBOARD_TIME_ZONE is not set; dates are shown in UTC.",
      action: timeZone && timeZoneValid ? null : "Set DASHBOARD_TIME_ZONE to the client's IANA time zone (e.g. Asia/Manila).",
    }),
    check({
      code: "JIRA_LINKS",
      category: "client_dashboard",
      importance: "informational",
      title: "Jira links",
      status: "pass",
      message: jiraLinksEnabled
        ? "Work items link to Jira. Confirm the client has Jira access, or set DASHBOARD_JIRA_LINKS=false."
        : "Jira links are hidden from clients.",
    }),
  ];
}

/**
 * PROJECT_ACCESS_SIGN_IN — who can "Sign in with Atlassian" through Jira project access.
 *   n/a      mode off (email allowlist only)
 *   warning  the project is open to every Jira user on the site, so all of them can sign in
 *   pass     only people with access to the project can sign in
 */
export function projectAccessCheck(ctx: ReadinessContext): ReadinessCheck {
  const base = { code: "PROJECT_ACCESS_SIGN_IN", category: "client_dashboard", importance: "important", title: "Sign-in through Jira project access" } as const;
  const access = ctx.config.projectAccess;
  if (access === undefined) {
    return check({ ...base, status: "not_applicable", message: "Atlassian sign-in uses the email allowlist only." });
  }
  if (access === null) {
    return check({
      ...base,
      status: "warning",
      message: "Project access could not be read from Jira, so project members cannot be verified right now.",
      action: "Check that the Jira service account can browse users (Browse users and groups permission).",
    });
  }
  const people = `${access.memberCount} ${access.memberCount === 1 ? "person has" : "people have"} access to the Jira project`;
  if (access.openToSite) {
    return check({
      ...base,
      status: "warning",
      message: `Anyone with Jira access on this site can sign in, because the project is open to all site users (${people}).`,
      action: "To limit sign-in to invited people, set the project's access to Private in Jira (Project settings → Access) and invite clients to the project (Member or Viewer).",
    });
  }
  return check({
    ...base,
    status: "pass",
    message: `${people} and can sign in with Atlassian${access.openToSite === null ? " (could not verify whether the project is open to the whole site)" : ""}.`,
  });
}
