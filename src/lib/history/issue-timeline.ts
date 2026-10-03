import type { DashboardIssue, StatusCategory } from "@/lib/jira/types";
import type { HistoryField, IssueTimeline, JiraHistoryEvent, StatusCategoryCatalog } from "./types";

/**
 * Point-in-time reconstruction of an issue from its changelog.
 *
 * Rule for any tracked field at instant t (Jira logs every change after creation; initial
 * values are not logged):
 *   - the `to` value of the last change at or before t, else
 *   - the `from` value of the first change after t (the value it had before that change), else
 *   - the issue's current value (the field never changed).
 * The issue does not exist before `createdAt`. Nothing is inferred beyond these rules.
 */

export type PreparedTimeline = IssueTimeline & {
  issue: DashboardIssue;
  createdAtMs: number | null;
  byField: Record<"status" | "sprint" | "storyPoints", JiraHistoryEvent[]>;
};

export function buildTimelines(
  issues: readonly DashboardIssue[],
  events: readonly JiraHistoryEvent[],
): Map<string, PreparedTimeline> {
  const byKey = new Map<string, JiraHistoryEvent[]>();
  for (const event of events) byKey.set(event.issueKey, [...(byKey.get(event.issueKey) ?? []), event]);

  const timelines = new Map<string, PreparedTimeline>();
  for (const issue of issues) {
    const issueEvents = (byKey.get(issue.key) ?? []).slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const of = (field: HistoryField) => issueEvents.filter((event) => event.field === field);
    const createdAtMs = issue.createdAt ? Date.parse(issue.createdAt) : null;
    timelines.set(issue.key, {
      issueKey: issue.key,
      issueId: issue.id,
      createdAt: issue.createdAt,
      events: issueEvents,
      issue,
      createdAtMs: createdAtMs !== null && Number.isFinite(createdAtMs) ? createdAtMs : null,
      byField: { status: of("status"), sprint: of("sprint"), storyPoints: of("storyPoints") },
    });
  }
  return timelines;
}

function valueAt<T>(events: readonly JiraHistoryEvent[], t: number, current: T, pick: (e: JiraHistoryEvent, side: "from" | "to") => T): T {
  if (events.length === 0) return current;
  let last: JiraHistoryEvent | null = null;
  for (const event of events) {
    if (Date.parse(event.timestamp) <= t) last = event;
    else break;
  }
  return last ? pick(last, "to") : pick(events[0]!, "from");
}

export function existsAt(timeline: PreparedTimeline, t: number): boolean {
  return timeline.createdAtMs === null || timeline.createdAtMs <= t;
}

export function statusIdAt(timeline: PreparedTimeline, t: number): string | null {
  return valueAt(timeline.byField.status, t, timeline.issue.status.id, (event, side) => {
    const v = event[side];
    return v.kind === "status" ? (v.value?.id ?? null) : null;
  });
}

/** Category from the status catalog (IDs, not names). Unknown IDs → "unknown". */
export function categoryAt(timeline: PreparedTimeline, t: number, catalog: StatusCategoryCatalog): StatusCategory {
  if (timeline.byField.status.length === 0) return timeline.issue.status.category;
  const id = statusIdAt(timeline, t);
  return (id && catalog.get(id)) || "unknown";
}

export function sprintIdsAt(timeline: PreparedTimeline, t: number): number[] {
  return valueAt(timeline.byField.sprint, t, timeline.issue.sprintIds, (event, side) => {
    const v = event[side];
    return v.kind === "sprint" ? v.value : [];
  });
}

export function inSprintAt(timeline: PreparedTimeline, sprintId: number, t: number): boolean {
  return existsAt(timeline, t) && sprintIdsAt(timeline, t).includes(sprintId);
}

export function storyPointsAt(timeline: PreparedTimeline, t: number): number | null {
  return valueAt(timeline.byField.storyPoints, t, timeline.issue.storyPoints, (event, side) => {
    const v = event[side];
    return v.kind === "storyPoints" ? v.value : null;
  });
}

/** Was the issue ever associated with the sprint (now or in its Sprint history)? */
export function everInSprint(timeline: PreparedTimeline, sprintId: number): boolean {
  if (timeline.issue.sprintIds.includes(sprintId)) return true;
  return timeline.byField.sprint.some(
    (e) => (e.from.kind === "sprint" && e.from.value.includes(sprintId)) || (e.to.kind === "sprint" && e.to.value.includes(sprintId)),
  );
}

/** Whether the sprint membership for `sprintId` is evidenced by Sprint-field history. */
export function sprintMembershipEvidenced(timeline: PreparedTimeline, sprintId: number): boolean {
  return timeline.byField.sprint.some(
    (e) => (e.from.kind === "sprint" && e.from.value.includes(sprintId)) || (e.to.kind === "sprint" && e.to.value.includes(sprintId)),
  );
}

/** Instants (ms) at which the issue's sprint membership could change. */
export function membershipChangeInstants(timeline: PreparedTimeline): number[] {
  const instants = timeline.byField.sprint.map((e) => Date.parse(e.timestamp));
  if (timeline.createdAtMs !== null) instants.push(timeline.createdAtMs);
  return instants.sort((a, b) => a - b);
}

export type TimelineDiagnostics = {
  /** Last status change does not land on the current status → history incomplete. */
  statusInconsistent: boolean;
  /** Last sprint change does not match current Sprint field → history incomplete. */
  sprintInconsistent: boolean;
  /** Currently done but no status change was ever recorded. */
  doneWithoutStatusHistory: boolean;
  /** Last story-point change does not match the current estimate. */
  storyPointsInconsistent: boolean;
  createdAtMissing: boolean;
};

export function diagnose(timeline: PreparedTimeline, sprintFieldKnown: boolean): TimelineDiagnostics {
  const lastStatus = timeline.byField.status.at(-1);
  const lastSprint = timeline.byField.sprint.at(-1);
  const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  return {
    statusInconsistent:
      !!lastStatus && lastStatus.to.kind === "status" && (lastStatus.to.value?.id ?? null) !== timeline.issue.status.id,
    sprintInconsistent:
      sprintFieldKnown && !!lastSprint && lastSprint.to.kind === "sprint" && !sameSet(lastSprint.to.value, timeline.issue.sprintIds),
    doneWithoutStatusHistory: timeline.issue.status.category === "done" && timeline.byField.status.length === 0,
    storyPointsInconsistent: (() => {
      const last = timeline.byField.storyPoints.at(-1);
      return !!last && last.to.kind === "storyPoints" && last.to.value !== timeline.issue.storyPoints;
    })(),
    createdAtMissing: timeline.createdAtMs === null,
  };
}
