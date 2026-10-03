import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { DataConfidenceStatus } from "@/components/dashboard/data-confidence";
import { DeliveryPace } from "@/components/dashboard/delivery-pace";
import { HistorySkeleton, OverviewHistory } from "@/components/history/history-sections";
import { BlockerPanel } from "@/components/dashboard/blocker-panel";
import { CurrentSprintCard, MultipleActiveSprintsNotice } from "@/components/dashboard/current-sprint";
import { DashboardError } from "@/components/dashboard/dashboard-error";
import { DashboardWarnings } from "@/components/dashboard/dashboard-notice";
import { MetricsGrid } from "@/components/dashboard/metrics-grid";
import { MilestoneProgress } from "@/components/dashboard/milestone-progress";
import { OverallProgress } from "@/components/dashboard/overall-progress";
import { EmptyState, Panel, Section } from "@/components/dashboard/primitives";
import { ProjectHeader, ProjectHealthBanner } from "@/components/dashboard/project-header";
import { RiskSummary } from "@/components/dashboard/risk-summary";
import { SprintRoadmap } from "@/components/dashboard/sprint-roadmap";
import { SprintProgressChart } from "@/components/charts/sprint-progress-chart";
import { StatusDistributionChart } from "@/components/charts/status-distribution-chart";
import { WorkloadChart } from "@/components/charts/workload-chart";
import { loadDashboard } from "@/lib/dashboard/get-dashboard-data";
import { currentSprintOf, otherActiveSprints } from "@/lib/dashboard/selectors";
import type { DashboardWarningCode } from "@/lib/dashboard/types";

// Rendered per request; Jira data itself is cached ~60s server-side (see get-dashboard-data).
export const dynamic = "force-dynamic";

/** Notes a client needs to read the numbers correctly (P0 blocking is in the health banner). */
const CLIENT_NOTE_CODES: readonly DashboardWarningCode[] = [
  "MISSING_SPRINT_DATES",
  "STORY_POINTS_INCOMPLETE",
  "NO_STORY_POINTS_FIELD",
  "NO_ACTIVE_SPRINT",
  "NO_MIGRATION_SPRINTS",
];

export default async function OverviewPage() {
  const result = await loadDashboard();
  if (!result.ok) return <DashboardError message={result.error.message} />;

  const dto = result.data;
  const now = new Date();
  const current = currentSprintOf(dto);
  const others = otherActiveSprints(dto, current);
  const { summary, charts } = dto;

  return (
    <>
      <ProjectHeader title={dto.project.name} description="Project progress" sync={dto.sync} now={now} />

      <div className="flex flex-col gap-2">
        <ProjectHealthBanner health={dto.projectHealth} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <Suspense fallback={<span className="text-sm text-muted-foreground">Checking data confidence…</span>}>
            <DataConfidenceStatus />
          </Suspense>
          <Link
            href="/report"
            className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Status report <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid gap-4 lg:grid-cols-3">
          <OverallProgress summary={summary} />
          <div className="lg:col-span-2">
            <CurrentSprintCard sprint={current} following={dto.migrationState.followingMigrationSprint} />
          </div>
        </div>
        <MultipleActiveSprintsNotice shown={current} others={others} />
      </div>

      <section aria-label="Key metrics">
        <MetricsGrid summary={summary} />
      </section>

      <div className="grid gap-8 lg:grid-cols-5">
        <Section
          id="blockers"
          title="Critical blockers"
          description={`${summary.blockedWorkItems.value} open work items are blocked`}
          className="lg:col-span-3"
        >
          <BlockerPanel blockers={dto.blockers} />
        </Section>
        <Section id="risks" title="Risks" description="Open P0 and P1 risks" className="lg:col-span-2">
          <RiskSummary distribution={charts.riskDistribution} risks={dto.risks} />
        </Section>
      </div>

      <Section id="roadmap" title="Delivery roadmap" description="Migration sprints in delivery order">
        <SprintRoadmap sprints={dto.migrationSprints} />
      </Section>

      <Section id="milestones" title="Milestones" description="Committed milestones · select a row for details">
        <MilestoneProgress milestones={dto.milestones} />
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section id="sprint-progress" title="Sprint progress" description="Completion per migration sprint">
          <Panel>
            {charts.sprintProgress.length > 0 ? (
              <SprintProgressChart points={charts.sprintProgress} />
            ) : (
              <EmptyState title="No migration sprints">Sprint progress appears once migration sprints exist.</EmptyState>
            )}
          </Panel>
        </Section>
        <Section id="status" title="Work status" description="All committed work items by status">
          <Panel className="flex flex-col gap-4">
            {summary.totalWorkItems.value > 0 ? (
              <StatusDistributionChart points={charts.statusDistribution} total={summary.totalWorkItems.value} />
            ) : (
              <EmptyState title="No work items">Work items appear here once created in Jira.</EmptyState>
            )}
            <p className="border-t border-border pt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{summary.blockedWorkItems.value}</span> of these work items
              are blocked (counted within their status above).
            </p>
          </Panel>
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section id="workload" title="Workload" description="Open work items by assignee">
          <Panel>
            {charts.workload.length > 0 ? (
              <WorkloadChart entries={charts.workload} />
            ) : (
              <EmptyState title="No assigned work">There is no open work to assign.</EmptyState>
            )}
          </Panel>
        </Section>
        <Section id="pace" title="Delivery pace" description="Committed vs completed per closed sprint">
          <Panel>
            <DeliveryPace charts={charts} />
          </Panel>
        </Section>
      </div>

      {/* History is cached separately (5 min) and streamed; it can fail without affecting the above. */}
      <Suspense fallback={<HistorySkeleton rows={4} />}>
        <OverviewHistory />
      </Suspense>

      {/* Client-relevant notes only; detailed diagnostics live on /admin/readiness. */}
      {dto.warnings.some((w) => CLIENT_NOTE_CODES.includes(w.code)) ? (
        <Section id="notes" title="Data notes" description="How Jira data is being interpreted">
          <DashboardWarnings warnings={dto.warnings.filter((w) => CLIENT_NOTE_CODES.includes(w.code))} />
        </Section>
      ) : null}
    </>
  );
}
