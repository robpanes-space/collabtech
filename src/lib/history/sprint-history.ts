import { roundPercent } from "@/lib/dashboard/metrics";
import { formatShortCalendarDate } from "@/lib/format";
import { boundaryInstant, calendarDayOf, dayEndInstant, dayKeysBetween, dayStartInstant } from "./calendar";
import { assessConfidence } from "./confidence";
import {
  categoryAt,
  everInSprint,
  inSprintAt,
  membershipChangeInstants,
  storyPointsAt,
  type PreparedTimeline,
} from "./issue-timeline";
import type { Availability, BurndownPoint, SprintHistoryDto, StatusCategoryCatalog } from "./types";

/**
 * Sprint history + reconstructed burndown (see .claude/skills/jira-history/SKILL.md).
 *
 *   start S, end E, close C (completeDate, or E for a closed sprint without one), cap = min(now, C)
 *   inSprint(i, t) = created(i) ≤ t AND sprint ∈ SprintField(i, t)        (historical membership)
 *   committed      = { i : inSprint(i, S) }                                (at the start instant)
 *   added          = not committed, inSprint at some instant in (S, cap]
 *   removed        = in sprint at/after S, not inSprint(i, cap)
 *   day d point    = evaluated at min(end of d in DASHBOARD_TIME_ZONE, cap); days after cap → null
 *   remaining(d)   = |{ inSprint(i, t) ∧ category(i, t) ≠ done }|          (reopened work counts again)
 *   ideal(d_k)     = committedRemaining × (1 − k / (days − 1))             (fixed at start; scope
 *                                                                           changes never rewrite it)
 * Story-point series exist only if every in-sprint item has an estimate at every evaluated instant.
 */

export type HistoryContext = {
  now: Date;
  timeZone: string;
  catalog: StatusCategoryCatalog;
  sprintFieldKnown: boolean;
};

export type SprintInput = {
  id: number;
  name: string;
  state: "active" | "future" | "closed";
  startDate: string | null;
  endDate: string | null;
  completeDate: string | null;
  migrationSprintNumber: number | null;
};

const unavailable = (reason: Extract<Availability, { available: false }>["reason"], message: string) =>
  ({ available: false, reason, message }) as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

function emptyHistory(sprint: SprintInput, availability: Availability): SprintHistoryDto {
  return {
    sprintId: sprint.id,
    name: sprint.name,
    state: sprint.state,
    roadmapPosition: sprint.migrationSprintNumber,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    completeDate: sprint.completeDate,
    durationDays: null,
    committedWorkItems: 0,
    addedWorkItems: 0,
    removedWorkItems: 0,
    scopeChangeCount: 0,
    completedCommittedWorkItems: 0,
    finalCompletedWorkItems: 0,
    finalScopeWorkItems: 0,
    completionRate: null,
    committedStoryPoints: null,
    completedStoryPoints: null,
    availability,
    // Not assessed: there is no period to reconstruct yet (see availability).
    confidence: { level: "low", reasons: availability.available ? [] : [availability.message] },
    burndown: { workItems: { ...availability, points: [] }, storyPoints: availability },
  };
}

