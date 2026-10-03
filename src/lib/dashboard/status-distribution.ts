import type { DashboardIssue } from "@/lib/jira/types";
import type { StatusDistributionPoint } from "./types";

/**
 * Status distribution by Jira status category. Blocked is NOT a bucket: a blocked item still
 * counts in its category, so buckets always sum to the number of items. Unknown is included
 * only when non-zero.
 */
export function statusDistribution(issues: readonly DashboardIssue[]): StatusDistributionPoint[] {
  const counts = { done: 0, in_progress: 0, todo: 0, unknown: 0 };
  for (const issue of issues) counts[issue.status.category]++;

  const points: StatusDistributionPoint[] = [
    { key: "done", status: "Done", count: counts.done },
    { key: "in_progress", status: "In Progress", count: counts.in_progress },
    { key: "todo", status: "To Do", count: counts.todo },
  ];
  if (counts.unknown > 0) points.push({ key: "unknown", status: "Unknown", count: counts.unknown });
  return points;
}
