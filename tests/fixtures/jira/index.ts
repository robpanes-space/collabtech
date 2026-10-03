import { readFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import {
  jiraBoardSchema,
  jiraIssueSchema,
  jiraProjectSchema,
  jiraSearchJqlPageSchema,
  jiraSprintPageSchema,
  type RawJiraIssue,
} from "@/lib/jira/schemas";
import type { NormalizeOptions } from "@/lib/jira/normalize";

/** Synthetic Jira payloads (fake site/accounts). Parsed through the production schemas. */
function load<T>(file: string, schema: z.ZodType<T>): T {
  const raw: unknown = JSON.parse(readFileSync(path.join(import.meta.dirname, file), "utf8"));
  return schema.parse(raw);
}

export const STORY_POINTS_FIELD = "customfield_10016";
export const defaultOptions: NormalizeOptions = { storyPointsField: STORY_POINTS_FIELD };

export const fixtures = {
  project: () => load("project.json", jiraProjectSchema),
  board: () => load("board.json", jiraBoardSchema),
  sprints: () => load("sprints.json", jiraSprintPageSchema).values,
  issues: () => load("issues.json", jiraSearchJqlPageSchema).issues,
  blockedIssue: () => load("blocked-issue.json", jiraIssueSchema),
  riskP0: () => load("risk-p0.json", jiraIssueSchema),
  riskP1: () => load("risk-p1.json", jiraIssueSchema),
  unestimatedIssue: () => load("unestimated-issue.json", jiraIssueSchema),
};

const CATEGORY_KEYS = { todo: "new", in_progress: "indeterminate", done: "done" } as const;

let nextId = 500;

/** Builds a minimal raw Jira issue for scenario tests. */
export function rawIssue(
  overrides: {
    key?: string;
    summary?: string;
    type?: "Story" | "Task" | "Epic" | "Subtask";
    category?: keyof typeof CATEGORY_KEYS;
    points?: unknown;
    parent?: { key: string; type?: string | null };
    links?: unknown[];
    labels?: string[];
    priority?: string | null;
    extraFields?: Record<string, unknown>;
  } = {},
): RawJiraIssue {
  const id = nextId++;
  const type = overrides.type ?? "Story";
  const hierarchyLevel = type === "Epic" ? 1 : type === "Subtask" ? -1 : 0;
  const category = overrides.category ?? "todo";
  const fields: Record<string, unknown> = {
    summary: overrides.summary ?? `Work item ${id}`,
    issuetype: { id: String(id), name: type, subtask: type === "Subtask", hierarchyLevel },
    status: { id: "1", name: category, statusCategory: { key: CATEGORY_KEYS[category] } },
    assignee: null,
    priority: overrides.priority === null ? null : { id: "3", name: overrides.priority ?? "Medium" },
    labels: overrides.labels ?? [],
    issuelinks: overrides.links ?? [],
    created: "2026-09-01T00:00:00.000Z",
    updated: "2026-09-02T00:00:00.000Z",
    ...overrides.extraFields,
  };
  if ("points" in overrides) fields[STORY_POINTS_FIELD] = overrides.points;
  if (overrides.parent) {
    fields.parent = {
      id: "1",
      key: overrides.parent.key,
      fields:
        overrides.parent.type === null
          ? undefined
          : { summary: "Parent", issuetype: { name: overrides.parent.type ?? "Epic" } },
    };
  }
  return jiraIssueSchema.parse({ id: String(id), key: overrides.key ?? `SCRUM-${id}`, fields });
}
