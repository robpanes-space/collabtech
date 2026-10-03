import Link from "next/link";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import type { SprintDashboardDto } from "@/lib/dashboard/types";
import { formatDashboardDateRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "./primitives";
import { HealthIcon, HEALTH_DISPLAY, SPRINT_STATE_DISPLAY } from "./status";

/**
 * Delivery roadmap in backend order (MIG S<n>). Vertical on mobile, 4-up on tablet/laptop,
 * a single horizontal row from 1280px. Each node links to its sprint detail.
 */
export function SprintRoadmap({ sprints }: { sprints: readonly SprintDashboardDto[] }) {
  if (sprints.length === 0) {
    return <EmptyState title="No migration sprints">Sprints named “MIG S1 - …” will appear here once created in Jira.</EmptyState>;
  }

  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" aria-label="Migration sprint roadmap">
      {sprints.map((sprint) => (
        <li key={sprint.id} className="min-w-0">
          <RoadmapNode sprint={sprint} />
        </li>
      ))}
    </ol>
  );
}

const STATE_MARKER = {
  closed: { icon: CheckCircle2, className: "text-status-good", bar: "bg-status-good" },
  active: { icon: CircleDot, className: "text-viz-series-1", bar: "bg-viz-series-1" },
  future: { icon: Circle, className: "text-muted-foreground", bar: "bg-border" },
} as const;

function RoadmapNode({ sprint }: { sprint: SprintDashboardDto }) {
  const marker = STATE_MARKER[sprint.state];
  const Marker = marker.icon;
  const flagged = sprint.health.status === "blocked" || sprint.health.status === "at_risk";
  const label = `S${sprint.roadmapPosition ?? "?"}`;

  return (
    <Link
      href={`/sprints/${sprint.id}`}
      aria-label={`${sprint.name}: ${SPRINT_STATE_DISPLAY[sprint.state].label}, ${sprint.progress}% complete${
        flagged ? `, ${HEALTH_DISPLAY[sprint.health.status].label}` : ""
      }`}
      className={cn(
        "group relative flex h-full min-w-0 flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-4 pt-5 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        sprint.state === "active" && "border-viz-series-1/50",
      )}
    >
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1", marker.bar)} />
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Marker aria-hidden className={cn("size-4", marker.className)} />
          {label}
        </span>
        {flagged ? <HealthIcon status={sprint.health.status} /> : null}
      </div>
      <p className="line-clamp-2 text-sm font-medium" title={sprint.name}>
        {sprint.shortName}
      </p>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {SPRINT_STATE_DISPLAY[sprint.state].label}
        {flagged ? ` · ${HEALTH_DISPLAY[sprint.health.status].label}` : ""}
      </p>
      <div className="mt-auto flex flex-col gap-1">
        {sprint.state === "future" ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {sprint.totalWorkItems} work item{sprint.totalWorkItems === 1 ? "" : "s"}
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold tabular-nums">{sprint.progress}%</p>
            <div aria-hidden className="h-1 overflow-hidden rounded-full bg-viz-track">
              <div className={cn("h-full rounded-full", marker.bar)} style={{ width: `${sprint.progress}%` }} />
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">{formatDashboardDateRange(sprint.startDate, sprint.endDate)}</p>
      </div>
    </Link>
  );
}
