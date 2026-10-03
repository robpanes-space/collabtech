import type { DashboardIssue, NormalizedSprint } from "@/lib/jira/types";
import type { ThroughputPoint, VelocityPoint } from "./types";

/**
 * Velocity & throughput — closed migration sprints only (future/active sprints are ignored).
 *
 * Without changelog data we only know each issue's *current* status, so "completed in the
 * sprint" means: status is done AND (resolution date ≤ sprint complete date, when both exist).
 * Work finished later in another sprint is therefore not credited to the earlier sprint.
 *
 * Velocity per sprint:
 *   available            = ≥1 work item and every work item has a story-point estimate
 *   committedStoryPoints = Σ estimates of the sprint's work items        (null if unavailable)
 *   completedStoryPoints = Σ estimates of items completed in the sprint  (null if unavailable)
 * Work-item counts are never substituted into velocity.
 *
 * Throughput per sprint (always available): committed / completed work-item counts.
 */

export function completedWithinSprint(issue: DashboardIssue, sprint: Pick<NormalizedSprint, "completeDate">): boolean {
  if (issue.status.category !== "done") return false;
  if (!issue.resolvedAt || !sprint.completeDate) return true;
  return Date.parse(issue.resolvedAt) <= Date.parse(sprint.completeDate);
}

type ClosedSprintWork = { sprint: NormalizedSprint; work: DashboardIssue[] };

const point = (sprint: NormalizedSprint) => ({
  sprintId: String(sprint.id),
  sprint: sprint.name,
  roadmapPosition: sprint.migrationSprintNumber,
});

export function velocity(closed: readonly ClosedSprintWork[]): { available: boolean; points: VelocityPoint[] } {
  const points = closed.map(({ sprint, work }): VelocityPoint => {
    const available = work.length > 0 && work.every((issue) => issue.storyPoints !== null);
    if (!available) return { ...point(sprint), available, committedStoryPoints: null, completedStoryPoints: null };
    const sum = (items: DashboardIssue[]) => items.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0);
    return {
      ...point(sprint),
      available,
      committedStoryPoints: sum(work),
      completedStoryPoints: sum(work.filter((issue) => completedWithinSprint(issue, sprint))),
    };
  });
  return { available: points.some((p) => p.available), points };
}

export function throughput(closed: readonly ClosedSprintWork[]): ThroughputPoint[] {
  return closed.map(({ sprint, work }) => ({
    ...point(sprint),
    committedWorkItems: work.length,
    completedWorkItems: work.filter((issue) => completedWithinSprint(issue, sprint)).length,
  }));
}
