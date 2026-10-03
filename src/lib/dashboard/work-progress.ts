import type { DashboardIssue, WorkSummary } from "@/lib/jira/types";

/**
 * Work-item eligibility: an issue is sprint/milestone work when it is neither an Epic
 * (epics are milestones/containers) nor a subtask (its parent carries the estimate).
 * Eligible issues are what "work items" counts, story points sum, and estimation covers.
 */
export function isWorkItem(issue: DashboardIssue): boolean {
  return !issue.isEpic && !issue.isSubtask;
}

export function isOpenBlocked(issue: DashboardIssue): boolean {
  return issue.blocked && issue.status.category !== "done";
}

function percent(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/**
 * Single implementation of work-item counts and progress (see jira-metrics skill).
 *
 * progressMethod = "storyPoints" only when every work item has a valid estimate and the
 * total is > 0; otherwise "workItems". The two are never mixed in one percentage.
 * With zero work items, progress is 0 and estimationCoverage is null.
 */
export function summarizeWork(issues: DashboardIssue[]): WorkSummary {
  const work = issues.filter(isWorkItem);

  let completedIssues = 0;
  let inProgressIssues = 0;
  let todoIssues = 0;
  let unknownIssues = 0;
  let blockedIssues = 0;
  let estimatedIssueCount = 0;
  let pointsTotal = 0;
  let pointsCompleted = 0;

  for (const issue of work) {
    const category = issue.status.category;
    if (category === "done") completedIssues++;
    else if (category === "in_progress") inProgressIssues++;
    else if (category === "todo") todoIssues++;
    else unknownIssues++;

    if (isOpenBlocked(issue)) blockedIssues++;

    if (issue.storyPoints !== null) {
      estimatedIssueCount++;
      pointsTotal += issue.storyPoints;
      if (category === "done") pointsCompleted += issue.storyPoints;
    }
  }

  const totalIssues = work.length;
  const fullyEstimated = totalIssues > 0 && estimatedIssueCount === totalIssues && pointsTotal > 0;

  return {
    totalIssues,
    completedIssues,
    inProgressIssues,
    todoIssues,
    unknownIssues,
    blockedIssues,
    storyPointsTotal: estimatedIssueCount > 0 ? pointsTotal : null,
    storyPointsCompleted: estimatedIssueCount > 0 ? pointsCompleted : null,
    estimatedIssueCount,
    unestimatedIssueCount: totalIssues - estimatedIssueCount,
    estimationCoverage: totalIssues > 0 ? percent(estimatedIssueCount, totalIssues) : null,
    progress: fullyEstimated ? percent(pointsCompleted, pointsTotal) : percent(completedIssues, totalIssues),
    progressMethod: fullyEstimated ? "storyPoints" : "workItems",
  };
}
