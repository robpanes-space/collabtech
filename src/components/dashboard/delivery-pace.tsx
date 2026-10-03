import { DeliveryPaceChart, type PacePoint } from "@/components/charts/delivery-pace-chart";
import type { DashboardDto } from "@/lib/dashboard/types";
import { EmptyState } from "./primitives";

/**
 * Story-point velocity only when the backend marks it available; otherwise work-item
 * throughput when closed migration sprints exist; otherwise an explicit empty state.
 * Never draws an empty or substituted story-point chart.
 */
export function DeliveryPace({ charts }: { charts: DashboardDto["charts"] }) {
  const label = (position: number | null, sprint: string) => (position === null ? sprint : `S${position}`);

  if (charts.velocity.available) {
    const points: PacePoint[] = charts.velocity.points
      .filter((p) => p.available)
      .map((p) => ({
        sprint: p.sprint,
        label: label(p.roadmapPosition, p.sprint),
        committed: p.committedStoryPoints ?? 0,
        completed: p.completedStoryPoints ?? 0,
      }));
    return <DeliveryPaceChart title="Story-point velocity" unit="story points" points={points} />;
  }

  if (charts.throughput.length > 0) {
    const points: PacePoint[] = charts.throughput.map((p) => ({
      sprint: p.sprint,
      label: label(p.roadmapPosition, p.sprint),
      committed: p.committedWorkItems,
      completed: p.completedWorkItems,
    }));
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Work-item throughput (story-point velocity needs fully estimated sprints).</p>
        <DeliveryPaceChart title="Work-item throughput" unit="work items" points={points} />
      </div>
    );
  }

  return (
    <EmptyState title="No velocity data yet">
      Delivery pace appears after the first migration sprint is closed in Jira.
    </EmptyState>
  );
}
