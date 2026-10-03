import type { NormalizedProjectData, NormalizedSprint } from "@/lib/jira/types";
import { createDashboardContext } from "./context";
import { metric, progressMetric } from "./metrics";
import { buildMilestoneDto, milestoneProgressChart } from "./milestone-progress";
import { projectWork } from "./project-progress";
import { buildBlockedWorkItems } from "./blockers";
import { assessProjectHealth } from "./project-health";
import { buildRiskDtos, countRisks, isOpenP0, isOpenP1, riskDistribution } from "./risks";
import type { ScopeConfig } from "./scope";
import {
  buildSprintDto,
  followingMigrationSprint,
  migrationRoadmap,
  nextMigrationSprint,
  sprintWork,
  toSprintRef,
} from "./sprint-progress";
import { statusDistribution } from "./status-distribution";
import type { DashboardDto, SprintDashboardDto } from "./types";
import { throughput, velocity } from "./velocity";
import { buildWarnings } from "./warnings";
import { summarizeWork } from "./work-progress";
import { workloadByAssignee } from "./workload";

/**
 * NormalizedProjectData → DashboardDto. Pure and deterministic: same data + `now` → same DTO.
 * Every number here comes from a function in src/lib/dashboard; nothing is computed in React.
 */
export type BuildDashboardOptions = {
  scope?: ScopeConfig;
  /** From jiraBrowseBase(JIRA_BASE_URL); null disables Jira links. */
  jiraBrowseBaseUrl?: string | null;
  refreshIntervalSeconds?: number;
};

export const DEFAULT_REFRESH_INTERVAL_SECONDS = 60;

