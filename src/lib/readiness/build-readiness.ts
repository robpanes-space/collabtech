import { roundNullablePercent } from "@/lib/dashboard/metrics";
import { countRisks } from "@/lib/dashboard/risks";
import { blockedStatusConfigCheck, clientDashboardChecks, fieldChecks } from "./configuration-readiness";
import { createReadinessContext, excludedWorkItems, type ReadinessInput } from "./context";
import { deriveDataConfidence } from "./data-confidence";
import { burndownReadiness, historyChecks } from "./history-readiness";
import { activeMigrationSprintCheck, emptyActiveSprintCheck, hasValidDates, sprintDatesCheck } from "./sprint-readiness";
import type { CheckStatus, OverallReadiness, ProjectReadinessDto, ReadinessCategory, ReadinessCheck } from "./types";
import {
  blockerCounts,
  blockerDetectionCheck,
  excludedWorkCheck,
  riskChecks,
  storyPointCoverageCheck,
  unclassifiedWorkCheck,
} from "./work-readiness";

const SECTION_TITLES: Record<ReadinessCategory, string> = {
  jira_configuration: "Jira configuration",
  sprint_planning: "Sprint planning",
  estimation: "Estimation",
  work_classification: "Work classification",
  risks_blockers: "Risks & blockers",
  historical_analytics: "Historical analytics",
  client_dashboard: "Client dashboard readiness",
};

/**
 * Overall status (deterministic; no score):
 *   blocked    any critical check fails
 *   attention  any critical/important check warns, or any important check fails
 *   ready      otherwise
 * Informational checks never change the overall status.
 */
export function overallStatus(checks: readonly ReadinessCheck[]): OverallReadiness {
  const relevant = checks.filter((c) => c.importance !== "informational");
  if (relevant.some((c) => c.importance === "critical" && c.status === "fail")) return "blocked";
  if (relevant.some((c) => c.status === "warning" || c.status === "fail")) return "attention";
  return "ready";
}

export function buildReadinessDto(input: ReadinessInput): ProjectReadinessDto {
  const ctx = createReadinessContext(input);
  const checks: ReadinessCheck[] = [
    ...fieldChecks(ctx),
    blockedStatusConfigCheck(ctx),
    activeMigrationSprintCheck(ctx),
    emptyActiveSprintCheck(ctx),
    sprintDatesCheck(ctx),
    storyPointCoverageCheck(ctx),
    unclassifiedWorkCheck(ctx),
    excludedWorkCheck(ctx),
    ...riskChecks(ctx),
    blockerDetectionCheck(ctx),
    ...historyChecks(ctx),
    ...clientDashboardChecks(ctx),
  ];

  const status = overallStatus(checks);
  const counts: Record<CheckStatus, number> = { pass: 0, warning: 0, fail: 0, not_applicable: 0 };
  for (const c of checks) if (c.importance !== "informational") counts[c.status]++;
  const needAttention = checks.filter((c) => c.importance !== "informational" && (c.status === "warning" || c.status === "fail"));
  const summary =
    status === "ready"
      ? "Jira data is ready for client reporting."
      : status === "blocked"
        ? `Blocked: ${needAttention.filter((c) => c.importance === "critical" && c.status === "fail").map((c) => c.title.toLowerCase()).join(", ")}.`
        : `${needAttention.length} check${needAttention.length === 1 ? " needs" : "s need"} attention.`;

  const sections = (Object.keys(SECTION_TITLES) as ReadinessCategory[])
    .map((category) => ({ category, title: SECTION_TITLES[category], checks: checks.filter((c) => c.category === category) }))
    .filter((section) => section.checks.length > 0);

  const { data } = ctx;
  const blockers = blockerCounts(ctx);
  const risks = countRisks(data.issues);
  return {
    generatedAt: input.now.toISOString(),
    overall: { status, counts, summary },
    sections,
    burndown: burndownReadiness(ctx),
    facts: {
      activeSprints: data.activeSprints.map((s) => s.name),
      activeMigrationSprints: data.migrationSprints.filter((s) => s.state === "active").map((s) => s.name),
      emptyActiveSprints: data.activeSprints.filter((s) => s.issues.length === 0).map((s) => s.name),
      migrationSprintsScheduled: data.migrationSprints.filter(hasValidDates).length,
      migrationSprintsTotal: data.migrationSprints.length,
      estimationCoverage: roundNullablePercent(ctx.projectSummary.estimationCoverage),
      estimatedWorkItems: ctx.projectSummary.estimatedIssueCount,
      eligibleWorkItems: ctx.projectSummary.totalIssues,
      progressMethod: ctx.projectSummary.progressMethod,
      includedWorkItems: ctx.projectWork.length,
      excludedWorkItems: excludedWorkItems(data).length,
      unclassifiedWorkItems: checks.find((c) => c.code === "UNCLASSIFIED_WORK")?.items.length ?? 0,
      openP0Risks: risks.openP0,
      openP1Risks: risks.openP1,
      linkBlockedWorkItems: blockers.byLinks,
      statusBlockedWorkItems: blockers.byStatus,
      blockedWorkItems: blockers.total,
      blockedStatusesConfigured: input.config.blockedStatusNames,
      historyAvailable: input.history !== null,
    },
    dataConfidence: deriveDataConfidence(checks),
  };
}
