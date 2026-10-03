import type { SprintHistoryDto } from "@/lib/history/types";
import { check, listNames, plural, type ReadinessContext } from "./context";
import type { BurndownReadinessState, ReadinessCheck, SprintBurndownReadiness } from "./types";

/**
 * History readiness — derived only from the existing history engine (availability reasons,
 * confidence and validation). Sprints that have not run yet are "awaiting execution", never
 * "bad history".
 */

export function burndownState(sprint: SprintHistoryDto): BurndownReadinessState {
  const availability = sprint.burndown.workItems;
  if (availability.available) return "available";
  switch (availability.reason) {
    case "SPRINT_NOT_STARTED":
      return "waiting_for_start";
    case "SPRINT_DATES_REQUIRED":
      return "missing_dates";
    case "LOW_HISTORY_CONFIDENCE":
      return "low_confidence";
    default:
      return "insufficient_history";
  }
}

export function burndownReadiness(ctx: ReadinessContext): SprintBurndownReadiness[] {
  if (!ctx.history) return [];
  return ctx.history.sprints
    .filter((s) => s.roadmapPosition !== null)
    .map((s) => {
      const state = burndownState(s);
      return {
        sprintId: s.sprintId,
        name: s.name,
        roadmapPosition: s.roadmapPosition,
        state,
        confidence: state === "available" ? s.confidence.level : null,
        message: s.burndown.workItems.available
          ? s.confidence.level === "medium"
            ? `Available (medium confidence): ${s.confidence.reasons.join(" ")}`
            : "Available."
          : s.burndown.workItems.message,
      };
    });
}

export function historyChecks(ctx: ReadinessContext): ReadinessCheck[] {
  const history = ctx.history;
  const category = "historical_analytics" as const;
  if (!history) {
    return [
      check({
        code: "HISTORY_SOURCE",
        category,
        importance: "important",
        title: "Jira change history",
        status: "warning",
        message: "Historical analytics are temporarily unavailable (Jira changelog could not be loaded).",
        action: "Check /api/jira/health and the server logs (event history.refresh_failed).",
      }),
    ];
  }

  const v = history.validation;
  const mismatchParts = [
    v.statusMismatches && plural(v.statusMismatches, "status mismatch", "status mismatches"),
    v.sprintMismatches && plural(v.sprintMismatches, "sprint mismatch", "sprint mismatches"),
    v.storyPointMismatches && plural(v.storyPointMismatches, "story-point mismatch", "story-point mismatches"),
    v.doneWithoutStatusHistory && `${plural(v.doneWithoutStatusHistory, "done item")} without recorded transitions`,
    v.missingCreatedDates && plural(v.missingCreatedDates, "missing creation date"),
  ].filter(Boolean) as string[];

  const states = burndownReadiness(ctx);
  const count = (state: BurndownReadinessState) => states.filter((s) => s.state === state).length;
  const available = states.filter((s) => s.state === "available");
  const awaiting = count("waiting_for_start") + count("missing_dates");
  const activeMigration = history.activeSprintBurndown;
  const activeState = activeMigration ? burndownState(activeMigration) : null;
  const lowConfidence = states.filter((s) => s.state === "low_confidence");

  const sprintHistoryParts = [
    available.length > 0 &&
      `${available.length} available (${available.filter((s) => s.confidence === "high").length} high, ${available.filter((s) => s.confidence === "medium").length} medium confidence)`,
    awaiting > 0 && `${awaiting} awaiting sprint execution`,
    count("insufficient_history") > 0 && `${count("insufficient_history")} without enough history`,
    lowConfidence.length > 0 && `${lowConfidence.length} low confidence`,
  ].filter(Boolean) as string[];

  const throughput = history.throughput;
  const trend = history.projectTrend;

  return [
    check({
      code: "HISTORY_SOURCE",
      category,
      importance: "important",
      title: "Jira change history",
      status: "pass",
      message: `Change history loaded for ${plural(v.checkedIssues, "work item and risk", "work items and risks")}.`,
    }),
    check({
      code: "HISTORY_CONSISTENCY",
      category,
      importance: "important",
      title: "History matches current Jira",
      status: mismatchParts.length === 0 ? "pass" : "warning",
      message:
        mismatchParts.length === 0
          ? `Reconstructed history ends on today's Jira state for all ${v.checkedIssues} items.`
          : `Reconstructed history does not match current Jira for some items: ${mismatchParts.join(", ")}. Affected charts use lower confidence or are hidden.`,
      action: mismatchParts.length === 0 ? null : "Usually caused by imported or bulk-edited issues; no Jira change is required unless charts are missing.",
    }),
    check({
      code: "SPRINT_HISTORY",
      category,
      importance: "informational",
      title: "Sprint history",
      status: states.length === 0 ? "not_applicable" : "pass",
      message: states.length === 0 ? "No migration sprints yet." : `Migration sprint history: ${sprintHistoryParts.join(", ")}.`,
    }),
    check({
      code: "BURNDOWN_READINESS",
      category,
      importance: "important",
      title: "Current sprint burndown",
      status:
        lowConfidence.length > 0 || (activeState !== null && activeState !== "available" && activeState !== "waiting_for_start")
          ? "warning"
          : activeState === "available"
            ? "pass"
            : "not_applicable",
      message: !activeMigration
        ? "No migration sprint is active."
        : activeState === "available"
          ? `${activeMigration.name} burndown is available.`
          : `${activeMigration.name}: ${activeMigration.burndown.workItems.available ? "" : activeMigration.burndown.workItems.message}`,
      action:
        lowConfidence.length > 0
          ? `Review the Jira history of ${listNames(lowConfidence.map((s) => s.name))}.`
          : activeState === "missing_dates"
            ? `Add start and end dates to ${activeMigration?.name} in Jira.`
            : null,
    }),
    check({
      code: "THROUGHPUT_READINESS",
      category,
      importance: "informational",
      title: "Throughput",
      status: throughput.available ? "pass" : "not_applicable",
      message: throughput.available
        ? "Weekly throughput is available."
        : throughput.reason === "NO_STATUS_HISTORY"
          ? "Throughput will appear after work items begin reaching Done."
          : throughput.message,
    }),
    check({
      code: "PROJECT_TREND_READINESS",
      category,
      importance: "informational",
      title: "Project progress trend",
      status: trend.available ? "pass" : trend.reason === "LOW_HISTORY_CONFIDENCE" ? "warning" : "not_applicable",
      message: trend.available
        ? "Project progress over time is available."
        : trend.reason === "INSUFFICIENT_CHANGELOG"
          ? "Project progress trend requires at least two days of recorded delivery history."
          : trend.message,
    }),
  ];
}
