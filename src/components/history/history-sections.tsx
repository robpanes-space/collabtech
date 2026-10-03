import { ArrowRightLeft, CheckCircle2, CircleDot, Gauge, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { SprintBurndownChart } from "@/components/charts/sprint-burndown-chart";
import { ProjectProgressTrend, ThroughputChart } from "@/components/charts/history-charts";
import { DashboardNotice } from "@/components/dashboard/dashboard-notice";
import { JiraLink } from "@/components/dashboard/jira-link";
import { MetricCard } from "@/components/dashboard/metric-card";
import { EmptyState, InfoHint, Panel, Section } from "@/components/dashboard/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDashboardDateTime, formatRelativeTime } from "@/lib/format";
import { loadHistory } from "@/lib/history/history-service";
import type { ActivityType, HistoryActivityDto, HistoryDto, SprintHistoryDto } from "@/lib/history/types";

/**
 * History UI. Each section awaits the (separately cached) history payload inside its own
 * Suspense boundary, so slow or failed history never blocks or breaks the current dashboard.
 */

const ACTIVITY_ICON: Record<ActivityType, { icon: typeof CheckCircle2; className: string }> = {
  completed: { icon: CheckCircle2, className: "text-status-good" },
  risk_resolved: { icon: ShieldCheck, className: "text-status-good" },
  started: { icon: CircleDot, className: "text-viz-series-1" },
  reopened: { icon: RotateCcw, className: "text-status-warning" },
  risk_reopened: { icon: RotateCcw, className: "text-status-critical" },
  sprint_added: { icon: ArrowRightLeft, className: "text-muted-foreground" },
  sprint_removed: { icon: ArrowRightLeft, className: "text-muted-foreground" },
  assignee_changed: { icon: UserRound, className: "text-muted-foreground" },
  estimate_changed: { icon: Gauge, className: "text-muted-foreground" },
  priority_changed: { icon: Gauge, className: "text-muted-foreground" },
};

export function HistoryUnavailable({ title = "Historical analytics temporarily unavailable" }: { title?: string }) {
  return (
    <DashboardNotice level="info" title={title}>
      Current project status above is unaffected. History will reappear automatically.
    </DashboardNotice>
  );
}

export function HistorySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading history">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 rounded-lg" />
      ))}
    </div>
  );
}

