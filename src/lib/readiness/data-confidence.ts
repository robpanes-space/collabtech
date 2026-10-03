import type { DataConfidence, ReadinessCheck, ReadinessCheckCode } from "./types";

/**
 * Data confidence (client-safe), derived deterministically from data-quality checks only:
 *
 *   low      a data check FAILS (e.g. the current sprint has no dates, no migration sprint in
 *            progress while delivery should be underway)
 *   limited  a data check WARNS (schedule, estimates, milestone assignment, unused active
 *            sprint, history completeness, Jira fields)
 *   good     otherwise
 *
 * Risk and blocker checks (OPEN_P0_RISKS, BLOCKER_DETECTION) and app configuration are
 * deliberately excluded: they describe delivery or setup, not whether the data is complete.
 */
const PHRASES: Partial<Record<ReadinessCheckCode, { warning: string; fail?: string }>> = {
  ACTIVE_MIGRATION_SPRINT: { warning: "more than one migration sprint is active", fail: "no migration sprint is in progress" },
  SPRINT_DATES: { warning: "sprint schedule incomplete", fail: "current sprint has no dates" },
  STORY_POINT_COVERAGE: { warning: "estimates incomplete" },
  STORY_POINT_FIELD: { warning: "estimates unavailable" },
  UNCLASSIFIED_WORK: { warning: "some work not yet assigned to a milestone" },
  EMPTY_ACTIVE_SPRINT: { warning: "an unused sprint is still open" },
  HISTORY_SOURCE: { warning: "history temporarily unavailable" },
  HISTORY_CONSISTENCY: { warning: "some Jira history incomplete" },
  SPRINT_FIELD: { warning: "sprint history unavailable" },
};

function joinNatural(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export function deriveDataConfidence(checks: readonly ReadinessCheck[]): DataConfidence {
  const failing: string[] = [];
  const warning: string[] = [];
  for (const check of checks) {
    const phrase = PHRASES[check.code];
    if (!phrase) continue;
    if (check.status === "fail") failing.push(phrase.fail ?? phrase.warning);
    else if (check.status === "warning") warning.push(phrase.warning);
  }
  if (failing.length > 0) {
    const reasons = [...failing, ...warning];
    return { level: "low", label: "Low", reasons, summary: `Low: ${joinNatural(reasons)}.` };
  }
  if (warning.length > 0) {
    return { level: "limited", label: "Limited", reasons: warning, summary: `Limited: ${joinNatural(warning)}.` };
  }
  return { level: "good", label: "Good", reasons: [], summary: "Good: Jira data is complete for reporting." };
}
