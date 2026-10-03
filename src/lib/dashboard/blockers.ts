import type { DashboardIssue } from "@/lib/jira/types";
import type { DashboardContext } from "./context";
import { isCriticallyBlocked, riskTitle } from "./risks";
import type { BlockedWorkItemDto, BlockingIssueDto } from "./types";

/**
 * Blocked work list for the client: unresolved project-scope work items with blocked === true
 * (same set as summary.blockedWorkItems). Ordered: critical (blocked by / being an open P0)
 * first, then milestone number, then key.
 */
/** Readable details for an issue's blocker keys (risk ID, title, severity when known). */
export function blockingIssues(issue: DashboardIssue, ctx: DashboardContext): BlockingIssueDto[] {
  return issue.blockers.map((key): BlockingIssueDto => {
    const blocker = ctx.issueByKey.get(key);
    return {
      key,
      jiraUrl: ctx.issueUrl(key),
      registerId: blocker?.riskRegisterId ?? null,
      summary: blocker?.summary ?? null,
      title: blocker ? riskTitle(blocker.summary) : null,
      severity: blocker?.riskSeverity ?? null,
    };
  });
}

export function buildBlockedWorkItems(work: readonly DashboardIssue[], ctx: DashboardContext): BlockedWorkItemDto[] {
  const sprintNames = new Map(ctx.data.sprints.map((sprint) => [sprint.id, sprint.name]));
  const milestoneOrder = (key: string | null) =>
    (key === null ? null : ctx.milestoneNumberByKey.get(key)) ?? Number.POSITIVE_INFINITY;

  return work
    .filter((issue) => issue.blocked && issue.status.category !== "done")
    .map((issue): BlockedWorkItemDto => ({
      key: issue.key,
      jiraUrl: ctx.issueUrl(issue.key),
      summary: issue.summary,
      status: issue.status.name,
      statusCategory: issue.status.category,
      milestoneKey: issue.epicKey,
      milestoneLabel: ctx.milestoneLabel(issue.epicKey),
      sprintName: issue.sprintId === null ? null : (sprintNames.get(issue.sprintId) ?? null),
      critical: isCriticallyBlocked(issue, ctx.p0Keys),
      blockedBy: blockingIssues(issue, ctx),
    }))
    .sort(
      (a, b) =>
        Number(b.critical) - Number(a.critical) ||
        milestoneOrder(a.milestoneKey) - milestoneOrder(b.milestoneKey) ||
        a.key.localeCompare(b.key, "en", { numeric: true }),
    );
}
