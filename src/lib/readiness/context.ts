import { createWorkScope, hasExclusionLabel, type WorkScope } from "@/lib/dashboard/scope";
import { isWorkItem, summarizeWork } from "@/lib/dashboard/work-progress";
import type { HistoryDto } from "@/lib/history/types";
import type { DashboardIssue, NormalizedProjectData, WorkSummary } from "@/lib/jira/types";
import type { ReadinessCheck, ReadinessItem } from "./types";

/** Everything readiness needs, prepared once. Values come from existing engines only. */
export type ReadinessInput = {
  data: NormalizedProjectData;
  /** null when the history service failed (readiness still works). */
  history: HistoryDto | null;
  /** Project workflow statuses; null when they could not be loaded. */
  projectStatuses: { id: string; name: string; categoryKey: string | null }[] | null;
  config: {
    blockedStatusNames: string[];
    authStatus: "enabled" | "disabled" | "misconfigured";
    /** Raw DASHBOARD_TIME_ZONE (null when unset) and whether it is a valid IANA zone. */
    timeZone: string | null;
    timeZoneValid: boolean;
    jiraLinksEnabled: boolean;
    /** Present when DASHBOARD_JIRA_PROJECT_ACCESS=true (and Atlassian sign-in is configured). */
    projectAccess?: { memberCount: number; openToSite: boolean | null } | null;
  };
  now: Date;
  issueUrl: (key: string) => string | null;
};

export type ReadinessContext = ReadinessInput & {
  scope: WorkScope;
  /** Committed project-scope work items (same set as overall progress). */
  projectWork: DashboardIssue[];
  projectSummary: WorkSummary;
};

export function createReadinessContext(input: ReadinessInput): ReadinessContext {
  const scope = createWorkScope(input.data);
  const projectWork = input.data.issues.filter(scope.isInProjectScope);
  return { ...input, scope, projectWork, projectSummary: summarizeWork(projectWork) };
}

export const toItem = (ctx: ReadinessContext) => (issue: DashboardIssue): ReadinessItem => ({
  key: issue.key,
  summary: issue.summary,
  jiraUrl: ctx.issueUrl(issue.key),
});

/** Work items explicitly excluded by label (exclude-from-progress / project-control). */
export function excludedWorkItems(data: NormalizedProjectData): DashboardIssue[] {
  return data.issues.filter((issue) => isWorkItem(issue) && issue.riskRegisterId === null && hasExclusionLabel(issue.labels));
}

export function check(input: Omit<ReadinessCheck, "items" | "action"> & Partial<Pick<ReadinessCheck, "items" | "action">>): ReadinessCheck {
  return { action: null, items: [], ...input };
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function listNames(names: readonly string[], max = 4): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}
