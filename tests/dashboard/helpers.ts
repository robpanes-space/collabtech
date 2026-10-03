import { createDashboardContext } from "@/lib/dashboard/context";
import { normalizeIssue, normalizeProjectData } from "@/lib/jira/normalize";
import type { RawJiraIssue, RawJiraSprint } from "@/lib/jira/schemas";
import type { NormalizedProjectData } from "@/lib/jira/types";
import { defaultOptions, fixtures, rawIssue, STORY_POINTS_FIELD } from "../fixtures/jira";

export const NOW = new Date("2026-10-03T12:00:00.000Z");

type RawOverrides = Parameters<typeof rawIssue>[0] & {
  assignee?: { accountId: string; displayName: string } | null;
  resolvedAt?: string;
};

/** Raw issue with extra conveniences (assignee, resolution date). */
export function raw(overrides: RawOverrides = {}): RawJiraIssue {
  const { assignee, resolvedAt, ...rest } = overrides;
  return rawIssue({
    ...rest,
    extraFields: {
      ...(assignee ? { assignee: { ...assignee, active: true } } : {}),
      ...(resolvedAt ? { resolutiondate: resolvedAt } : {}),
      ...rest.extraFields,
    },
  });
}

export const issue = (overrides: RawOverrides = {}) => normalizeIssue(raw(overrides), defaultOptions);

export function sprint(
  id: number,
  name: string,
  state: RawJiraSprint["state"],
  dates: Partial<Pick<RawJiraSprint, "startDate" | "endDate" | "completeDate">> = {},
): RawJiraSprint {
  return { id, name, state, ...dates };
}

const blocksType = { name: "Blocks", inward: "is blocked by", outward: "blocks" };
/** Link meaning "this issue is blocked by `key`" (open blocker). */
export const blockedBy = (key: string, category: "new" | "indeterminate" | "done" = "new") => ({
  type: blocksType,
  inwardIssue: { id: "1", key, fields: { status: { name: "x", statusCategory: { key: category } } } },
});

export function buildData(input: {
  sprints?: RawJiraSprint[];
  sprintIssues?: Record<number, RawJiraIssue[]>;
  projectIssues?: RawJiraIssue[];
  storyPointsField?: string | null;
  sprintField?: string | null;
}): NormalizedProjectData {
  return normalizeProjectData(
    {
      project: fixtures.project(),
      board: fixtures.board(),
      sprints: input.sprints ?? [],
      sprintIssues: input.sprintIssues ?? {},
      projectIssues: input.projectIssues ?? [],
    },
    {
      storyPointsField: input.storyPointsField === undefined ? STORY_POINTS_FIELD : input.storyPointsField,
      sprintField: input.sprintField ?? null,
    },
    NOW,
  );
}

export const ctxFor = (data: NormalizedProjectData, now = NOW) => createDashboardContext(data, now);
