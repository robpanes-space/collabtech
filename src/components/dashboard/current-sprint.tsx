import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import type { SprintDashboardDto, SprintRefDto } from "@/lib/dashboard/types";
import { formatDashboardDateRange } from "@/lib/format";
import { DashboardNotice } from "./dashboard-notice";
import { progressSourceLabel } from "./metric-card";
import { EmptyState, Panel, Stat } from "./primitives";
import { HealthBadge, Meter, SprintStateBadge } from "./status";

export function CurrentSprintCard({
  sprint,
  following,
}: {
  sprint: SprintDashboardDto | null;
  following: SprintRefDto | null;
}) {
  return (
    <Panel className="flex h-full flex-col gap-4">
      <h2 className="text-sm font-medium text-muted-foreground">Current sprint</h2>
      {sprint ? <SprintBody sprint={sprint} /> : <EmptyState title="No active sprint">Jira reports no sprint in progress.</EmptyState>}
      {following ? (
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">Next sprint</span>
          <Link
            href={`/sprints/${following.id}`}
            className="font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {following.name}
          </Link>
          <span className="text-muted-foreground">· {formatDashboardDateRange(following.startDate, following.endDate)}</span>
        </div>
      ) : null}
    </Panel>
  );
}

function SprintBody({ sprint }: { sprint: SprintDashboardDto }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xl font-semibold tracking-tight">
            <Link
              href={`/sprints/${sprint.id}`}
              className="underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {sprint.name}
            </Link>
          </h3>
          <SprintStateBadge state={sprint.state} />
          <HealthBadge status={sprint.health.status} />
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays aria-hidden className="size-4" />
          {formatDashboardDateRange(sprint.startDate, sprint.endDate)}
        </p>
        {sprint.goal ? <p className="line-clamp-3 max-w-prose text-sm">{sprint.goal}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{sprint.progress}%</span>
          <span className="text-xs text-muted-foreground">
            {progressSourceLabel(sprint.progressMethod)}
            {sprint.estimationCoverage !== null ? ` · Story-point coverage ${sprint.estimationCoverage}%` : ""}
          </span>
        </div>
        <Meter value={sprint.progress} label={`${sprint.name} progress`} />
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Completed" value={`${sprint.completedWorkItems} of ${sprint.totalWorkItems}`} />
        <Stat label="In progress" value={sprint.inProgressWorkItems} />
        <Stat label="To do" value={sprint.todoWorkItems} />
        <Stat label="Blocked" value={sprint.blockedWorkItems} />
      </dl>

      {sprint.health.reasons.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {sprint.health.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <Link
        href={`/sprints/${sprint.id}`}
        className="inline-flex w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        View sprint work <ArrowRight aria-hidden className="size-4" />
      </Link>
    </>
  );
}

/** Informational (not an error): Jira runs parallel sprints. */
export function MultipleActiveSprintsNotice({
  shown,
  others,
}: {
  shown: SprintDashboardDto | null;
  others: readonly SprintDashboardDto[];
}) {
  if (!shown || others.length === 0) return null;
  return (
    <DashboardNotice level="info" title={`${others.length + 1} Jira sprints are currently active`} code="MULTIPLE_ACTIVE_SPRINTS">
      This dashboard is showing <span className="font-medium text-foreground">{shown.name}</span>. Also active:{" "}
      {others.map((sprint, index) => (
        <span key={sprint.id}>
          {index > 0 ? ", " : ""}
          <span className="font-medium text-foreground">{sprint.name}</span>
          {sprint.totalWorkItems === 0 ? " (no work items)" : ""}
        </span>
      ))}
      .
    </DashboardNotice>
  );
}
