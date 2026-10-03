import "server-only";
import { z } from "zod";
import { BASE_ISSUE_FIELDS, getBoardConfiguration } from "./agile";
import { jiraFetch, jiraPaginateToken } from "./client";
import { getJiraConfig } from "./config";
import { isJiraApiError } from "./errors";
import {
  jiraFieldListSchema,
  jiraMyselfSchema,
  jiraProjectSchema,
  jiraSearchJqlPageSchema,
  type RawJiraField,
  type RawJiraIssue,
  type RawJiraMyself,
  type RawJiraProject,
  type RawJiraSearchJqlPage,
} from "./schemas";

const PLATFORM = "/rest/api/3";

/** Field names Jira uses for story points (team-managed, then company-managed). */
const STORY_POINT_FIELD_NAMES = ["Story point estimate", "Story Points", "Story points"];

export async function getMyself(options: { revalidate?: number | false } = {}): Promise<RawJiraMyself> {
  return jiraFetch(`${PLATFORM}/myself`, { schema: jiraMyselfSchema, ...options });
}

export async function getProject(
  projectKey = getJiraConfig().projectKey,
  options: { revalidate?: number | false } = {},
): Promise<RawJiraProject> {
  return jiraFetch(`${PLATFORM}/project/${encodeURIComponent(projectKey)}`, {
    schema: jiraProjectSchema,
    ...options,
  });
}

export async function getFields(): Promise<RawJiraField[]> {
  return jiraFetch(`${PLATFORM}/field`, { schema: jiraFieldListSchema, revalidate: 3600 });
}

export type StoryPointsFieldResolution = {
  fieldId: string | null;
  source: "env" | "boardConfiguration" | "fieldDiscovery" | "notFound";
};

/**
 * Resolves the story-points custom field without hard-coding IDs:
 * env override → board estimation config → field name discovery.
 */
export async function resolveStoryPointsField(): Promise<StoryPointsFieldResolution> {
  const config = getJiraConfig();
  if (config.storyPointsField) return { fieldId: config.storyPointsField, source: "env" };

  try {
    const boardConfig = await getBoardConfiguration(config.boardId);
    const fieldId = boardConfig.estimation?.field?.fieldId;
    if (fieldId && fieldId.startsWith("customfield_")) {
      return { fieldId, source: "boardConfiguration" };
    }
  } catch (error) {
    // Board config may be forbidden for some accounts; fall through to discovery.
    // Auth/availability failures are not recoverable here, so rethrow them.
    if (!isJiraApiError(error) || (error.code !== "FORBIDDEN" && error.code !== "NOT_FOUND")) throw error;
  }

  const fields = await getFields();
  for (const name of STORY_POINT_FIELD_NAMES) {
    const match = fields.find((field) => field.custom && field.name.toLowerCase() === name.toLowerCase());
    if (match) return { fieldId: match.id, source: "fieldDiscovery" };
  }
  return { fieldId: null, source: "notFound" };
}

const projectStatusesSchema = z.array(
  z.object({
    name: z.string(),
    statuses: z.array(z.object({ id: z.string(), name: z.string(), statusCategory: z.object({ key: z.string().nullish() }).nullish() })),
  }),
);

export type ProjectStatus = { id: string; name: string; categoryKey: string | null };

/** Workflow statuses used by the project (deduplicated across issue types). */
export async function getProjectStatuses(projectKey = getJiraConfig().projectKey): Promise<ProjectStatus[]> {
  const byIssueType = await jiraFetch(`${PLATFORM}/project/${encodeURIComponent(projectKey)}/statuses`, {
    schema: projectStatusesSchema,
    revalidate: 3600,
  });
  const byId = new Map<string, ProjectStatus>();
  for (const type of byIssueType) {
    for (const status of type.statuses) byId.set(status.id, { id: status.id, name: status.name, categoryKey: status.statusCategory?.key ?? null });
  }
  return [...byId.values()];
}

/** Jira's Sprint field (custom type "gh-sprint"); its ID differs per site, so it is discovered. */
const SPRINT_FIELD_TYPE = "com.pyxis.greenhopper.jira:gh-sprint";

export async function resolveSprintField(): Promise<string | null> {
  const fields = await getFields();
  return fields.find((field) => field.custom && field.schema?.custom === SPRINT_FIELD_TYPE)?.id ?? null;
}

/**
 * Searches issues with JQL (server-side only; JQL is never shown to clients).
 * Callers must build JQL from validated/config values only.
 */
export async function searchIssues(jql: string, extraFields: string[] = []): Promise<RawJiraIssue[]> {
  return jiraPaginateToken<RawJiraSearchJqlPage, RawJiraIssue>(`${PLATFORM}/search/jql`, (page) => page.issues, {
    schema: jiraSearchJqlPageSchema,
    query: { jql, fields: [...BASE_ISSUE_FIELDS, ...extraFields].join(",") },
  });
}

/** All issues in the configured project (epics, stories, tasks, risks). */
export async function getProjectIssues(extraFields: string[] = []): Promise<RawJiraIssue[]> {
  const { projectKey } = getJiraConfig();
  // projectKey is validated config, quoted to be safe.
  return searchIssues(`project = "${projectKey.replace(/"/g, "")}" ORDER BY created ASC`, extraFields);
}
