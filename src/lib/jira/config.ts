import "server-only";
import { parseJiraEnv } from "./env-schema";
import { JiraApiError } from "./errors";

export type JiraConfig = {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  boardId: number;
  storyPointsField: string | null;
  riskField: string | null;
  epicLinkField: string | null;
  blockedStatusNames: string[];
};

/**
 * Reads Jira configuration from server-side environment variables.
 * Throws CONFIG_MISSING listing only the *names* of invalid variables, never their values.
 */
export function getJiraConfig(): JiraConfig {
  const parsed = parseJiraEnv(process.env);

  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new JiraApiError("CONFIG_MISSING", {
      detail: `Missing or invalid Jira environment variables: ${names.join(", ")}`,
    });
  }

  const env = parsed.data;
  return {
    baseUrl: env.JIRA_BASE_URL,
    email: env.JIRA_EMAIL,
    apiToken: env.JIRA_API_TOKEN,
    projectKey: env.JIRA_PROJECT_KEY,
    boardId: env.JIRA_BOARD_ID,
    storyPointsField: env.JIRA_STORY_POINTS_FIELD ?? null,
    riskField: env.JIRA_RISK_FIELD ?? null,
    epicLinkField: env.JIRA_EPIC_LINK_FIELD ?? null,
    blockedStatusNames: (env.JIRA_BLOCKED_STATUSES ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  };
}
