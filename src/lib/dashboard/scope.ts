import type { DashboardIssue, NormalizedProjectData } from "@/lib/jira/types";
import { isWorkItem } from "./work-progress";

/**
 * Work-item scope — the single place exclusion rules live (see jira-metrics skill).
 *
 * Delivery work item (used for sprint, milestone, workload and project metrics):
 *   1. not an Epic and not a Subtask                     (isWorkItem, Phase 3 rule)
 *   2. not a risk-register item ("I-01 P0 - …")          when excludeRiskRegister
 *   3. has none of `excludedLabels` — `exclude-from-progress` or `project-control`
 *      (explicit opt-out for meta/control work; never inferred from titles)
 *
 * Project scope (overall progress, project totals, workload) additionally excludes
 * work under a future/optional milestone (e.g. M9) until it has entered delivery:
 * it is in an active/closed sprint, or its status is no longer To Do.
 *
 * Ordinary Stories, Tasks and Bugs are never excluded implicitly.
 */
export type ScopeConfig = {
  excludeRiskRegister: boolean;
  excludedLabels: readonly string[];
  futureMilestoneNumbers: readonly number[];
};

export const DEFAULT_SCOPE_CONFIG: ScopeConfig = {
  excludeRiskRegister: true,
  excludedLabels: ["exclude-from-progress", "project-control"],
  futureMilestoneNumbers: [9],
};

/** Labels that explicitly remove a work item from progress (case-insensitive). */
export function hasExclusionLabel(labels: readonly string[], config: ScopeConfig = DEFAULT_SCOPE_CONFIG): boolean {
  const excluded = new Set(config.excludedLabels.map((label) => label.toLowerCase()));
  return labels.some((label) => excluded.has(label.toLowerCase()));
}

export type WorkScope = {
  isDeliveryWorkItem: (issue: DashboardIssue) => boolean;
  isInProjectScope: (issue: DashboardIssue) => boolean;
  isFutureMilestone: (epicKey: string | null) => boolean;
};

export function createWorkScope(
  data: Pick<NormalizedProjectData, "milestones" | "sprints">,
  config: ScopeConfig = DEFAULT_SCOPE_CONFIG,
): WorkScope {
  const futureEpics = new Set(
    data.milestones
      .filter((m) => m.milestoneNumber !== null && config.futureMilestoneNumbers.includes(m.milestoneNumber))
      .map((m) => m.key),
  );
  const deliverySprintIds = new Set(
    data.sprints.filter((s) => s.state === "active" || s.state === "closed").map((s) => s.id),
  );

  const isDeliveryWorkItem = (issue: DashboardIssue) =>
    isWorkItem(issue) &&
    !(config.excludeRiskRegister && issue.riskRegisterId !== null) &&
    !hasExclusionLabel(issue.labels, config);

  const isFutureMilestone = (epicKey: string | null) => epicKey !== null && futureEpics.has(epicKey);

  const hasEnteredDelivery = (issue: DashboardIssue) =>
    issue.status.category !== "todo" || (issue.sprintId !== null && deliverySprintIds.has(issue.sprintId));

  return {
    isDeliveryWorkItem,
    isFutureMilestone,
    isInProjectScope: (issue) =>
      isDeliveryWorkItem(issue) && (!isFutureMilestone(issue.epicKey) || hasEnteredDelivery(issue)),
  };
}
