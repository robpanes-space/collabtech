import type { DashboardIssue, JiraSprint, WorkSummary } from "@/lib/jira/types";
import { isCriticallyBlocked } from "./risks";
import type { HealthAssessment, SprintHealth } from "./types";

/**
 * Sprint health — deterministic rules, evaluated in order (not a forecast):
 *
 *   1. future    Jira state is "future".
 *   2. complete  Jira state is "closed", OR the sprint has ≥1 work item and all are done.
 *   3. blocked   an unresolved sprint issue is critically blocked (it is P0, or it is blocked
 *                by an unresolved P0 issue).
 *   4. at_risk   blocked work items > 0, OR (active sprint with valid dates and
 *                elapsed ≥ 75% while completion < 50%, or elapsed ≥ 90% while completion < 75%).
 *   5. healthy   otherwise.
 *
 * Time rule is skipped when start/end dates are missing or invalid.
 */

export const TIME_RULES = [
  { elapsedAtLeast: 90, completionBelow: 75 },
  { elapsedAtLeast: 75, completionBelow: 50 },
] as const;

/** Raw % of the sprint duration elapsed at `now`, clamped to [0, 100]; null without valid dates. */
export function elapsedPercent(sprint: Pick<JiraSprint, "startDate" | "endDate">, now: Date): number | null {
  if (!sprint.startDate || !sprint.endDate) return null;
  const start = Date.parse(sprint.startDate);
  const end = Date.parse(sprint.endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.min(100, Math.max(0, ((now.getTime() - start) / (end - start)) * 100));
}

export function assessSprintHealth(input: {
  sprint: Pick<JiraSprint, "state" | "startDate" | "endDate">;
  /** In-scope work summary for the sprint. */
  work: WorkSummary;
  /** All issues in the sprint (risk-register items included — they can block). */
  issues: readonly DashboardIssue[];
  p0Keys: ReadonlySet<string>;
  now: Date;
}): HealthAssessment<SprintHealth> {
  const { sprint, work, issues, p0Keys, now } = input;

  if (sprint.state === "future") return { status: "future", reasons: ["Sprint has not started."] };
  if (sprint.state === "closed") return { status: "complete", reasons: ["Sprint is closed in Jira."] };
  if (work.totalIssues > 0 && work.completedIssues === work.totalIssues) {
    return { status: "complete", reasons: ["All work items are done."] };
  }

  const critical = issues.filter((issue) => isCriticallyBlocked(issue, p0Keys));
  if (critical.length > 0) {
    return {
      status: "blocked",
      reasons: [`${critical.length} work item${critical.length === 1 ? " is" : "s are"} blocked by a P0 risk.`],
    };
  }

  const reasons: string[] = [];
  if (work.blockedIssues > 0) {
    reasons.push(`${work.blockedIssues} blocked work item${work.blockedIssues === 1 ? "" : "s"}.`);
  }
  const elapsed = sprint.state === "active" ? elapsedPercent(sprint, now) : null;
  if (elapsed !== null) {
    const rule = TIME_RULES.find((r) => elapsed >= r.elapsedAtLeast && work.progress < r.completionBelow);
    if (rule) {
      reasons.push(
        `${Math.floor(elapsed)}% of the sprint has elapsed with less than ${rule.completionBelow}% of work complete.`,
      );
    }
  }

  return reasons.length > 0 ? { status: "at_risk", reasons } : { status: "healthy", reasons: [] };
}
