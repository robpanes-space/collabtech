"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { StatusDistributionPoint } from "@/lib/dashboard/types";
import { CHART_COLORS, ChartFigure, ChartTooltipBox } from "./chart-kit";

const SLICE_COLOR: Record<StatusDistributionPoint["key"], string> = {
  done: CHART_COLORS.done,
  in_progress: CHART_COLORS.inProgress,
  todo: CHART_COLORS.todo,
  unknown: CHART_COLORS.unknown,
};

/**
 * Part-to-whole of work items by status (Done / In Progress / To Do [/ Unknown]).
 * Blocked is not a slice — it is shown separately by the caller. The legend carries labels
 * and counts so identity never relies on color.
 */
export function StatusDistributionChart({
  points,
  total,
}: {
  points: readonly StatusDistributionPoint[];
  total: number;
}) {
  const height = 200;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative w-full max-w-[220px] shrink-0">
        <ChartFigure
          label="Work item status distribution"
          height={height}
          summary={points.map((p) => `${p.status}: ${p.count} of ${total}`)}
        >
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 220, height }}>
            <PieChart>
              <Pie
                data={[...points]}
                dataKey="count"
                nameKey="status"
                innerRadius="62%"
                outerRadius="92%"
                stroke={CHART_COLORS.surface}
                strokeWidth={2}
                isAnimationActive={false}
              >
                {points.map((point) => (
                  <Cell key={point.key} fill={SLICE_COLOR[point.key]} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  const point = active ? (payload?.[0]?.payload as StatusDistributionPoint | undefined) : undefined;
                  if (!point) return null;
                  return <ChartTooltipBox title={point.status} rows={[{ label: "Work items", value: `${point.count} of ${total}` }]} />;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartFigure>
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{total}</span>
          <span className="text-xs text-muted-foreground">work items</span>
        </div>
      </div>
      <ul className="flex w-full flex-col gap-2 text-sm" aria-label="Status legend">
        {points.map((point) => (
          <li key={point.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 rounded-sm" style={{ background: SLICE_COLOR[point.key] }} />
              {point.status}
            </span>
            <span className="font-medium tabular-nums">{point.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