export function RecentActivityList({ items, now, limit = 8 }: { items: readonly HistoryActivityDto[]; now: Date; limit?: number }) {
  if (items.length === 0) {
    return <EmptyState title="No recent activity">No meaningful Jira changes in the last 30 days.</EmptyState>;
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {items.slice(0, limit).map((item) => {
        const style = ACTIVITY_ICON[item.type];
        const Icon = style.icon;
        return (
          <li key={item.id} className="flex gap-3 px-4 py-3">
            <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${style.className}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium break-words">{item.title}</p>
              <p className="mt-0.5 text-sm break-words text-muted-foreground">
                {item.issueSummary}
                {item.description ? ` · ${item.description}` : ""}
              </p>
              <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <time dateTime={item.timestamp} title={formatDashboardDateTime(item.timestamp) ?? undefined}>
                  {formatRelativeTime(item.timestamp, now)}
                </time>
                <span>· {item.actorDisplayName}</span>
                {item.issueKeys.length === 1 ? (
                  <span>
                    · <JiraLink issueKey={item.issueKey} url={item.jiraUrl} />
                  </span>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Burndown panel for one sprint: chart, or a compact explanation of why it is unavailable. */
export function SprintBurndown({ sprint }: { sprint: SprintHistoryDto }) {
  const burndown = sprint.burndown.workItems;
  if (!burndown.available) {
    return (
      <EmptyState title="Burndown unavailable">
        {burndown.reason === "LOW_HISTORY_CONFIDENCE" || burndown.reason === "INSUFFICIENT_CHANGELOG"
          ? "This sprint does not yet have enough Jira history to reconstruct a reliable burndown."
          : burndown.message}
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <SprintBurndownChart points={burndown.points} storyPointsAvailable={sprint.burndown.storyPoints.available} />
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        Reconstructed from Jira status and sprint history · Ideal is a reference line from the start commitment
        {sprint.confidence.level === "medium" ? (
          <InfoHint label="About burndown confidence">{sprint.confidence.reasons.join(" ")}</InfoHint>
        ) : null}
      </p>
    </div>
  );
}

export function SprintScopeMetrics({ sprint }: { sprint: SprintHistoryDto }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MetricCard label="Committed at start" value={sprint.committedWorkItems} provenance="Work items in the sprint when it started" />
      <MetricCard label="Added after start" value={sprint.addedWorkItems} provenance="Explains rises in the burndown" />
      <MetricCard label="Removed after start" value={sprint.removedWorkItems} provenance="Left the sprint after it started" />
      <MetricCard
        label="Completed"
        value={sprint.finalCompletedWorkItems}
        suffix={`of ${sprint.finalScopeWorkItems}`}
        provenance={sprint.completionRate === null ? "No work in the sprint" : `${sprint.completionRate}% of current sprint scope`}
      />
    </div>
  );
}

/** Overview: recent activity, active-sprint burndown, progress trend, throughput. */
export async function OverviewHistory() {
  const result = await loadHistory();
  if (!result.ok) {
    return (
      <Section id="history" title="Recent activity & history">
        <HistoryUnavailable />
      </Section>
    );
  }
  return <OverviewHistoryContent history={result.data} now={new Date()} />;
}

export function OverviewHistoryContent({ history, now }: { history: HistoryDto; now: Date }) {
  const burndown = history.activeSprintBurndown;
  const trend = history.projectTrend;
  return (
    <>
      <div className="grid gap-8 lg:grid-cols-2">
        <Section
          id="burndown"
          title={burndown ? `${burndown.name} burndown` : "Sprint burndown"}
          description="Remaining work in the current migration sprint"
        >
          <Panel>
            {burndown ? (
              <SprintBurndown sprint={burndown} />
            ) : (
              <EmptyState title="No migration sprint in progress">Burndown appears when a migration sprint is active in Jira.</EmptyState>
            )}
          </Panel>
        </Section>
        <Section
          id="trend"
          title="Project progress over time"
          description={
            <span className="inline-flex items-center gap-1">
              Based on Jira status history
              <InfoHint label="About project progress over time">
                Reconstructed progress of the current committed scope (work items), so it reflects today&apos;s
                scope definition rather than a fixed historical baseline.
              </InfoHint>
            </span>
          }
        >
          <Panel>
            {trend.available ? (
              <ProjectProgressTrend points={trend.points} />
            ) : (
              <EmptyState title="Not enough history yet">{trend.message}</EmptyState>
            )}
          </Panel>
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        <Section id="activity" title="Recent activity" description="Meaningful Jira changes, last 30 days" className="lg:col-span-3">
          <RecentActivityList items={history.recentActivity} now={now} />
        </Section>
        <Section id="throughput" title="Throughput" description="Work items completed per week" className="lg:col-span-2">
          <Panel className="flex flex-col gap-3">
            {history.throughput.available ? (
              <ThroughputChart points={history.throughput.points} />
            ) : (
              <EmptyState title="Not enough history yet">{history.throughput.message}</EmptyState>
            )}
            {history.cycleTime.available ? (
              <p className="text-xs text-muted-foreground">
                Median cycle time {history.cycleTime.medianDays} days ({history.cycleTime.sampleSize} items)
              </p>
            ) : null}
          </Panel>
        </Section>
      </div>

    </>
  );
}

/** Sprint detail: scope changes + burndown for one sprint. */
export async function SprintHistorySection({ sprintId }: { sprintId: number }) {
  const result = await loadHistory();
  if (!result.ok) return <HistoryUnavailable />;
  const sprint = result.data.sprints.find((s) => s.sprintId === sprintId);
  if (!sprint) {
    return <EmptyState title="Burndown unavailable">History is tracked for migration sprints and active sprints.</EmptyState>;
  }
  return (
    <div className="flex flex-col gap-4">
      {sprint.availability.available ? <SprintScopeMetrics sprint={sprint} /> : null}
      <Panel>
        <SprintBurndown sprint={sprint} />
      </Panel>
    </div>
  );
}


