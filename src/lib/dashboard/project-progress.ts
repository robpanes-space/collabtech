import type { DashboardIssue, WorkSummary } from "@/lib/jira/types";
import type { DashboardContext } from "./context";
import { summarizeWork } from "./work-progress";

/**
 * Overall project progress = summarizeWork(all project-scope work items).
 * Computed from work items directly — never by averaging sprint or milestone percentages.
 */
export function projectWork(ctx: DashboardContext): DashboardIssue[] {
  return ctx.data.issues.filter(ctx.scope.isInProjectScope);
}

export function projectProgress(ctx: DashboardContext): WorkSummary {
  return summarizeWork(projectWork(ctx));
}
