import { createWorkScope } from "@/lib/dashboard/scope";
import type { RawIssueChangelog, RawStatusCatalog } from "@/lib/jira/history-schemas";
import { jiraIssueUrl } from "@/lib/jira/links";
import { normalizeStatus } from "@/lib/jira/normalize";
import type { NormalizedProjectData, StatusCategory } from "@/lib/jira/types";
import { buildRecentActivity } from "./activity";
import { validateTimelines } from "./confidence";
import { buildTimelines, type PreparedTimeline } from "./issue-timeline";
import { normalizeChangelogs } from "./normalize-history";
import { buildProjectTrend } from "./project-trend";
import { buildSprintHistory, type HistoryContext, type SprintInput } from "./sprint-history";
import { buildThroughput, completionInstant } from "./throughput";
import type { CompletionDto, HistoryDto, HistoryWarning, SprintHistoryDto, StatusCategoryCatalog } from "./types";

export const COMPLETION_WINDOW_DAYS = 30;

function buildCompletions(
  timelines: readonly PreparedTimeline[],
  ctx: HistoryContext,
  milestoneNumberByKey: ReadonlyMap<string, number | null>,
  issueUrl: (key: string) => string | null,
): CompletionDto[] {
  const since = ctx.now.getTime() - COMPLETION_WINDOW_DAYS * 86_400_000;
  const completions: CompletionDto[] = [];
  for (const timeline of timelines) {
    const at = completionInstant(timeline, ctx);
    if (at === null || at < since) continue;
    const { issue } = timeline;
    const number = issue.epicKey ? (milestoneNumberByKey.get(issue.epicKey) ?? null) : null;
    completions.push({
      issueKey: issue.key,
      summary: issue.summary,
      completedAt: new Date(at).toISOString(),
      kind: issue.riskSeverity !== null ? "risk" : "work",
      riskSeverity: issue.riskSeverity,
      milestoneLabel: number === null ? null : `M${number}`,
      jiraUrl: issueUrl(issue.key),
    });
  }
  return completions.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

/**
 * Pure pipeline: current normalized project data + raw changelogs + status catalog → HistoryDto.
 * Scope rules are the SAME as the current-state engine (src/lib/dashboard/scope.ts):
 *   sprint burndowns/history  → delivery work items (isDeliveryWorkItem)
 *   project trend/throughput  → current project scope (isInProjectScope)
 *   activity                  → project-scope work items + P0/P1 risks
 */

export type HistoryInput = {
  data: NormalizedProjectData;
  changelogs: readonly RawIssueChangelog[];
  statusCatalog: RawStatusCatalog;
  now: Date;
  timeZone: string;
  cacheSeconds: number;
  jiraBrowseBaseUrl: string | null;
};

export function buildStatusCatalog(raw: RawStatusCatalog): StatusCategoryCatalog {
  return new Map<string, StatusCategory>(raw.map((status) => [status.id, normalizeStatus(status.statusCategory?.key)]));
}

/** Issues whose history is fetched: delivery work items (incl. activated M9) and risks. */
export function historyScope(data: NormalizedProjectData) {
  const scope = createWorkScope(data);
  return data.issues.filter((issue) => scope.isDeliveryWorkItem(issue) || issue.riskSeverity !== null);
}

export function buildHistoryDto(input: HistoryInput): HistoryDto {
  const { data, now, timeZone } = input;
  const scope = createWorkScope(data);
  const tracked = historyScope(data);
  const issueKeyById = new Map(tracked.map((issue) => [issue.id, issue.key]));
  const events = normalizeChangelogs(input.changelogs, issueKeyById, {
    sprintField: data.metadata.sprintField,
    storyPointsField: data.metadata.storyPointsField,
  });
  const timelines = buildTimelines(tracked, events);
  const catalog = buildStatusCatalog(input.statusCatalog);
  const ctx: HistoryContext = { now, timeZone, catalog, sprintFieldKnown: data.metadata.sprintField !== null };

  const all = [...timelines.values()];
  const delivery = all.filter((t) => scope.isDeliveryWorkItem(t.issue));
  const project = all.filter((t) => scope.isInProjectScope(t.issue));
  const activityItems = all.filter((t) => scope.isInProjectScope(t.issue) || t.issue.riskSeverity !== null);

  // Sprints: migration roadmap (by number) + any other active sprint.
  const toInput = (s: NormalizedProjectData["sprints"][number]): SprintInput => ({
    id: s.id,
    name: s.name,
    state: s.state,
    startDate: s.startDate,
    endDate: s.endDate,
    completeDate: s.completeDate,
    migrationSprintNumber: s.migrationSprintNumber,
  });
  const sprintList = [
    ...data.migrationSprints,
    ...data.activeSprints.filter((s) => s.migrationSprintNumber === null),
  ];
  const sprints: SprintHistoryDto[] = sprintList.map((s) => buildSprintHistory(toInput(s), delivery, ctx));
  const activeMigration = sprints.find((s) => s.state === "active" && s.roadmapPosition !== null) ?? null;
  const sprintHistory = sprints.filter((s) => s.state === "closed" && s.roadmapPosition !== null);

  const projectTrend = buildProjectTrend(project, ctx);
  const { throughput, cycleTime, leadTime } = buildThroughput(project, ctx);
  const recentActivity = buildRecentActivity(activityItems, {
    now,
    catalog,
    sprintNameById: new Map(data.sprints.map((s) => [s.id, s.name])),
    issueUrl: (key) => jiraIssueUrl(input.jiraBrowseBaseUrl, key),
  });

  const velocityAvailable = sprintHistory.some((s) => s.burndown.storyPoints.available);

  return {
    sync: { timestamp: now.toISOString(), source: "jira", cacheSeconds: input.cacheSeconds, timeZone },
    recentActivity,
    completions: buildCompletions(
      activityItems,
      ctx,
      new Map(data.milestones.map((m) => [m.key, m.milestoneNumber])),
      (key) => jiraIssueUrl(input.jiraBrowseBaseUrl, key),
    ),
    projectTrend,
    sprints,
    sprintHistory,
    activeSprintBurndown: activeMigration,
    throughput,
    cycleTime,
    leadTime,
    availability: {
      recentActivity: events.length > 0,
      projectTrend: projectTrend.available,
      sprintBurndown: activeMigration?.burndown.workItems.available ?? false,
      throughput: throughput.available,
      velocity: velocityAvailable,
    },
    warnings: buildHistoryWarnings({ all, delivery, sprints, activeMigration, data, events: events.length }),
    validation: validateTimelines(all, ctx.sprintFieldKnown),
  };
}

function buildHistoryWarnings(input: {
  all: PreparedTimeline[];
  delivery: PreparedTimeline[];
  sprints: SprintHistoryDto[];
  activeMigration: SprintHistoryDto | null;
  data: NormalizedProjectData;
  events: number;
}): HistoryWarning[] {
  const warnings: HistoryWarning[] = [];
  const { activeMigration, sprints, data } = input;

  if (input.events === 0) {
    warnings.push({ code: "HISTORY_INCOMPLETE", level: "info", message: "Jira has not recorded any changes for this project yet." });
  }
  const low = sprints.filter((s) => s.availability.available === false && s.availability.reason === "LOW_HISTORY_CONFIDENCE");
  if (low.length > 0) {
    warnings.push({
      code: "LOW_HISTORY_CONFIDENCE",
      level: "warning",
      message: `Jira history is incomplete for ${low.map((s) => s.name).join(", ")}, so burndown is not shown.`,
    });
  }
  if (activeMigration && !activeMigration.burndown.workItems.available) {
    warnings.push({
      code: "BURNDOWN_UNAVAILABLE",
      level: "info",
      message: `Burndown for ${activeMigration.name} is not available yet: ${activeMigration.burndown.workItems.message}`,
    });
  }
  const undated = data.migrationSprints.filter((s) => s.state !== "closed" && (!s.startDate || !s.endDate));
  if (undated.length > 0) {
    warnings.push({
      code: "SPRINT_DATES_REQUIRED",
      level: "info",
      message: `${undated.length} migration sprint${undated.length === 1 ? " needs" : "s need"} start and end dates in Jira before burndown history can be shown.`,
    });
  }
  const inferred = sprints.filter((s) => s.availability.available && s.confidence.level === "medium");
  if (inferred.length > 0 || data.metadata.sprintField === null) {
    warnings.push({
      code: "SPRINT_MEMBERSHIP_HISTORY_INCOMPLETE",
      level: "info",
      message:
        data.metadata.sprintField === null
          ? "Sprint membership history is unavailable because the Sprint field was not found."
          : "Some work items joined a sprint without a recorded change; they are treated as in the sprint since they were created.",
    });
  }
  if (data.metadata.storyPointsField !== null && !sprints.some((s) => s.burndown.storyPoints.available)) {
    warnings.push({
      code: "STORY_POINT_HISTORY_INCOMPLETE",
      level: "info",
      message: "Story-point history is incomplete, so burndown and velocity use work items only.",
    });
  }
  return warnings;
}