export function buildDashboardDto(
  data: NormalizedProjectData,
  now: Date,
  options: BuildDashboardOptions = {},
): DashboardDto {
  const ctx = createDashboardContext(data, now, options.scope, options.jiraBrowseBaseUrl ?? null);
  const refreshIntervalSeconds = options.refreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS;

  const sprintDtos = new Map<number, SprintDashboardDto>();
  const sprintDto = (sprint: NormalizedSprint) => {
    const cached = sprintDtos.get(sprint.id);
    if (cached) return cached;
    const dto = buildSprintDto(sprint, ctx);
    sprintDtos.set(sprint.id, dto);
    return dto;
  };

  // Project-level work
  const work = projectWork(ctx);
  const workSummary = summarizeWork(work);
  const risks = countRisks(data.issues);

  // Sprints
  const activeSprint = data.activeSprint ? sprintDto(data.activeSprint) : null;
  const roadmap = migrationRoadmap(data.sprints);
  const migrationSprints = roadmap.map(sprintDto);
  const activeMigration = migrationSprints.find((sprint) => sprint.state === "active") ?? null;
  const next = nextMigrationSprint(migrationSprints);
  const following = followingMigrationSprint(migrationSprints);
  const closedMigration = roadmap
    .filter((sprint) => sprint.state === "closed")
    .map((sprint) => ({ sprint, work: sprintWork(sprint, ctx) }));
  const velocityData = velocity(closedMigration);

  // Milestones
  const milestones = data.milestones.map((milestone) => buildMilestoneDto(milestone, ctx));
  const scopedMilestones = milestones.filter((m) => m.inProjectScope);


  // Work items blocked by an open risk (any severity).
  const openRiskKeys = new Set(data.issues.filter((i) => isOpenP0(i) || isOpenP1(i)).map((i) => i.key));
  const riskAffected = work.filter(
    (issue) => issue.status.category !== "done" && issue.blockers.some((key) => openRiskKeys.has(key)),
  ).length;

  return {
    project: { id: data.project.id, key: data.project.key, name: data.project.name },
    board: { id: data.board.id, name: data.board.name },
    sync: {
      timestamp: data.metadata.normalizedAt,
      source: "jira",
      refreshIntervalSeconds,
      nextRefreshAt: new Date(Date.parse(data.metadata.normalizedAt) + refreshIntervalSeconds * 1000).toISOString(),
    },
    summary: {
      overallProgress: progressMetric("Overall progress", workSummary),
      totalWorkItems: metric(workSummary.totalIssues, "workItems", "Work items", "Delivery work items in Jira."),
      completedWorkItems: metric(workSummary.completedIssues, "workItems", "Completed", "Work items marked done in Jira."),
      inProgressWorkItems: metric(workSummary.inProgressIssues, "workItems", "In progress", "Work items in progress in Jira."),
      todoWorkItems: metric(workSummary.todoIssues, "workItems", "To do", "Work items not yet started in Jira."),
      blockedWorkItems: metric(
        workSummary.blockedIssues,
        "issueLinks",
        "Blocked",
        "Open work items with an unresolved \"is blocked by\" link in Jira.",
      ),
      estimatedWorkItems: metric(
        workSummary.estimatedIssueCount,
        "storyPoints",
        "Estimated work items",
        "Work items with a story-point estimate in Jira.",
      ),
      p0Risks: metric(risks.openP0, "derived", "P0 risks", "Open Jira issues identified as P0."),
      p1Risks: metric(risks.openP1, "derived", "P1 risks", "Open Jira issues identified as P1."),
      resolvedRisks: metric(
        risks.resolvedP0 + risks.resolvedP1,
        "derived",
        "Resolved risks",
        "P0/P1 risks marked done in Jira.",
      ),
      riskAffectedWorkItems: metric(
        riskAffected,
        "issueLinks",
        "Affected work items",
        "Open work items blocked by an open P0/P1 risk.",
      ),
      completedMilestones: metric(
        scopedMilestones.filter((m) => m.health.status === "complete").length,
        "derived",
        "Completed milestones",
        "Milestones whose work items are all done with no open P0 risk.",
      ),
      totalMilestones: metric(scopedMilestones.length, "jira", "Milestones", "Milestone epics in Jira."),
      completedSprints: metric(
        migrationSprints.filter((sprint) => sprint.state === "closed").length,
        "jira",
        "Completed sprints",
        "Migration sprints closed in Jira.",
      ),
      totalMigrationSprints: metric(migrationSprints.length, "jira", "Migration sprints", "Migration sprints on the Jira board."),
    },
    activeSprint,
    activeSprints: data.activeSprints.map(sprintDto),
    projectHealth: assessProjectHealth(milestones, activeMigration),
    blockers: buildBlockedWorkItems(work, ctx),
    migrationState: {
      activeMigrationSprint: activeMigration ? toSprintRef(activeMigration) : null,
      nextMigrationSprint: next ? toSprintRef(next) : null,
      followingMigrationSprint: following ? toSprintRef(following) : null,
    },
    migrationSprints,
    milestones,
    risks: buildRiskDtos(data.issues, ctx.milestoneLabel, ctx.issueUrl),
    charts: {
      sprintProgress: migrationSprints.map((sprint) => ({
        sprintId: String(sprint.id),
        sprint: sprint.name,
        shortName: sprint.shortName,
        roadmapPosition: sprint.roadmapPosition,
        completedWorkItems: sprint.completedWorkItems,
        totalWorkItems: sprint.totalWorkItems,
        progress: sprint.progress,
        progressMethod: sprint.progressMethod,
        state: sprint.state,
        health: sprint.health.status,
      })),
      statusDistribution: statusDistribution(work),
      velocity: velocityData,
      throughput: throughput(closedMigration),
      workload: workloadByAssignee(work),
      milestoneProgress: milestoneProgressChart(milestones),
      riskDistribution: riskDistribution(risks),
    },
    warnings: [
      ...buildWarnings({
        storyPointsField: data.metadata.storyPointsField,
        projectWork: workSummary,
        activeSprint,
        activeSprintNames: data.activeSprints.map((sprint) => sprint.name),
        migrationSprints,
        activeMigrationSprint: activeMigration ? toSprintRef(activeMigration) : null,
        nextMigrationSprint: next ? toSprintRef(next) : null,
        velocityAvailable: velocityData.available,
      }),
    ],
  };
}
