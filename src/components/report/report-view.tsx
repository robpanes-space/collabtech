import type { ReactNode } from "react";
import { JiraLink } from "@/components/dashboard/jira-link";
import { HealthBadge, Meter, SeverityBadge, SprintStateBadge } from "@/components/dashboard/status";
import { progressSourceLabel } from "@/components/dashboard/metric-card";
import type { BlockedWorkItemDto, DashboardDto, MilestoneDashboardDto, RiskDashboardDto, SprintDashboardDto, SprintRefDto } from "@/lib/dashboard/types";
import { formatDashboardDate, formatDashboardDateRange, formatRelativeTime } from "@/lib/format";
import type { CompletionDto, HistoryActivityDto } from "@/lib/history/types";
import type { DataConfidence } from "@/lib/readiness/types";
import { cn } from "@/lib/utils";

/**
 * Stakeholder status report — compact, printable, presentation only. Every value comes from the
 * existing dashboard / history DTOs (no new metrics).
 */

export function ReportSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-w-0 break-inside-avoid flex-col gap-2", className)}>
      <h2 className="border-b border-border pb-1 text-sm font-semibold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}

const Muted = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

export function DataConfidenceLine({ confidence }: { confidence: DataConfidence | null }) {
  if (!confidence) return null;
  return (
    <p className="text-sm" data-confidence={confidence.level}>
      <span className="text-muted-foreground">Data confidence: </span>
      <span className="font-medium">{confidence.label}</span>
      {confidence.reasons.length > 0 ? <span className="text-muted-foreground"> — {confidence.summary.replace(/^\w+: /, "")}</span> : null}
    </p>
  );
}

export function ReportSummary({ dto, current, next }: { dto: DashboardDto; current: SprintDashboardDto | null; next: SprintRefDto | null }) {
  const progress = dto.summary.overallProgress;
  const unit = progress.method === "storyPoints" ? "story points" : "work items";
  return (
    <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4 break-inside-avoid">
        <p className="text-xs font-medium text-muted-foreground uppercase">Overall progress</p>
        <p className="text-3xl font-semibold tabular-nums">{progress.value}%</p>
        <Meter value={progress.value} label="Overall progress" />
        <p className="text-sm">
          {progress.completed} of {progress.total} {unit} completed · {progressSourceLabel(progress.source)}
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4 break-inside-avoid">
        <p className="text-xs font-medium text-muted-foreground uppercase">Project health</p>
        <div>
          <HealthBadge status={dto.projectHealth.status} />
        </div>
        {dto.projectHealth.reasons.length > 0 ? <p className="text-sm">{dto.projectHealth.reasons.join(" ")}</p> : null}
        <p className="text-sm text-muted-foreground">
          {dto.summary.blockedWorkItems.value} blocked work items · {dto.summary.p0Risks.value} open P0 · {dto.summary.p1Risks.value} open P1
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4 break-inside-avoid">
        <p className="text-xs font-medium text-muted-foreground uppercase">Current sprint</p>
        {current ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{current.name}</span>
              <SprintStateBadge state={current.state} />
              <HealthBadge status={current.health.status} />
            </div>
            <p className="text-sm text-muted-foreground">{formatDashboardDateRange(current.startDate, current.endDate)}</p>
            <p className="text-sm">
              {current.progress}% · {current.completedWorkItems} of {current.totalWorkItems} work items done · {current.blockedWorkItems} blocked
            </p>
            {current.goal ? <p className="text-sm break-words text-muted-foreground">Goal: {current.goal}</p> : null}
          </>
        ) : (
          <Muted>No sprint is in progress.</Muted>
        )}
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4 break-inside-avoid">
        <p className="text-xs font-medium text-muted-foreground uppercase">Next sprint</p>
        {next ? (
          <>
            <span className="font-semibold">{next.name}</span>
            <p className="text-sm text-muted-foreground">{formatDashboardDateRange(next.startDate, next.endDate)}</p>
          </>
        ) : (
          <Muted>No further migration sprints.</Muted>
        )}
      </div>
    </div>
  );
}

