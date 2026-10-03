import { ChevronRight } from "lucide-react";
import type { MilestoneDashboardDto } from "@/lib/dashboard/types";
import { progressSourceLabel } from "./metric-card";
import { EmptyState } from "./primitives";
import { HealthBadge, Meter } from "./status";

/**
 * Compact milestone rows (committed milestones only). Native <details> expands each row
 * with the deterministic health reasons — keyboard accessible, no client JS.
 */
export function MilestoneProgress({ milestones }: { milestones: readonly MilestoneDashboardDto[] }) {
  const committed = milestones.filter((m) => m.inProjectScope);
  const optional = milestones.filter((m) => !m.inProjectScope);

  if (committed.length === 0) {
    return <EmptyState title="No milestones">Milestone epics will appear here once they exist in Jira.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {committed.map((milestone) => (
          <li key={milestone.key}>
            <MilestoneRow milestone={milestone} />
          </li>
        ))}
      </ul>
      {optional.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Not included in committed progress: {optional.map((m) => m.name).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function MilestoneRow({ milestone }: { milestone: MilestoneDashboardDto }) {
  return (
    <details className="group">
      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto] [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
          <span className="w-7 shrink-0 text-sm font-semibold tabular-nums">{milestone.milestoneLabel ?? "—"}</span>
          <span className="truncate text-sm" title={milestone.title}>
            {milestone.title}
          </span>
        </div>
        <div className="col-span-2 flex items-center gap-3 md:col-span-1 md:row-start-1 md:col-start-2">
          <Meter value={milestone.progress} label={`${milestone.milestoneLabel ?? milestone.title} progress`} size="sm" />
          <span className="w-10 text-right text-sm font-medium tabular-nums">{milestone.progress}%</span>
        </div>
        <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 md:col-start-3">
          <HealthBadge status={milestone.health.status} />
        </div>
      </summary>
      <div className="flex flex-col gap-2 px-4 pb-4 pl-[3.25rem] text-sm">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground tabular-nums">
          <div>
            <dt className="sr-only">Completed</dt>
            <dd>
              {milestone.completedWorkItems} of {milestone.totalWorkItems} work items done
            </dd>
          </div>
          <div>
            <dt className="sr-only">Blocked</dt>
            <dd>{milestone.blockedWorkItems} blocked</dd>
          </div>
          <div>
            <dt className="sr-only">Open P0 risks</dt>
            <dd>{milestone.openP0Risks} open P0</dd>
          </div>
          <div>
            <dt className="sr-only">Open P1 risks</dt>
            <dd>{milestone.openP1Risks} open P1</dd>
          </div>
          <div>
            <dt className="sr-only">Progress method</dt>
            <dd>{progressSourceLabel(milestone.progressMethod)}</dd>
          </div>
        </dl>
        {milestone.health.reasons.length > 0 ? (
          <ul className="list-disc pl-4">
            {milestone.health.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
