import { formatShortCalendarDate } from "@/lib/format";
import { addDays, weekStartKey, zonedDateKey } from "./calendar";
import { categoryAt, type PreparedTimeline } from "./issue-timeline";
import type { HistoryContext } from "./sprint-history";
import type { DurationStat, HistoryDto, JiraHistoryEvent, ThroughputPoint } from "./types";

/**
 * Throughput, cycle time and lead time — from actual status transitions (never updatedAt).
 *
 *   completion(i)  = the LAST transition into a done category, for items done NOW. A reopened
 *                    item is counted once, in the week it was finally completed; an item that is
 *                    currently reopened is not counted. Items done without a recorded transition
 *                    are excluded (and lower history confidence elsewhere).
 *   weekly series  = Monday-start weeks in DASHBOARD_TIME_ZONE from the first item's creation week
 *                    to this week (real zero weeks included). Shown only with ≥ 2 weeks and ≥ 1
 *                    completion.
 *   cycle time     = first transition into in_progress → completion (items that started)
 *   lead time      = creation → completion
 *   medians only, and only with ≥ 5 samples (a mean is distorted by single long items).
 */
export const MIN_DURATION_SAMPLES = 5;
const DAY_MS = 86_400_000;

function transitionsInto(timeline: PreparedTimeline, ctx: HistoryContext, category: "done" | "in_progress"): JiraHistoryEvent[] {
  return timeline.byField.status.filter((event) => {
    const t = Date.parse(event.timestamp);
    return categoryAt(timeline, t, ctx.catalog) === category && categoryAt(timeline, t - 1, ctx.catalog) !== category;
  });
}

/** Instant of the final completion for an item done now, or null. */
export function completionInstant(timeline: PreparedTimeline, ctx: HistoryContext): number | null {
  if (categoryAt(timeline, ctx.now.getTime(), ctx.catalog) !== "done") return null;
  const last = transitionsInto(timeline, ctx, "done").at(-1);
  return last ? Date.parse(last.timestamp) : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function durationStat(samplesMs: number[]): DurationStat {
  const available = samplesMs.length >= MIN_DURATION_SAMPLES;
  const value = median(samplesMs);
  return {
    available,
    sampleSize: samplesMs.length,
    medianDays: available && value !== null ? Math.round((value / DAY_MS) * 10) / 10 : null,
  };
}

export function buildThroughput(
  items: readonly PreparedTimeline[],
  ctx: HistoryContext,
): { throughput: HistoryDto["throughput"]; cycleTime: DurationStat; leadTime: DurationStat } {
  const completions: number[] = [];
  const cycle: number[] = [];
  const lead: number[] = [];
  for (const timeline of items) {
    const done = completionInstant(timeline, ctx);
    if (done === null) continue;
    completions.push(done);
    const started = transitionsInto(timeline, ctx, "in_progress").find((e) => Date.parse(e.timestamp) <= done);
    if (started) cycle.push(done - Date.parse(started.timestamp));
    if (timeline.createdAtMs !== null) lead.push(done - timeline.createdAtMs);
  }

  const firstCreated = Math.min(...items.map((t) => t.createdAtMs ?? Number.POSITIVE_INFINITY));
  const thisWeek = weekStartKey(zonedDateKey(ctx.now, ctx.timeZone));
  const weeks: string[] = [];
  if (Number.isFinite(firstCreated)) {
    for (let week = weekStartKey(zonedDateKey(new Date(firstCreated), ctx.timeZone)); week <= thisWeek; week = addDays(week, 7)) {
      weeks.push(week);
    }
  }
  const counts = new Map<string, number>();
  for (const instant of completions) {
    const week = weekStartKey(zonedDateKey(new Date(instant), ctx.timeZone));
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  const points: ThroughputPoint[] = weeks.map((week) => ({
    periodStart: week,
    label: `${formatShortCalendarDate(week)} – ${formatShortCalendarDate(addDays(week, 6))}`,
    completed: counts.get(week) ?? 0,
  }));

  let throughput: HistoryDto["throughput"];
  if (completions.length === 0) {
    throughput = { available: false, reason: "NO_STATUS_HISTORY", message: "No work items have been completed yet.", points, granularity: "week" };
  } else if (weeks.length < 2) {
    throughput = {
      available: false,
      reason: "TOO_FEW_PERIODS",
      message: "Weekly throughput appears once there are at least two weeks of history.",
      points,
      granularity: "week",
    };
  } else {
    throughput = { available: true, points, granularity: "week" };
  }

  return { throughput, cycleTime: durationStat(cycle), leadTime: durationStat(lead) };
}
