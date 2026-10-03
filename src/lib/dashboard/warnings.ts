import type { WorkSummary } from "@/lib/jira/types";
import { roundPercent } from "./metrics";
import type { DashboardWarning, SprintDashboardDto, SprintRefDto } from "./types";

/**
 * Client-safe data-quality warnings. Messages contain only Jira sprint names and counts —
 * never credentials, emails, raw Jira errors or stack traces.
 */
export function buildWarnings(input: {
  storyPointsField: string | null;
  projectWork: WorkSummary;
  activeSprint: SprintDashboardDto | null;
  /** Names of all active sprints in Jira board order. */
  activeSprintNames?: readonly string[];
  migrationSprints: readonly SprintDashboardDto[];
  activeMigrationSprint: SprintRefDto | null;
  nextMigrationSprint: SprintRefDto | null;
  velocityAvailable: boolean;
}): DashboardWarning[] {
  const warnings: DashboardWarning[] = [];
  const { activeSprint, migrationSprints, nextMigrationSprint } = input;

  if (input.storyPointsField === null) {
    warnings.push({
      code: "NO_STORY_POINTS_FIELD",
      level: "warning",
      message: "No story points field was found in Jira. Progress is based on work items.",
    });
  } else if (input.projectWork.totalIssues > 0 && input.projectWork.progressMethod === "workItems") {
    const coverage = roundPercent(input.projectWork.estimationCoverage ?? 0);
    warnings.push({
      code: "STORY_POINTS_INCOMPLETE",
      level: "info",
      message: `${input.projectWork.unestimatedIssueCount} of ${input.projectWork.totalIssues} work items have no story-point estimate (coverage ${coverage}%). Progress is based on work items.`,
    });
  }

  if (!activeSprint) {
    warnings.push({ code: "NO_ACTIVE_SPRINT", level: "info", message: "Jira reports no active sprint." });
  } else if (!activeSprint.isMigrationSprint) {
    const next = nextMigrationSprint && nextMigrationSprint.state === "future" ? ` ${nextMigrationSprint.name} has not started.` : "";
    warnings.push({
      code: "ACTIVE_NON_MIGRATION_SPRINT",
      level: "info",
      message: `Jira currently reports ${activeSprint.name} as the active sprint.${next}`,
    });
  }

  const activeNames = input.activeSprintNames ?? [];
  if (activeSprint && activeNames.length > 1) {
    warnings.push({
      code: "MULTIPLE_ACTIVE_SPRINTS",
      level: "info",
      message: `Jira reports ${activeNames.length} active sprints (${activeNames.join(", ")}). ${activeSprint.name} is shown as the current sprint because it is first in the board order.`,
    });
  }

  if (migrationSprints.length === 0) {
    warnings.push({
      code: "NO_MIGRATION_SPRINTS",
      level: "warning",
      message: "No migration sprints (named \"MIG S<number> - …\") were found on the board.",
    });
  } else if (!input.activeMigrationSprint && migrationSprints.some((s) => s.state !== "closed")) {
    warnings.push({
      code: "NO_ACTIVE_MIGRATION_SPRINT",
      level: "info",
      message: "No migration sprint is currently active in Jira.",
    });
  }

  if (activeSprint && (activeSprint.startDate === null || activeSprint.endDate === null)) {
    warnings.push({
      code: "MISSING_SPRINT_DATES",
      level: "warning",
      message: `${activeSprint.name} has no start or end date in Jira, so time-based sprint health is skipped.`,
    });
  }
  const undated = migrationSprints.filter((s) => s.state !== "closed" && (!s.startDate || !s.endDate));
  if (undated.length > 0) {
    warnings.push({
      code: "MISSING_SPRINT_DATES",
      level: "info",
      message: `${undated.length} upcoming migration sprint${undated.length === 1 ? " has" : "s have"} no scheduled dates in Jira.`,
    });
  }

  if (!input.velocityAvailable) {
    warnings.push({
      code: "VELOCITY_UNAVAILABLE",
      level: "info",
      message: "Story-point velocity needs at least one closed migration sprint with fully estimated work.",
    });
  }

  return warnings;
}
