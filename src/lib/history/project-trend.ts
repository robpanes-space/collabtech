import { roundPercent } from "@/lib/dashboard/metrics";
import { formatShortCalendarDate } from "@/lib/format";
import { addDays, dayEndInstant, dayKeysBetween, weekStartKey, zonedDateKey } from "./calendar";
import { assessConfidence } from "./confidence";
import { categoryAt, existsAt, type PreparedTimeline } from "./issue-timeline";
import type { HistoryContext } from "./sprint-history";
import type { HistoryDto, ProjectTrendPoint } from "./types";

/**
 * Reconstructed progress of the CURRENT committed scope (current project-scope rules: M1–M8,
 * M9 excluded unless activated, exclude-from-progress respected) — not an immutable baseline.
 *
 *   total(t)     = items in that scope that existed at t
 *   completed(t) = of those, items whose historical status category at t is done
 *   progress(t)  = roundPercent(completed / total × 100)
 * Unit: work items (story-point history is not complete enough to mix in; units never mix).
 * Granularity: daily up to 92 days of history, otherwise weekly (week ends, Monday-start weeks).
 */
export const DAILY_TREND_MAX_DAYS = 92;

export function buildProjectTrend(items: readonly PreparedTimeline[], ctx: HistoryContext): HistoryDto["projectTrend"] {
  const confidence = assessConfidence(items, { sprintFieldKnown: ctx.sprintFieldKnown });
  const base = { unit: "workItems" as const, scopeBasis: "current_committed_scope" as const, confidence };

  const createdKeys = items
    .map((timeline) => (timeline.createdAtMs === null ? null : zonedDateKey(new Date(timeline.createdAtMs), ctx.timeZone)))
    .filter((key): key is string => key !== null)
    .sort();
  const todayKey = zonedDateKey(ctx.now, ctx.timeZone);
  if (createdKeys.length === 0) {
    return { ...base, available: false, reason: "NO_HISTORY", message: "There is no work in the committed scope yet.", points: [], granularity: "day" };
  }
  const days = dayKeysBetween(createdKeys[0]!, todayKey);
  if (days.length < 2) {
    return {
      ...base,
      available: false,
      reason: "INSUFFICIENT_CHANGELOG",
      message: "Project history covers less than two days, so there is no trend to show yet.",
      points: [],
      granularity: "day",
    };
  }
  if (confidence.level === "low") {
    return {
      ...base,
      available: false,
      reason: "LOW_HISTORY_CONFIDENCE",
      message: "Jira history is incomplete for some work items, so progress over time cannot be reconstructed reliably.",
      points: [],
      granularity: "day",
    };
  }

  const granularity = days.length <= DAILY_TREND_MAX_DAYS ? "day" : "week";
  const keys =
    granularity === "day" ? days : [...new Set(days.map(weekStartKey))].map((week) => (addDays(week, 6) < todayKey ? addDays(week, 6) : todayKey));

  const points: ProjectTrendPoint[] = keys.map((key) => {
    const t = Math.min(dayEndInstant(key, ctx.timeZone).getTime(), ctx.now.getTime());
    const existing = items.filter((timeline) => existsAt(timeline, t));
    const completed = existing.filter((timeline) => categoryAt(timeline, t, ctx.catalog) === "done").length;
    return {
      date: key,
      label: formatShortCalendarDate(key) ?? key,
      completed,
      total: existing.length,
      progress: existing.length > 0 ? roundPercent((completed / existing.length) * 100) : 0,
    };
  });

  return { ...base, available: true, points, granularity };
}