export function CompletedList({ items, days }: { items: readonly CompletionDto[] | null; days: number }) {
  if (items === null) return <Muted>Completion history is temporarily unavailable.</Muted>;
  if (items.length === 0) return <Muted>No work items were completed in the last {days} days.</Muted>;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((item) => (
        <li key={item.issueKey} className="flex flex-wrap gap-x-2 break-words">
          <JiraLink issueKey={item.issueKey} url={item.jiraUrl} className="text-muted-foreground" />
          <span className="min-w-0">
            {item.kind === "risk" && item.riskSeverity ? `${item.riskSeverity} risk resolved: ` : ""}
            {item.summary}
          </span>
          <span className="text-muted-foreground">
            {item.milestoneLabel ? `${item.milestoneLabel} · ` : ""}
            {formatDashboardDate(item.completedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function BlockerList({ blockers, limit = 8 }: { blockers: readonly BlockedWorkItemDto[]; limit?: number }) {
  if (blockers.length === 0) return <Muted>No open work items are blocked.</Muted>;
  const shown = blockers.slice(0, limit);
  return (
    <>
      <ul className="flex flex-col gap-1.5 text-sm">
        {shown.map((item) => (
          <li key={item.key} className="break-words">
            <span className="font-medium">{item.summary}</span>{" "}
            <span className="text-muted-foreground">
              (<JiraLink issueKey={item.key} url={item.jiraUrl} />
              {item.milestoneLabel ? ` · ${item.milestoneLabel}` : ""})
            </span>
            <span className="text-muted-foreground">
              {" "}
              — blocked by{" "}
              {item.blockedBy.map((b) => `${b.registerId ? `${b.registerId} ` : ""}${b.title ?? b.key}${b.severity ? ` (${b.severity})` : ""}`).join("; ")}
            </span>
          </li>
        ))}
      </ul>
      {blockers.length > shown.length ? <Muted>And {blockers.length - shown.length} more blocked work items.</Muted> : null}
    </>
  );
}

export function RiskTable({ risks }: { risks: readonly RiskDashboardDto[] }) {
  const open = risks.filter((r) => !r.resolved).sort((a, b) => a.severity.localeCompare(b.severity));
  if (open.length === 0) return <Muted>No open P0 or P1 risks.</Muted>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th className="py-1 pr-3 font-medium">Risk</th>
          <th className="py-1 pr-3 font-medium">Severity</th>
          <th className="py-1 font-medium">Blocks</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {open.map((risk) => (
          <tr key={risk.key} className="break-inside-avoid">
            <td className="py-1.5 pr-3 align-top break-words">
              <span className="font-medium">{risk.registerId ?? risk.key}</span> {risk.title}
            </td>
            <td className="py-1.5 pr-3 align-top">
              <SeverityBadge severity={risk.severity} />
            </td>
            <td className="py-1.5 align-top tabular-nums">{risk.blocksWorkItems.length}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MilestoneTable({ milestones }: { milestones: readonly MilestoneDashboardDto[] }) {
  const committed = milestones.filter((m) => m.inProjectScope);
  if (committed.length === 0) return <Muted>No milestones yet.</Muted>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th className="py-1 pr-3 font-medium">Milestone</th>
          <th className="py-1 pr-3 font-medium">Progress</th>
          <th className="py-1 pr-3 font-medium">Done</th>
          <th className="py-1 font-medium">Health</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {committed.map((m) => (
          <tr key={m.key} className="break-inside-avoid">
            <td className="py-1.5 pr-3 align-top break-words">
              <span className="font-medium">{m.milestoneLabel ?? "—"}</span> {m.title}
            </td>
            <td className="py-1.5 pr-3 align-top tabular-nums">{m.progress}%</td>
            <td className="py-1.5 pr-3 align-top tabular-nums">
              {m.completedWorkItems}/{m.totalWorkItems}
            </td>
            <td className="py-1.5 align-top">
              <HealthBadge status={m.health.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ActivityList({ items, now, limit = 6 }: { items: readonly HistoryActivityDto[] | null; now: Date; limit?: number }) {
  if (items === null) return <Muted>Recent activity is temporarily unavailable.</Muted>;
  if (items.length === 0) return <Muted>No meaningful Jira changes in the last 30 days.</Muted>;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.slice(0, limit).map((item) => (
        <li key={item.id} className="break-words">
          {item.title}
          <span className="text-muted-foreground">
            {" "}
            · {item.issueSummary} · {formatRelativeTime(item.timestamp, now)}
          </span>
        </li>
      ))}
    </ul>
  );
}
