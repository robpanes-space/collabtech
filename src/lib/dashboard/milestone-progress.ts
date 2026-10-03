import type { DashboardIssue, NormalizedMilestone, WorkSummary } from "@/lib/jira/types";
import type { DashboardContext } from "./context";
import { isCriticallyBlocked, isOpenP0, isOpenP1 } from "./risks";
import { progressFields, workCounts } from "./metrics";
import type { HealthAssessment, MilestoneDashboardDto, MilestoneHealth, MilestoneProgressPoint } from "./types";
import { summarizeWork } from "./work-progress";

/**
 * Milestone (Epic) progress = summarizeWork(delivery work items whose epicKey is the epic).
 *
 * Associated open P0/P1 risks = unresolved P0/P1 issues that are children of the epic
 * (incl. risk-register items) OR currently block one of its children.
 *
 * Milestone health — deterministic rules, evaluated in order:
 *   1. complete  delivery work is all done (≥1 item), or — with no work items — the epic itself
 *                is done in Jira; AND no associated open P0.
 *   2. blocked   ≥1 associated open P0 risk, OR a child is critically blocked
 *                (blocked by / being an unresolved P0).
 *   3. at_risk   ≥1 associated open P1 risk, OR ≥1 blocked delivery work item.
 *   4. healthy   otherwise.
 */

const MILESTONE_PREFIX = /^\s*M(\d{1,2})\s*[-–—:]?\s*/;

export function associatedRisks(children: readonly DashboardIssue[], allIssues: readonly DashboardIssue[]) {
  const childKeys = new Set(children.map((issue) => issue.key));
  const blockerKeys = new Set(children.filter((c) => c.status.category !== "done").flatMap((c) => c.blockers));
  const associated = allIssues.filter((issue) => childKeys.has(issue.key) || blockerKeys.has(issue.key));
  return { openP0: associated.filter(isOpenP0).length, openP1: associated.filter(isOpenP1).length };
}

export function assessMilestoneHealth(input: {
  epicDone: boolean;
  work: WorkSummary;
  children: readonly DashboardIssue[];
  openP0: number;
  openP1: number;
  p0Keys: ReadonlySet<string>;
}): HealthAssessment<MilestoneHealth> {
  const { epicDone, work, children, openP0, openP1, p0Keys } = input;
  const workDone = work.totalIssues > 0 ? work.completedIssues === work.totalIssues : epicDone;

  if (workDone && openP0 === 0) {
    return { status: "complete", reasons: [work.totalIssues > 0 ? "All work items are done." : "Milestone is done in Jira."] };
  }

  const critical = children.filter((issue) => isCriticallyBlocked(issue, p0Keys)).length;
  if (openP0 > 0 || critical > 0) {
    const reasons: string[] = [];
    if (openP0 > 0) reasons.push(`${openP0} open P0 risk${openP0 === 1 ? "" : "s"}.`);
    if (critical > 0) reasons.push(`${critical} work item${critical === 1 ? " is" : "s are"} blocked by a P0 risk.`);
    return { status: "blocked", reasons };
  }

  const reasons: string[] = [];
  if (openP1 > 0) reasons.push(`${openP1} open P1 risk${openP1 === 1 ? "" : "s"}.`);
  if (work.blockedIssues > 0) {
    reasons.push(`${work.blockedIssues} blocked work item${work.blockedIssues === 1 ? "" : "s"}.`);
  }
  return reasons.length > 0 ? { status: "at_risk", reasons } : { status: "healthy", reasons: [] };
}

export function buildMilestoneDto(milestone: NormalizedMilestone, ctx: DashboardContext): MilestoneDashboardDto {
  const children = milestone.childIssues;
  const work = summarizeWork(children.filter(ctx.scope.isDeliveryWorkItem));
  const risks = associatedRisks(children, ctx.data.issues);
  const prefix = MILESTONE_PREFIX.exec(milestone.summary);

  return {
    key: milestone.key,
    name: milestone.summary,
    milestoneLabel: milestone.milestoneNumber === null ? null : `M${milestone.milestoneNumber}`,
    title: prefix ? milestone.summary.slice(prefix[0].length).trim() || milestone.summary : milestone.summary,
    milestoneNumber: milestone.milestoneNumber,
    status: milestone.status.name,
    statusCategory: milestone.status.category,
    inProjectScope: !ctx.scope.isFutureMilestone(milestone.key),
    ...workCounts(work),
    ...progressFields(work),
    storyPointsTotal: work.storyPointsTotal,
    storyPointsCompleted: work.storyPointsCompleted,
    openP0Risks: risks.openP0,
    openP1Risks: risks.openP1,
    health: assessMilestoneHealth({
      epicDone: milestone.status.category === "done",
      work,
      children,
      openP0: risks.openP0,
      openP1: risks.openP1,
      p0Keys: ctx.p0Keys,
    }),
  };
}

export function milestoneProgressChart(milestones: readonly MilestoneDashboardDto[]): MilestoneProgressPoint[] {
  return milestones.map((m) => ({
    key: m.key,
    milestone: m.milestoneLabel,
    name: m.title,
    progress: m.progress,
    progressMethod: m.progressMethod,
    health: m.health.status,
  }));
}
