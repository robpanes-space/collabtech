import { diagnose, sprintMembershipEvidenced, type PreparedTimeline, type TimelineDiagnostics } from "./issue-timeline";
import type { HistoryValidationSummary } from "./types";

/** Any reconstruction that does not land on today's Jira state (or lacks evidence) is low confidence. */
export function isLowConfidence(d: TimelineDiagnostics): boolean {
  return d.statusInconsistent || d.doneWithoutStatusHistory || d.sprintInconsistent || d.storyPointsInconsistent || d.createdAtMissing;
}

/**
 * Live validation: reconstructed final state vs current Jira state, per tracked issue.
 * Counts only (no keys, emails or raw values) — a mismatch lowers confidence elsewhere.
 */
export function validateTimelines(timelines: readonly PreparedTimeline[], sprintFieldKnown: boolean): HistoryValidationSummary {
  const summary: HistoryValidationSummary = {
    checkedIssues: timelines.length,
    consistentIssues: 0,
    statusMismatches: 0,
    sprintMismatches: 0,
    storyPointMismatches: 0,
    doneWithoutStatusHistory: 0,
    missingCreatedDates: 0,
  };
  for (const timeline of timelines) {
    const d = diagnose(timeline, sprintFieldKnown);
    if (d.statusInconsistent) summary.statusMismatches++;
    if (d.sprintInconsistent) summary.sprintMismatches++;
    if (d.storyPointsInconsistent) summary.storyPointMismatches++;
    if (d.doneWithoutStatusHistory) summary.doneWithoutStatusHistory++;
    if (d.createdAtMissing) summary.missingCreatedDates++;
    if (!isLowConfidence(d)) summary.consistentIssues++;
  }
  return summary;
}
import type { ConfidenceAssessment } from "./types";

/**
 * History confidence — deterministic rules:
 *
 *   low     any status / Sprint / story-point history does not land on the current Jira value,
 *           a done item has no recorded status change, or a creation date is missing.
 *                                                                  → charts are NOT shown
 *   medium  statuses are fully evidenced, but some sprint membership is inferred (the item
 *           is in the sprint now with no Sprint-field change recorded, i.e. it was created
 *           into the sprint or the Sprint field is unknown).       → shown, with a note
 *   high    everything evidenced.
 */
export function assessConfidence(
  timelines: readonly PreparedTimeline[],
  options: { sprintFieldKnown: boolean; sprintId?: number },
): ConfidenceAssessment {
  const reasons: string[] = [];
  let lowCount = 0;
  let inferredMembership = 0;

  for (const timeline of timelines) {
    const d = diagnose(timeline, options.sprintFieldKnown);
    if (isLowConfidence(d)) lowCount++;
    if (options.sprintId !== undefined && !sprintMembershipEvidenced(timeline, options.sprintId)) inferredMembership++;
  }

  const low = lowCount > 0;
  const count = (n: number, one: string) => `${n} work item${n === 1 ? "" : "s"} ${one}`;

  if (low) reasons.push(`${count(lowCount, "have")} incomplete Jira history.`);
  if (options.sprintId !== undefined && !options.sprintFieldKnown && timelines.length > 0) {
    reasons.push("Sprint membership history is unavailable (Sprint field not found).");
  } else if (inferredMembership > 0) {
    reasons.push(`${count(inferredMembership, "joined the sprint without a recorded change")} (assumed in the sprint since creation).`);
  }

  if (low) return { level: "low", reasons };
  if (inferredMembership > 0 || (options.sprintId !== undefined && !options.sprintFieldKnown && timelines.length > 0)) {
    return { level: "medium", reasons };
  }
  return { level: "high", reasons };
}
