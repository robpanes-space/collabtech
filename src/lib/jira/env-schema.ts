import { z } from "zod";

/**
 * Jira environment schema (no secrets here — only parsing). Shared by getJiraConfig() and
 * startup validation. Error reporting must use variable NAMES only, never values.
 */
export const jiraEnvSchema = z.object({
  JIRA_BASE_URL: z
    .url()
    .refine((url) => url.startsWith("https://"), "Jira Cloud must use https")
    .transform((url) => url.replace(/\/+$/, "")),
  JIRA_EMAIL: z.string().min(1),
  JIRA_API_TOKEN: z.string().min(1),
  JIRA_PROJECT_KEY: z.string().min(1).default("SCRUM"),
  JIRA_BOARD_ID: z.coerce.number().int().positive(),
  /** Optional override; otherwise discovered from board configuration / field metadata. */
  JIRA_STORY_POINTS_FIELD: z.string().min(1).optional(),
  /** Optional custom field holding P0/P1 risk severity. */
  JIRA_RISK_FIELD: z.string().min(1).optional(),
  /** Optional legacy "Epic Link" custom field (only used when an issue has no `parent`). */
  JIRA_EPIC_LINK_FIELD: z.string().min(1).optional(),
  /** Optional comma-separated status names meaning "blocked" (in addition to blocker links). */
  JIRA_BLOCKED_STATUSES: z.string().optional(),
});

export function parseJiraEnv(env: NodeJS.ProcessEnv) {
  return jiraEnvSchema.safeParse({
    JIRA_BASE_URL: env.JIRA_BASE_URL,
    JIRA_EMAIL: env.JIRA_EMAIL,
    JIRA_API_TOKEN: env.JIRA_API_TOKEN,
    JIRA_PROJECT_KEY: env.JIRA_PROJECT_KEY || undefined,
    JIRA_BOARD_ID: env.JIRA_BOARD_ID,
    JIRA_STORY_POINTS_FIELD: env.JIRA_STORY_POINTS_FIELD || undefined,
    JIRA_RISK_FIELD: env.JIRA_RISK_FIELD || undefined,
    JIRA_EPIC_LINK_FIELD: env.JIRA_EPIC_LINK_FIELD || undefined,
    JIRA_BLOCKED_STATUSES: env.JIRA_BLOCKED_STATUSES || undefined,
  });
}

/** Names of missing/invalid Jira variables. */
export function jiraEnvProblems(env: NodeJS.ProcessEnv): string[] {
  const parsed = parseJiraEnv(env);
  return parsed.success ? [] : [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
}
