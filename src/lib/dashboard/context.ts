import type { DashboardIssue, NormalizedProjectData } from "@/lib/jira/types";
import { jiraIssueUrl } from "@/lib/jira/links";
import { openP0Keys } from "./risks";
import { createWorkScope, DEFAULT_SCOPE_CONFIG, type ScopeConfig, type WorkScope } from "./scope";

/** Values derived once per dashboard build and shared by every metric. */
export type DashboardContext = {
  data: NormalizedProjectData;
  now: Date;
  scope: WorkScope;
  p0Keys: ReadonlySet<string>;
  issueByKey: ReadonlyMap<string, DashboardIssue>;
  milestoneNumberByKey: ReadonlyMap<string, number | null>;
  /** "M1" for an epic key whose milestone follows the M<n> convention. */
  milestoneLabel: (epicKey: string | null) => string | null;
  /** Safe Jira browse URL for an issue key, or null when links are disabled. */
  issueUrl: (key: string) => string | null;
};

export function createDashboardContext(
  data: NormalizedProjectData,
  now: Date,
  scopeConfig: ScopeConfig = DEFAULT_SCOPE_CONFIG,
  jiraBrowseBaseUrl: string | null = null,
): DashboardContext {
  const milestoneNumberByKey = new Map(data.milestones.map((m) => [m.key, m.milestoneNumber]));
  return {
    data,
    now,
    scope: createWorkScope(data, scopeConfig),
    p0Keys: openP0Keys(data.issues),
    issueByKey: new Map(data.issues.map((issue) => [issue.key, issue])),
    milestoneNumberByKey,
    milestoneLabel: (epicKey) => {
      const number = epicKey === null ? null : (milestoneNumberByKey.get(epicKey) ?? null);
      return number === null ? null : `M${number}`;
    },
    issueUrl: (key) => jiraIssueUrl(jiraBrowseBaseUrl, key),
  };
}
