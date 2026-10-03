import type { DashboardDto } from "@/lib/dashboard/types";
import { progressSourceLabel } from "./metric-card";
import { InfoHint, Panel } from "./primitives";
import { Meter } from "./status";

/** Hero progress block — values straight from summary.overallProgress. */
export function OverallProgress({ summary }: { summary: DashboardDto["summary"] }) {
  const progress = summary.overallProgress;
  const unit = progress.method === "storyPoints" ? "story points" : "work items";

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-medium text-muted-foreground">Project progress</h2>
        {progress.description ? <InfoHint label="How project progress is calculated">{progress.description}</InfoHint> : null}
      </div>
      <p className="text-5xl font-semibold tracking-tight tabular-nums">{progress.value}%</p>
      <Meter value={progress.value} label="Project progress" size="lg" />
      <div className="flex flex-col gap-0.5 text-sm">
        <p className="tabular-nums">
          {progress.completed} of {progress.total} {unit} completed
        </p>
        <p className="text-muted-foreground" data-testid="progress-source">
          {progressSourceLabel(progress.source)}
        </p>
      </div>
    </Panel>
  );
}
