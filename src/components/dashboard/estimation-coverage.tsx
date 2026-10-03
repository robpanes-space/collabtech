import type { DashboardDto } from "@/lib/dashboard/types";
import { InfoHint } from "./primitives";
import { Meter } from "./status";

/** Story-point coverage tile — explains why progress may be based on work items. */
export function EstimationCoverage({ summary }: { summary: DashboardDto["summary"] }) {
  const coverage = summary.overallProgress.estimationCoverage;
  const usingPoints = summary.overallProgress.method === "storyPoints";

  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="min-w-0 leading-tight">Story-point coverage</span>
        <InfoHint label="About story-point coverage">
          {usingPoints
            ? "Every work item is estimated, so progress uses story points."
            : "Progress uses work items until every work item has a story-point estimate."}
        </InfoHint>
      </div>
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{coverage === null ? "—" : `${coverage}%`}</span>
      <Meter value={coverage ?? 0} label="Story-point coverage" size="sm" className="my-1" />
      <p className="text-xs text-muted-foreground tabular-nums">
        {summary.estimatedWorkItems.value} / {summary.totalWorkItems.value} work items estimated
      </p>
    </div>
  );
}
