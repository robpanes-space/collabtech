import type { DashboardDto } from "@/lib/dashboard/types";
import { Ruler } from "lucide-react";
import { IconChip } from "./kpi-visuals";
import { InfoHint } from "./primitives";
import { Meter } from "./status";

/** Story-point coverage tile — explains why progress may be based on work items. */
export function EstimationCoverage({ summary }: { summary: DashboardDto["summary"] }) {
  const coverage = summary.overallProgress.estimationCoverage;
  const usingPoints = summary.overallProgress.method === "storyPoints";

  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/15">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <IconChip tone={usingPoints ? "good" : "neutral"}>
          <Ruler />
        </IconChip>
        <span className="min-w-0 leading-tight">Story-point coverage</span>
        <InfoHint label="About story-point coverage">
          {usingPoints
            ? "Every work item is estimated, so progress uses story points."
            : "Progress uses work items until every work item has a story-point estimate."}
        </InfoHint>
      </div>
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{coverage === null ? "—" : `${coverage}%`}</span>
      <Meter value={coverage ?? 0} label="Story-point coverage" size="sm" className="mt-0.5" />
      <p className="text-xs text-muted-foreground tabular-nums">
        {summary.estimatedWorkItems.value} / {summary.totalWorkItems.value} work items estimated
      </p>
    </div>
  );
}
