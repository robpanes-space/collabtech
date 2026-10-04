import type { DashboardDto } from "@/lib/dashboard/types";
import { CompositionBar, ProgressRing } from "./kpi-visuals";
import { progressSourceLabel } from "./metric-card";
import { InfoHint, Panel } from "./primitives";

/** Hero progress block — values straight from summary.overallProgress and the status counts. */
export function OverallProgress({ summary }: { summary: DashboardDto["summary"] }) {
  const progress = summary.overallProgress;
  const unit = progress.method === "storyPoints" ? "story points" : "work items";

  return (
    <Panel className="flex h-full flex-col gap-5">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-medium text-muted-foreground">Project progress</h2>
        {progress.description ? <InfoHint label="How project progress is calculated">{progress.description}</InfoHint> : null}
      </div>
      <div
        role="progressbar"
        aria-label="Project progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.value}
        className="flex flex-1 items-center gap-5"
      >
        <ProgressRing value={progress.value} size={148}>
          <span className="text-4xl font-semibold tracking-tight tabular-nums">{progress.value}%</span>
          <span className="text-xs text-muted-foreground">complete</span>
        </ProgressRing>
        <div className="flex min-w-0 flex-col gap-0.5 text-sm">
          <p className="tabular-nums">
            {progress.completed} of {progress.total} {unit} completed
          </p>
          <p className="text-muted-foreground" data-testid="progress-source">
            {progressSourceLabel(progress.source)}
          </p>
        </div>
      </div>
      {summary.totalWorkItems.value > 0 ? (
        <CompositionBar
          className="mt-auto border-t border-border pt-4"
          label="Work items by status"
          segments={[
            { key: "done", label: "Done", count: summary.completedWorkItems.value, className: "bg-viz-done" },
            { key: "in_progress", label: "In progress", count: summary.inProgressWorkItems.value, className: "bg-viz-in-progress" },
            { key: "todo", label: "To do", count: summary.todoWorkItems.value, className: "bg-viz-todo" },
          ]}
        />
      ) : null}
    </Panel>
  );
}
