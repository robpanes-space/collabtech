import type { DashboardIssue } from "@/lib/jira/types";
import type { RiskDashboardDto, RiskDistributionPoint } from "./types";

/**
 * Risk metrics. A risk is any issue with normalized riskSeverity P0/P1 (Phase 3 detection).
 * Resolved ⇔ status category "done"; everything else (incl. unknown) is open.
 */

export type RiskCounts = { openP0: number; openP1: number; resolvedP0: number; resolvedP1: number };

export const isRisk = (issue: DashboardIssue) => issue.riskSeverity !== null;
export const isResolved = (issue: DashboardIssue) => issue.status.category === "done";
export const isOpenP0 = (issue: DashboardIssue) => issue.riskSeverity === "P0" && !isResolved(issue);
export const isOpenP1 = (issue: DashboardIssue) => issue.riskSeverity === "P1" && !isResolved(issue);

export function countRisks(issues: readonly DashboardIssue[]): RiskCounts {
  const counts: RiskCounts = { openP0: 0, openP1: 0, resolvedP0: 0, resolvedP1: 0 };
  for (const issue of issues) {
    if (issue.riskSeverity === null) continue;
    const resolved = isResolved(issue);
    if (issue.riskSeverity === "P0") counts[resolved ? "resolvedP0" : "openP0"]++;
    else counts[resolved ? "resolvedP1" : "openP1"]++;
  }
  return counts;
}

/** Keys of unresolved P0 issues — used to detect work blocked by a P0. */
export function openP0Keys(issues: readonly DashboardIssue[]): Set<string> {
  return new Set(issues.filter(isOpenP0).map((issue) => issue.key));
}

/**
 * "Critical" blocked work: an unresolved, blocked issue that is itself P0 or is blocked by an
 * unresolved P0 issue.
 */
export function isCriticallyBlocked(issue: DashboardIssue, p0Keys: ReadonlySet<string>): boolean {
  if (!issue.blocked || isResolved(issue)) return false;
  return issue.riskSeverity === "P0" || issue.blockers.some((key) => p0Keys.has(key));
}

export function riskDistribution(counts: RiskCounts): RiskDistributionPoint[] {
  return [
    { severity: "P0", open: counts.openP0, resolved: counts.resolvedP0 },
    { severity: "P1", open: counts.openP1, resolved: counts.resolvedP1 },
  ];
}

const REGISTER_PREFIX = /^\s*[A-Z]{1,4}-\d{1,4}\s+P[01]\s*[-–—:]?\s*/i;

/** Risk title without the "I-01 P0 - " register prefix. */
export function riskTitle(summary: string): string {
  return summary.replace(REGISTER_PREFIX, "").trim() || summary;
}

const compareKeys = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** Risk list: open before resolved, P0 before P1, then register ID / key order. */
export function buildRiskDtos(
  issues: readonly DashboardIssue[],
  milestoneLabel: (epicKey: string | null) => string | null = () => null,
  issueUrl: (key: string) => string | null = () => null,
): RiskDashboardDto[] {
  const blockedBy = new Map<string, DashboardIssue[]>();
  for (const issue of issues) {
    if (isResolved(issue)) continue;
    for (const blocker of issue.blockers) blockedBy.set(blocker, [...(blockedBy.get(blocker) ?? []), issue]);
  }

  return issues
    .filter(isRisk)
    .map(
      (issue): RiskDashboardDto => ({
        key: issue.key,
        jiraUrl: issueUrl(issue.key),
        registerId: issue.riskRegisterId,
        summary: issue.summary,
        title: riskTitle(issue.summary),
        severity: issue.riskSeverity as "P0" | "P1",
        status: issue.status.name,
        statusCategory: issue.status.category,
        resolved: isResolved(issue),
        owner: issue.assignee?.displayName ?? null,
        milestoneKey: issue.epicKey,
        blocked: issue.blocked,
        blocksWorkItems: (blockedBy.get(issue.key) ?? []).map((blocked) => blocked.key),
        blocks: (blockedBy.get(issue.key) ?? []).map((blocked) => ({
          key: blocked.key,
          jiraUrl: issueUrl(blocked.key),
          summary: blocked.summary,
          milestoneLabel: milestoneLabel(blocked.epicKey),
        })),
        updatedAt: issue.updatedAt,
      }),
    )
    .sort(
      (a, b) =>
        Number(a.resolved) - Number(b.resolved) ||
        a.severity.localeCompare(b.severity) ||
        compareKeys(a.registerId ?? a.summary, b.registerId ?? b.summary) ||
        compareKeys(a.key, b.key),
    );
}
