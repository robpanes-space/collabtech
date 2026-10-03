import type { Metadata } from "next";
import Link from "next/link";
import { DashboardError } from "@/components/dashboard/dashboard-error";
import { PrintButton } from "@/components/report/print-button";
import {
  ActivityList,
  BlockerList,
  CompletedList,
  DataConfidenceLine,
  MilestoneTable,
  ReportSection,
  ReportSummary,
  RiskTable,
} from "@/components/report/report-view";
import { loadDashboard } from "@/lib/dashboard/get-dashboard-data";
import { currentSprintOf } from "@/lib/dashboard/selectors";
import { formatDashboardDateTime } from "@/lib/format";
import { loadHistory } from "@/lib/history/history-service";
import { loadDataConfidence } from "@/lib/readiness/readiness-service";
import { completedWithin, parseReportPeriod, REPORT_PERIODS } from "@/lib/report/period";
import { cn } from "@/lib/utils";
import { appVersion } from "@/lib/version";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Status report" };

/**
 * Stakeholder status report (printable). Built only from the existing dashboard + history DTOs;
 * history or data-confidence failures degrade their sections instead of failing the report.
 */
export default async function ReportPage({ searchParams }: PageProps<"/report">) {
  const period = parseReportPeriod((await searchParams).period);
  const [dashboard, history, confidence] = await Promise.all([loadDashboard(), loadHistory(), loadDataConfidence()]);
  if (!dashboard.ok) return <DashboardError message={dashboard.error.message} />;

  const dto = dashboard.data;
  const now = new Date();
  const current = currentSprintOf(dto);
  const next = dto.migrationState.followingMigrationSprint;
  const completed = history.ok ? completedWithin(history.data.completions, period, now) : null;

  return (
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-6 print:max-w-none print:gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Jira Custom Dashboard · Progress report</p>
            <h1 className="text-2xl font-semibold tracking-tight">Project status report</h1>
          </div>
          <PrintButton />
        </div>
        <p className="text-sm text-muted-foreground">
          {dto.project.name} · Generated {formatDashboardDateTime(now.toISOString())} · Jira data as of{" "}
          {formatDashboardDateTime(dto.sync.timestamp)}
        </p>
        <DataConfidenceLine confidence={confidence} />
        <nav aria-label="Report period" className="flex flex-wrap items-center gap-1.5 text-sm print:hidden">
          <span className="text-muted-foreground">Completed in the last</span>
          {REPORT_PERIODS.map((days) => (
            <Link
              key={days}
              href={`/report?period=${days}`}
              aria-current={days === period ? "page" : undefined}
              className={cn(
                "rounded-md border border-border px-2 py-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                days === period && "border-foreground bg-foreground text-background hover:bg-foreground/90",
              )}
            >
              {days} days
            </Link>
          ))}
        </nav>
      </header>

      <ReportSummary dto={dto} current={current} next={next} />

      <ReportSection title={`Completed in the last ${period} days`}>
        <CompletedList items={completed} days={period} />
      </ReportSection>

      <ReportSection title="Current blockers">
        <BlockerList blockers={dto.blockers} />
      </ReportSection>

      <ReportSection title="Open risks">
        <RiskTable risks={dto.risks} />
      </ReportSection>

      <ReportSection title="Milestones">
        <MilestoneTable milestones={dto.milestones} />
      </ReportSection>

      <ReportSection title="Recent activity">
        <ActivityList items={history.ok ? history.data.recentActivity : null} now={now} />
      </ReportSection>

      <footer className="border-t border-border pt-3 text-xs text-muted-foreground">
        Source: Jira (the source of truth), read-only. Progress, health and risks follow the dashboard&apos;s documented
        rules. Dashboard {appVersion().label}.
      </footer>
    </article>
  );
}