export function buildSprintHistory(
  sprint: SprintInput,
  candidates: readonly PreparedTimeline[],
  ctx: HistoryContext,
): SprintHistoryDto {
  const { timeZone, catalog } = ctx;
  if (!sprint.startDate || !sprint.endDate) {
    return emptyHistory(sprint, unavailable("SPRINT_DATES_REQUIRED", "This sprint has no start and end dates in Jira."));
  }
  const start = boundaryInstant(sprint.startDate, timeZone);
  const startKey = calendarDayOf(sprint.startDate, timeZone);
  const endKey = calendarDayOf(sprint.endDate, timeZone);
  if (!start || !startKey || !endKey || endKey < startKey) {
    return emptyHistory(sprint, unavailable("SPRINT_DATES_REQUIRED", "This sprint's dates in Jira are invalid."));
  }
  const nowMs = ctx.now.getTime();
  const startMs = start.getTime();
  if (sprint.state === "future" || startMs > nowMs) {
    const label = formatShortCalendarDate(startKey) ?? startKey;
    return emptyHistory(sprint, unavailable("SPRINT_NOT_STARTED", `This sprint starts ${label}; history begins then.`));
  }

  const endBoundary =
    /^\d{4}-\d{2}-\d{2}$/.test(sprint.endDate) ? dayEndInstant(sprint.endDate, timeZone).getTime() : Date.parse(sprint.endDate);
  const closeMs = sprint.completeDate ? Date.parse(sprint.completeDate) : sprint.state === "closed" ? endBoundary : null;
  const capMs = Math.min(nowMs, closeMs ?? Number.POSITIVE_INFINITY);

  const members = candidates.filter((timeline) => everInSprint(timeline, sprint.id));
  const confidence = assessConfidence(members, { sprintFieldKnown: ctx.sprintFieldKnown, sprintId: sprint.id });
  const inAt = (timeline: PreparedTimeline, t: number) => inSprintAt(timeline, sprint.id, t);
  const doneAt = (timeline: PreparedTimeline, t: number) => categoryAt(timeline, t, catalog) === "done";

  // Scope at start, additions/removals after start.
  const committed = members.filter((timeline) => inAt(timeline, startMs));
  let added = 0;
  let removed = 0;
  let scopeChangeCount = 0;
  for (const timeline of members) {
    const instants = membershipChangeInstants(timeline).filter((t) => t > startMs && t <= capMs);
    let wasIn = inAt(timeline, startMs);
    let everAfter = wasIn;
    for (const t of instants) {
      const isIn = inAt(timeline, t);
      if (isIn !== wasIn) scopeChangeCount++;
      if (isIn) everAfter = true;
      wasIn = isIn;
    }
    const committedHere = inAt(timeline, startMs);
    if (!committedHere && everAfter) added++;
    if (everAfter && !inAt(timeline, capMs)) removed++;
  }

  const finalScope = members.filter((timeline) => inAt(timeline, capMs));
  const finalCompleted = finalScope.filter((timeline) => doneAt(timeline, capMs));
  const completedCommitted = committed.filter((timeline) => inAt(timeline, capMs) && doneAt(timeline, capMs));

  // Daily points (calendar days in DASHBOARD_TIME_ZONE).
  const days = dayKeysBetween(startKey, endKey);
  const evaluated: { key: string; t: number | null }[] = days.map((key) => {
    const dayStart = dayStartInstant(key, timeZone).getTime();
    return { key, t: dayStart > capMs ? null : Math.min(dayEndInstant(key, timeZone).getTime(), capMs) };
  });

  // Story-point completeness across every evaluated instant (including the start).
  const instantsToCheck = [startMs, ...evaluated.flatMap((e) => (e.t === null ? [] : [e.t]))];
  const pointsComplete =
    committed.length > 0 &&
    instantsToCheck.every((t) => members.every((timeline) => !inAt(timeline, t) || storyPointsAt(timeline, t) !== null));

  const sumPoints = (items: readonly PreparedTimeline[], t: number) =>
    items.reduce((total, timeline) => total + (storyPointsAt(timeline, t) ?? 0), 0);
  const committedRemaining = committed.filter((timeline) => !doneAt(timeline, startMs)).length;
  const committedRemainingPoints = pointsComplete
    ? sumPoints(committed.filter((timeline) => !doneAt(timeline, startMs)), startMs)
    : null;

  const points: BurndownPoint[] = evaluated.map(({ key, t }, index) => {
    const fraction = days.length > 1 ? 1 - index / (days.length - 1) : 0;
    const base = {
      date: key,
      label: formatShortCalendarDate(key) ?? key,
      idealWorkItems: round1(committedRemaining * fraction),
      idealStoryPoints: committedRemainingPoints === null ? null : round1(committedRemainingPoints * fraction),
    };
    if (t === null) {
      return { ...base, remainingWorkItems: null, completedWorkItems: null, scopeWorkItems: null, remainingStoryPoints: null, completedStoryPoints: null };
    }
    const inScope = members.filter((timeline) => inAt(timeline, t));
    const done = inScope.filter((timeline) => doneAt(timeline, t));
    const open = inScope.filter((timeline) => !doneAt(timeline, t));
    return {
      ...base,
      remainingWorkItems: open.length,
      completedWorkItems: done.length,
      scopeWorkItems: inScope.length,
      remainingStoryPoints: pointsComplete ? sumPoints(open, t) : null,
      completedStoryPoints: pointsComplete ? sumPoints(done, t) : null,
    };
  });

  let workItemsAvailability: Availability = { available: true };
  if (members.length === 0) {
    workItemsAvailability = unavailable("NO_HISTORY", "No work items have been in this sprint.");
  } else if (confidence.level === "low") {
    workItemsAvailability = unavailable(
      "LOW_HISTORY_CONFIDENCE",
      "This sprint does not have enough Jira history to reconstruct a reliable burndown.",
    );
  }
  const storyPointsAvailability: Availability = pointsComplete
    ? workItemsAvailability
    : unavailable("ESTIMATION_INCOMPLETE", "Story-point history is incomplete for this sprint.");

  return {
    sprintId: sprint.id,
    name: sprint.name,
    state: sprint.state,
    roadmapPosition: sprint.migrationSprintNumber,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    completeDate: sprint.completeDate,
    durationDays: dayKeysBetween(startKey, endKey).length,
    committedWorkItems: committed.length,
    addedWorkItems: added,
    removedWorkItems: removed,
    scopeChangeCount,
    completedCommittedWorkItems: completedCommitted.length,
    finalCompletedWorkItems: finalCompleted.length,
    finalScopeWorkItems: finalScope.length,
    completionRate: finalScope.length > 0 ? roundPercent((finalCompleted.length / finalScope.length) * 100) : null,
    committedStoryPoints: pointsComplete ? sumPoints(committed, startMs) : null,
    completedStoryPoints: pointsComplete ? sumPoints(finalCompleted, capMs) : null,
    availability: workItemsAvailability,
    confidence,
    burndown: { workItems: { ...workItemsAvailability, points }, storyPoints: storyPointsAvailability },
  };
}

