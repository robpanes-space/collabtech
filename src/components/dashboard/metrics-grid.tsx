import { CheckCircle2, CircleDot, Flag, Milestone, OctagonAlert, ShieldAlert, TriangleAlert } from "lucide-react";
import type { DashboardDto } from "@/lib/dashboard/types";
import { EstimationCoverage } from "./estimation-coverage";
import { SegmentTrack, ShareBar } from "./kpi-visuals";
import { MetricCard } from "./metric-card";

/**
 * Primary KPI row: 4 columns desktop, 2 tablet/mobile. Values come straight from the DTO;
 * mini visuals are drawn from the same raw counts (no derived percentages).
 */
export function MetricsGrid({ summary }: { summary: DashboardDto["summary"] }) {
  const total = summary.totalWorkItems.value;
  const completed = summary.completedWorkItems.value;
  const inProgress = summary.inProgressWorkItems.value;
  const blocked = summary.blockedWorkItems.value;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard
        label="Completed"
        icon={<CheckCircle2 />}
        tone="good"
        value={completed}
        suffix={`of ${total}`}
        visual={<ShareBar count={completed} total={total} fillClassName="bg-viz-done" />}
        provenance="Work items done in Jira"
      />
      <MetricCard
        label="In progress"
        icon={<CircleDot />}
        tone="accent"
        value={inProgress}
        suffix={`of ${total}`}
        visual={<ShareBar count={inProgress} total={total} fillClassName="bg-viz-in-progress" />}
        provenance="Work items in progress in Jira"
      />
      <MetricCard
        label="Blocked"
        icon={<OctagonAlert />}
        tone={blocked > 0 ? "critical" : "neutral"}
        value={blocked}
        suffix={`of ${total}`}
        visual={<ShareBar count={blocked} total={total} fillClassName="bg-status-critical" />}
        provenance="Open work items with an unresolved blocker"
        hint={summary.blockedWorkItems.description}
      />
      <EstimationCoverage summary={summary} />
      <MetricCard
        label="P0 risks"
        icon={<ShieldAlert />}
        tone={summary.p0Risks.value > 0 ? "critical" : "neutral"}
        value={summary.p0Risks.value}
        suffix={summary.p0Risks.value > 0 ? "open" : undefined}
        provenance="Open risks identified as P0"
        hint="Detected from Jira risk severity, priority, labels or the I-nn P0 naming convention."
        emphasis={summary.p0Risks.value > 0 ? "critical" : undefined}
      />
      <MetricCard
        label="P1 risks"
        icon={<TriangleAlert />}
        tone={summary.p1Risks.value > 0 ? "serious" : "neutral"}
        value={summary.p1Risks.value}
        suffix={summary.p1Risks.value > 0 ? "open" : undefined}
        provenance="Open risks identified as P1"
      />
      <MetricCard
        label="Milestones complete"
        icon={<Flag />}
        tone="accent"
        value={summary.completedMilestones.value}
        suffix={`of ${summary.totalMilestones.value}`}
        visual={<SegmentTrack filled={summary.completedMilestones.value} total={summary.totalMilestones.value} fillClassName="bg-viz-done" />}
        provenance="Committed milestones"
      />
      <MetricCard
        label="Sprints complete"
        icon={<Milestone />}
        tone="accent"
        value={summary.completedSprints.value}
        suffix={`of ${summary.totalMigrationSprints.value}`}
        visual={
          <SegmentTrack filled={summary.completedSprints.value} total={summary.totalMigrationSprints.value} fillClassName="bg-viz-done" />
        }
        provenance="Migration sprints closed in Jira"
      />
    </div>
  );
}
