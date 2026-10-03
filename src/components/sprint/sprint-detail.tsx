import Link from "next/link";
import { ArrowRight, CalendarDays, OctagonAlert } from "lucide-react";
import type { SprintDashboardDto, WorkItemDto, WorkItemGroup } from "@/lib/dashboard/types";
import { formatCalendarDate, formatDashboardDateRange } from "@/lib/format";
import { JiraLink } from "@/components/dashboard/jira-link";
import { MetricCard, progressSourceLabel } from "@/components/dashboard/metric-card";
import { EmptyState, Panel } from "@/components/dashboard/primitives";
import { GROUP_DISPLAY, GroupBadge, HealthBadge, Meter, SeverityBadge, SprintStateBadge } from "@/components/dashboard/status";

export function SprintHeader({ sprint }: { sprint: SprintDashboardDto }) {
  return (
    <header className="flex flex-col gap-3">
      <Link href="/sprints" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← All sprints
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{sprint.name}</h1>
        <SprintStateBadge state={sprint.state} />
        <HealthBadge status={sprint.health.status} />
      </div>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CalendarDays aria-hidden className="size-4" />
        {formatDashboardDateRange(sprint.startDate, sprint.endDate)}
      </p>
      {sprint.goal ? (
        <div className="max-w-3xl">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Sprint goal</h2>
          <p className="mt-1 text-sm break-words whitespace-pre-line">{sprint.goal}</p>
        </div>
      ) : null}
      {sprint.health.reasons.length > 0 && sprint.health.status !== "future" ? (
        <ul className="text-sm text-muted-foreground">
          {sprint.health.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}

export function SprintMetrics({ sprint }: { sprint: SprintDashboardDto }) {
  return (
    <div className="flex flex-col gap-3">
      <Panel className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-4xl font-semibold tracking-tight tabular-nums">{sprint.progress}%</p>
          <p className="text-sm text-muted-foreground">{progressSourceLabel(sprint.progressMethod)}</p>
        </div>
        <Meter value={sprint.progress} label={`${sprint.name} progress`} size="lg" />
      </Panel>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Completed" value={sprint.completedWorkItems} suffix={`of ${sprint.totalWorkItems}`} />
        <MetricCard label="In progress" value={sprint.inProgressWorkItems} />
        <MetricCard label="To do" value={sprint.todoWorkItems} />
        <MetricCard label="Blocked" value={sprint.blockedWorkItems} />
        <MetricCard
          label="Story-point coverage"
          value={sprint.estimationCoverage === null ? "—" : `${sprint.estimationCoverage}%`}
          provenance="Work items with an estimate"
        />
        <MetricCard
          label="Story points"
          value={sprint.storyPointsCompleted ?? "—"}
          suffix={sprint.storyPointsCommitted !== null ? `of ${sprint.storyPointsCommitted}` : undefined}
          provenance={sprint.storyPointsRemaining !== null ? `${sprint.storyPointsRemaining} remaining` : "Not estimated"}
        />
      </div>
    </div>
  );
}

const GROUP_ORDER: WorkItemGroup[] = ["blocked", "in_progress", "todo", "done", "unknown"];

/** Work items grouped by the backend's display group — a readable list, not a board. */
export function SprintWorkItems({ items }: { items: readonly WorkItemDto[] }) {
  if (items.length === 0) {
    return <EmptyState title="No work items in this sprint">Work added to this sprint in Jira will appear here.</EmptyState>;
  }
  return (
    <div className="flex flex-col gap-6">
      {GROUP_ORDER.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        return (
          <section key={group} aria-labelledby={`group-${group}`} className="flex flex-col gap-2">
            <h3 id={`group-${group}`} className="flex items-center gap-2 text-sm font-semibold">
              {GROUP_DISPLAY[group].label}
              <span className="font-normal text-muted-foreground tabular-nums">{groupItems.length}</span>
            </h3>
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {groupItems.map((item) => (
                <WorkItemRow key={item.key} item={item} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function WorkItemRow({ item }: { item: WorkItemDto }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words">{item.summary}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <JiraLink issueKey={item.key} url={item.jiraUrl} />
          {item.milestoneLabel ? <span>· Milestone {item.milestoneLabel}</span> : null}
          <span>· {item.assignee ?? "Unassigned"}</span>
          {item.storyPoints !== null ? <span>· {item.storyPoints} pts</span> : null}
          {item.dueDate ? <span>· Due {formatCalendarDate(item.dueDate)}</span> : null}
        </p>
        {item.blocked && item.blockedBy.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-1 text-xs" aria-label={`${item.key} is blocked by`}>
            {item.blockedBy.map((blocker) => (
              <li key={blocker.key} className="flex min-w-0 flex-wrap items-center gap-1.5">
                <OctagonAlert aria-hidden className="size-3.5 text-status-critical" />
                <span className="text-muted-foreground">Blocked by</span>
                {blocker.severity ? <SeverityBadge severity={blocker.severity} /> : null}
                <span>
                  {blocker.registerId ? `${blocker.registerId} ` : ""}
                  {blocker.title ?? blocker.key}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        {/* Jira status name only when it adds information beyond the group badge. */}
        {item.status.toLowerCase() !== GROUP_DISPLAY[item.group].label.toLowerCase() ? (
          <span className="text-xs text-muted-foreground">{item.status}</span>
        ) : null}
        <GroupBadge group={item.group} />
      </div>
    </li>
  );
}

/** Compact sprint summary for the /sprints list. */
export function SprintCard({ sprint }: { sprint: SprintDashboardDto }) {
  return (
    <Link
      href={`/sprints/${sprint.id}`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:flex-row sm:items-center sm:gap-6"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{sprint.name}</h3>
          <SprintStateBadge state={sprint.state} />
          {sprint.state !== "future" ? <HealthBadge status={sprint.health.status} /> : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDashboardDateRange(sprint.startDate, sprint.endDate)} · {sprint.totalWorkItems} work item
          {sprint.totalWorkItems === 1 ? "" : "s"}
          {sprint.blockedWorkItems > 0 ? ` · ${sprint.blockedWorkItems} blocked` : ""}
        </p>
        {sprint.goal ? <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{sprint.goal}</p> : null}
      </div>
      <div className="flex items-center gap-3 sm:w-56">
        <Meter value={sprint.progress} label={`${sprint.name} progress`} size="sm" />
        <span className="w-10 text-right text-sm font-medium tabular-nums">{sprint.progress}%</span>
        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </div>
    </Link>
  );
}
