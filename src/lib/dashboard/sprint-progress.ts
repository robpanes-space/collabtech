import type { DashboardIssue, NormalizedSprint } from "@/lib/jira/types";
import type { DashboardContext } from "./context";
import { progressFields, roundPercent, workCounts } from "./metrics";
import { blockingIssues } from "./blockers";
import { assessSprintHealth, elapsedPercent } from "./sprint-health";
import type { SprintDashboardDto, SprintRefDto, WorkItemDto, WorkItemGroup } from "./types";
import { summarizeWork } from "./work-progress";

/**
 * Sprint progress = summarizeWork(sprint delivery work items) — see jira-metrics skill.
 * Sprint scope uses isDeliveryWorkItem (not project scope): anything Jira put in the sprint
 * is sprint work, including items under future milestones.
 */

/** Display group: done first by category, then blocked, then the remaining category. */
export function workItemGroup(issue: DashboardIssue): WorkItemGroup {
  if (issue.status.category === "done") return "done";
  if (issue.blocked) return "blocked";
  return issue.status.category;
}

const MIGRATION_PREFIX = /^\s*MIG\s+S\d{1,3}\s*[-–—:]?\s*/i;

/** "MIG S3 - Loads Quotes I" → "Loads Quotes I"; other names unchanged. */
export function sprintShortName(name: string): string {
  return name.replace(MIGRATION_PREFIX, "").trim() || name;
}

export function toWorkItemDto(issue: DashboardIssue, ctx: DashboardContext): WorkItemDto {
  return {
    key: issue.key,
    jiraUrl: ctx.issueUrl(issue.key),
    summary: issue.summary,
    type: issue.issueType.name,
    status: issue.status.name,
    statusCategory: issue.status.category,
    assignee: issue.assignee?.displayName ?? null,
    storyPoints: issue.storyPoints,
    blocked: issue.blocked,
    blockers: issue.blockers,
    blockedBy: blockingIssues(issue, ctx),
    riskSeverity: issue.riskSeverity,
    milestoneKey: issue.epicKey,
    milestoneLabel: ctx.milestoneLabel(issue.epicKey),
    group: workItemGroup(issue),
    updatedAt: issue.updatedAt,
    dueDate: issue.dueDate,
  };
}

export function sprintWork(sprint: NormalizedSprint, ctx: DashboardContext): DashboardIssue[] {
  return sprint.issues.filter(ctx.scope.isDeliveryWorkItem);
}

/** Milestones touched by the sprint's work, in milestone-number then key order. */
export function sprintMilestoneKeys(work: readonly DashboardIssue[], ctx: DashboardContext): string[] {
  const keys = [...new Set(work.map((issue) => issue.epicKey).filter((key): key is string => key !== null))];
  const order = (key: string) => ctx.milestoneNumberByKey.get(key) ?? Number.POSITIVE_INFINITY;
  return keys.sort((a, b) => order(a) - order(b) || a.localeCompare(b, "en", { numeric: true }));
}

export function buildSprintDto(sprint: NormalizedSprint, ctx: DashboardContext): SprintDashboardDto {
  const work = sprintWork(sprint, ctx);
  const summary = summarizeWork(work);
  const elapsed = elapsedPercent(sprint, ctx.now);

  return {
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
    goal: sprint.goal,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    completeDate: sprint.completeDate,
    isMigrationSprint: sprint.migrationSprintNumber !== null,
    roadmapPosition: sprint.migrationSprintNumber,
    shortName: sprintShortName(sprint.name),
    ...workCounts(summary),
    ...progressFields(summary),
    storyPointsCommitted: summary.storyPointsTotal,
    storyPointsCompleted: summary.storyPointsCompleted,
    storyPointsRemaining:
      summary.storyPointsTotal === null ? null : summary.storyPointsTotal - (summary.storyPointsCompleted ?? 0),
    elapsedPercent: elapsed === null ? null : roundPercent(elapsed),
    health: assessSprintHealth({ sprint, work: summary, issues: sprint.issues, p0Keys: ctx.p0Keys, now: ctx.now }),
    milestoneKeys: sprintMilestoneKeys(work, ctx),
    workItems: work.map((issue) => toWorkItemDto(issue, ctx)),
  };
}

/** Migration roadmap: sprints matching MIG S<n>, ordered by n (then Jira ID). */
export function migrationRoadmap(sprints: readonly NormalizedSprint[]): NormalizedSprint[] {
  return sprints
    .filter((sprint) => sprint.migrationSprintNumber !== null)
    .sort((a, b) => (a.migrationSprintNumber ?? 0) - (b.migrationSprintNumber ?? 0) || a.id - b.id);
}

export function toSprintRef(sprint: Pick<SprintDashboardDto, keyof SprintRefDto>): SprintRefDto {
  return {
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
    roadmapPosition: sprint.roadmapPosition,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
  };
}

/**
 * First roadmap sprint that is not closed and whose delivery work is not complete
 * (empty sprints count as not complete). May be the active migration sprint itself.
 */
export function nextMigrationSprint(roadmap: readonly SprintDashboardDto[]): SprintDashboardDto | null {
  return (
    roadmap.find(
      (sprint) =>
        sprint.state !== "closed" &&
        !(sprint.totalWorkItems > 0 && sprint.completedWorkItems === sprint.totalWorkItems),
    ) ?? null
  );
}

/**
 * The sprint after the active migration sprint in roadmap order (null when it is the last).
 * Without an active migration sprint, falls back to nextMigrationSprint().
 * Non-migration active sprints (e.g. a setup sprint) never affect the result.
 */
export function followingMigrationSprint(roadmap: readonly SprintDashboardDto[]): SprintDashboardDto | null {
  const activeIndex = roadmap.findIndex((sprint) => sprint.state === "active");
  if (activeIndex === -1) return nextMigrationSprint(roadmap);
  return roadmap[activeIndex + 1] ?? null;
}
