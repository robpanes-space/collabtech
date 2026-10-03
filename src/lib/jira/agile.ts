import "server-only";
import { jiraFetch, jiraPaginate } from "./client";
import { getJiraConfig } from "./config";
import {
  jiraBoardConfigurationSchema,
  jiraBoardSchema,
  jiraIssuePageSchema,
  jiraSprintPageSchema,
  jiraSprintSchema,
  type RawJiraBoard,
  type RawJiraBoardConfiguration,
  type RawJiraIssue,
  type RawJiraIssuePage,
  type RawJiraSprint,
  type RawJiraSprintPage,
} from "./schemas";
import type { SprintState } from "./types";

const AGILE = "/rest/agile/1.0";

/** Fields requested for every issue fetch. Custom fields are appended by callers. */
export const BASE_ISSUE_FIELDS = [
  "summary",
  "issuetype",
  "status",
  "assignee",
  "priority",
  "labels",
  "parent",
  "issuelinks",
  "created",
  "updated",
  "resolutiondate",
  "duedate",
  "sprint",
  "closedSprints",
] as const;

function issueFields(extraFields: string[] = []): string {
  return [...BASE_ISSUE_FIELDS, ...extraFields].join(",");
}

export async function getBoard(boardId = getJiraConfig().boardId): Promise<RawJiraBoard> {
  return jiraFetch(`${AGILE}/board/${boardId}`, { schema: jiraBoardSchema });
}

export async function getBoardConfiguration(
  boardId = getJiraConfig().boardId,
): Promise<RawJiraBoardConfiguration> {
  return jiraFetch(`${AGILE}/board/${boardId}/configuration`, { schema: jiraBoardConfigurationSchema });
}

export async function getSprints(
  boardId = getJiraConfig().boardId,
  states: SprintState[] = ["active", "future", "closed"],
): Promise<RawJiraSprint[]> {
  return jiraPaginate<RawJiraSprintPage, RawJiraSprint>(
    `${AGILE}/board/${boardId}/sprint`,
    (page) => ({ ...page, items: page.values }),
    { schema: jiraSprintPageSchema, query: { state: states.join(",") } },
  );
}

export async function getSprint(sprintId: number): Promise<RawJiraSprint> {
  return jiraFetch(`${AGILE}/sprint/${sprintId}`, { schema: jiraSprintSchema });
}

export async function getSprintIssues(sprintId: number, extraFields: string[] = []): Promise<RawJiraIssue[]> {
  return jiraPaginate<RawJiraIssuePage, RawJiraIssue>(
    `${AGILE}/sprint/${sprintId}/issue`,
    (page) => ({ ...page, items: page.issues }),
    { schema: jiraIssuePageSchema, query: { fields: issueFields(extraFields) } },
  );
}

export async function getBacklogIssues(
  boardId = getJiraConfig().boardId,
  extraFields: string[] = [],
): Promise<RawJiraIssue[]> {
  return jiraPaginate<RawJiraIssuePage, RawJiraIssue>(
    `${AGILE}/board/${boardId}/backlog`,
    (page) => ({ ...page, items: page.issues }),
    { schema: jiraIssuePageSchema, query: { fields: issueFields(extraFields) } },
  );
}
