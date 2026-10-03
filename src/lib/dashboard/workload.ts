import type { DashboardIssue } from "@/lib/jira/types";
import type { WorkloadEntry } from "./types";

export const UNASSIGNED_LABEL = "Unassigned";

/**
 * Unresolved work grouped by assignee (callers pass in-scope work items).
 * Done items are excluded. Unassigned work is grouped separately. Account IDs are used only to
 * group and never leave this function (privacy: display names only).
 * Sorted by open work desc, then name; Unassigned last on ties. No emails are exposed.
 */
export function workloadByAssignee(issues: readonly DashboardIssue[]): WorkloadEntry[] {
  const groups = new Map<string, Omit<WorkloadEntry, "key">>();

  for (const issue of issues) {
    if (issue.status.category === "done") continue;
    const accountId = issue.assignee?.accountId ?? null;
    const groupKey = accountId ?? "\u0000unassigned";
    const entry = groups.get(groupKey) ?? {
      unassigned: accountId === null,
      displayName: issue.assignee?.displayName ?? UNASSIGNED_LABEL,
      openWorkItems: 0,
      inProgressWorkItems: 0,
      blockedWorkItems: 0,
      storyPointsOpen: null,
    };
    entry.openWorkItems++;
    if (issue.status.category === "in_progress") entry.inProgressWorkItems++;
    if (issue.blocked) entry.blockedWorkItems++;
    if (issue.storyPoints !== null) {
      entry.storyPointsOpen = (entry.storyPointsOpen ?? 0) + issue.storyPoints;
    }
    groups.set(groupKey, entry);
  }

  let index = 0;
  return [...groups.values()]
    .sort(
      (a, b) =>
        b.openWorkItems - a.openWorkItems ||
        Number(a.unassigned) - Number(b.unassigned) ||
        a.displayName.localeCompare(b.displayName, "en"),
    )
    .map((entry) => ({ key: entry.unassigned ? "unassigned" : `assignee-${++index}`, ...entry }));
}
