import { CheckCircle2, CircleDot, Flag, OctagonAlert, ShieldAlert, TriangleAlert } from "lucide-react";
import type { DashboardDto } from "@/lib/dashboard/types";
import { EstimationCoverage } from "./estimation-coverage";
import { MetricCard } from "./metric-card";

/** Primary KPI row: 4 columns desktop, 2 tablet/mobile. Values come straight from the DTO. */
export function MetricsGrid({ summary }: { summary: DashboardDto["summary"] }) {
  const total = summary.totalWorkItems.value;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard
        label="Completed"
        icon={<CheckCircle2 aria-hidden className="size-4 text-status-good" />}
        value={summary.completedWorkItems.value}
        suffix={`of ${total}`}
        provenance="Work items done in Jira"
      />
      <MetricCard
        label="In progress"
        icon={<CircleDot aria-hidden className="size-4 text-viz-series-1" />}
        value={summary.inProgressWorkItems.value}
        suffix={`of ${total}`}
        provenance="Work items in progress in Jira"
      />
      <MetricCard
        label="Blocked"
        icon={<OctagonAlert aria-hidden className="size-4 text-status-critical" />}
        value={summary.blockedWorkItems.value}
        provenance="Open work items with an unresolved blocker"
        hint={summary.blockedWorkItems.description}
      />
      <EstimationCoverage summary={summary} />
      <MetricCard
        label="P0 risks"
        icon={<ShieldAlert aria-hidden className="size-4 text-status-critical" />}
        value={summary.p0Risks.value}
        provenance="Open risks identified as P0"
        hint="Detected from Jira risk severity, priority, labels or the I-nn P0 naming convention."
        emphasis={summary.p0Risks.value > 0 ? "critical" : undefined}
      />
      <MetricCard
        label="P1 risks"
        icon={<TriangleAlert aria-hidden className="size-4 text-status-serious" />}
        value={summary.p1Risks.value}
        provenance="Open risks identified as P1"
      />
      <MetricCard
        label="Milestones complete"
        icon={<Flag aria-hidden className="size-4 text-muted-foreground" />}
        value={summary.completedMilestones.value}
        suffix={`of ${summary.totalMilestones.value}`}
        provenance="Committed milestones"
      />
      <MetricCard
        label="Sprints complete"
        icon={<CheckCircle2 aria-hidden className="size-4 text-muted-foreground" />}
        value={summary.completedSprints.value}
        suffix={`of ${summary.totalMigrationSprints.value}`}
        provenance="Migration sprints closed in Jira"
      />
    </div>
  );
}
