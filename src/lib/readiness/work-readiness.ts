import { roundNullablePercent } from "@/lib/dashboard/metrics";
import { countRisks, isOpenP0, isOpenP1 } from "@/lib/dashboard/risks";
import { check, excludedWorkItems, plural, toItem, type ReadinessContext } from "./context";
import type { ReadinessCheck } from "./types";

/**
 * STORY_POINT_COVERAGE (important) — reuses summarizeWork() (the progress engine), so the
 * 100%-coverage rule for switching progress to story points is unchanged. Never a fail: the
 * work-item fallback is valid.
 */
export function storyPointCoverageCheck(ctx: ReadinessContext): ReadinessCheck {
  const base = { code: "STORY_POINT_COVERAGE", category: "estimation", importance: "important", title: "Story-point coverage" } as const;
  const s = ctx.projectSummary;
  if (ctx.data.metadata.storyPointsField === null) {
    return check({
      ...base,
      status: "warning",
      message: "No story-point field was found, so progress uses work items.",
      action: 'Enable the "Story point estimate" field on the board, or set JIRA_STORY_POINTS_FIELD.',
    });
  }
  if (s.totalIssues === 0) return check({ ...base, status: "not_applicable", message: "There are no committed work items yet." });
  const coverage = roundNullablePercent(s.estimationCoverage);
  const counts = `${s.estimatedIssueCount} of ${s.totalIssues} committed work items estimated (${coverage}%).`;
  if (s.progressMethod === "storyPoints") {
    return check({ ...base, status: "pass", message: `${counts} Progress uses story points.` });
  }
  return check({
    ...base,
    status: "warning",
    message: `${counts} Progress currently uses work items because estimation coverage is incomplete.`,
    action: "Add story-point estimates in Jira to the remaining committed work items.",
  });
}

/** EXCLUDED_WORK (informational): explicit label-based exclusions, listed for review. */
export function excludedWorkCheck(ctx: ReadinessContext): ReadinessCheck {
  const excluded = excludedWorkItems(ctx.data);
  return check({
    code: "EXCLUDED_WORK",
    category: "work_classification",
    importance: "informational",
    title: "Excluded work",
    status: "pass",
    message:
      excluded.length === 0
        ? "No work items are excluded from progress."
        : `${plural(excluded.length, "work item")} ${excluded.length === 1 ? "is" : "are"} excluded from progress by the exclude-from-progress or project-control label.`,
    items: excluded.map(toItem(ctx)),
  });
}

/**
 * UNCLASSIFIED_WORK (important): committed work items (counted in overall progress) whose
 * parent is not a committed M<n> milestone epic.
 */
export function unclassifiedWorkCheck(ctx: ReadinessContext): ReadinessCheck {
  const committedMilestones = new Set(
    ctx.data.milestones.filter((m) => m.milestoneNumber !== null && !ctx.scope.isFutureMilestone(m.key)).map((m) => m.key),
  );
  const unclassified = ctx.projectWork.filter((issue) => issue.epicKey === null || !committedMilestones.has(issue.epicKey));
  const base = { code: "UNCLASSIFIED_WORK", category: "work_classification", importance: "important", title: "Milestone assignment" } as const;
  if (unclassified.length === 0) {
    return check({ ...base, status: "pass", message: "Every committed work item belongs to a migration milestone." });
  }
  return check({
    ...base,
    status: "warning",
    message: `${plural(unclassified.length, "committed work item")} ${unclassified.length === 1 ? "is" : "are"} not assigned to a migration milestone but ${unclassified.length === 1 ? "counts" : "count"} toward progress.`,
    action:
      "In Jira, set each item's parent to its M1–M8 milestone, or add the exclude-from-progress (or project-control) label if it is not delivery work.",
    items: unclassified.map(toItem(ctx)),
  });
}

/** OPEN_P0_RISKS (critical → Attention, never hidden) and OPEN_P1_RISKS (informational). */
export function riskChecks(ctx: ReadinessContext): ReadinessCheck[] {
  const counts = countRisks(ctx.data.issues);
  const openP0 = ctx.data.issues.filter(isOpenP0);
  const openP1 = ctx.data.issues.filter(isOpenP1);
  return [
    check({
      code: "OPEN_P0_RISKS",
      category: "risks_blockers",
      importance: "critical",
      title: "Open P0 risks",
      status: counts.openP0 > 0 ? "warning" : "pass",
      message: counts.openP0 > 0 ? `${plural(counts.openP0, "open P0 risk")} ${counts.openP0 === 1 ? "is" : "are"} blocking delivery.` : "No open P0 risks.",
      action: counts.openP0 > 0 ? "Mitigate or re-assess the P0 risks in Jira and resolve them when cleared." : null,
      items: openP0.map(toItem(ctx)),
    }),
    check({
      code: "OPEN_P1_RISKS",
      category: "risks_blockers",
      importance: "informational",
      title: "Open P1 risks",
      status: "pass",
      message: counts.openP1 > 0 ? `${plural(counts.openP1, "open P1 risk")} being tracked.` : "No open P1 risks.",
      items: openP1.map(toItem(ctx)),
    }),
  ];
}

/** Blocker counts by source (an issue blocked both ways is counted once in the total). */
export function blockerCounts(ctx: ReadinessContext) {
  const open = ctx.projectWork.filter((issue) => issue.status.category !== "done");
  return {
    byLinks: open.filter((issue) => issue.blockers.length > 0).length,
    byStatus: open.filter((issue) => issue.blockedByStatus).length,
    total: open.filter((issue) => issue.blocked).length,
  };
}

export function blockerDetectionCheck(ctx: ReadinessContext): ReadinessCheck {
  const counts = blockerCounts(ctx);
  const configured = ctx.config.blockedStatusNames;
  return check({
    code: "BLOCKER_DETECTION",
    category: "risks_blockers",
    importance: "informational",
    title: "Blocked work",
    status: "pass",
    message: `${plural(counts.total, "open work item")} blocked (${counts.byLinks} by issue links, ${
      configured.length > 0 ? `${counts.byStatus} by status` : "status-based detection off"
    }).`,
  });
}
