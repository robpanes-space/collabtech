import type { ProgressMethod, WorkSummary } from "@/lib/jira/types";
import type { MetricSource, MetricValue, Percentage, ProgressFields, ProgressMetric, WorkCounts } from "./types";

/**
 * Shared percentage + metric helpers. The ONLY place percentages are rounded.
 *
 * roundPercent(raw):
 *   - non-finite → 0; clamp to [0, 100]
 *   - Math.round, except: never show 100 unless raw is exactly 100,
 *     and never show 0 unless raw is exactly 0 (so "99.6%" reads 99, "0.3%" reads 1).
 */
export function roundPercent(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const clamped = Math.min(100, Math.max(0, raw));
  const rounded = Math.round(clamped);
  if (rounded === 100 && clamped < 100) return 99;
  if (rounded === 0 && clamped > 0) return 1;
  return rounded;
}

/** part / whole × 100 as a rounded value plus the clamped raw ratio. whole ≤ 0 → 0. */
export function toPercentage(part: number, whole: number): Percentage {
  const raw = whole > 0 && Number.isFinite(part) ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0;
  return { value: roundPercent(raw), raw };
}

/** Rounds an already-computed raw percentage (e.g. from summarizeWork). */
export function percentageFromRaw(raw: number): Percentage {
  const safe = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
  return { value: roundPercent(safe), raw: safe };
}

export function roundNullablePercent(raw: number | null): number | null {
  return raw === null ? null : roundPercent(raw);
}

export function metric<T = number>(
  value: T,
  source: MetricSource,
  label: string,
  description?: string,
): MetricValue<T> {
  return description === undefined ? { value, source, label } : { value, source, label, description };
}

export function progressDescription(method: ProgressMethod, estimationCoverage: number | null): string {
  if (method === "storyPoints") return "Based on completed story points.";
  if (estimationCoverage === null) return "Based on completed work items.";
  return `Based on completed work items because story-point coverage is ${estimationCoverage}%.`;
}

export function progressMetric(label: string, summary: WorkSummary): ProgressMetric {
  const percentage = percentageFromRaw(summary.progress);
  const estimationCoverage = roundNullablePercent(summary.estimationCoverage);
  return {
    value: percentage.value,
    raw: percentage.raw,
    source: summary.progressMethod,
    label,
    description: progressDescription(summary.progressMethod, estimationCoverage),
    method: summary.progressMethod,
    completed:
      summary.progressMethod === "storyPoints" ? (summary.storyPointsCompleted ?? 0) : summary.completedIssues,
    total: summary.progressMethod === "storyPoints" ? (summary.storyPointsTotal ?? 0) : summary.totalIssues,
    estimationCoverage,
  };
}

/** WorkSummary → client-facing count fields. */
export function workCounts(summary: WorkSummary): WorkCounts {
  return {
    totalWorkItems: summary.totalIssues,
    completedWorkItems: summary.completedIssues,
    inProgressWorkItems: summary.inProgressIssues,
    todoWorkItems: summary.todoIssues,
    unknownWorkItems: summary.unknownIssues,
    blockedWorkItems: summary.blockedIssues,
  };
}

export function progressFields(summary: WorkSummary): ProgressFields {
  const percentage = percentageFromRaw(summary.progress);
  return {
    progress: percentage.value,
    progressRaw: percentage.raw,
    progressMethod: summary.progressMethod,
    estimationCoverage: roundNullablePercent(summary.estimationCoverage),
  };
}
