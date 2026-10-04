"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SprintProgressPoint } from "@/lib/dashboard/types";
import { HEALTH_DISPLAY } from "@/components/dashboard/status";
import { AXIS_PROPS, CHART_COLORS, ChartFigure, ChartTooltipBox, CURSOR_FILL, GRID_PROPS, percentTick } from "./chart-kit";

/** One horizontal bar per migration sprint, 0–100%, in roadmap order. Single series → no legend. */
export function SprintProgressChart({ points }: { points: readonly SprintProgressPoint[] }) {
  // `track` is bar geometry (the unfilled part of a 0–100 bar), not a metric.
  const data = points.map((point) => ({ ...point, label: `S${point.roadmapPosition ?? "?"} · ${point.shortName}`, track: 100 - point.progress }));
  const height = Math.max(160, data.length * 34 + 36);

  return (
    <ChartFigure
      label="Sprint progress chart"
      height={height}
      summary={points.map((p) => `${p.sprint}: ${p.progress}% (${p.completedWorkItems} of ${p.totalWorkItems} work items)`)}
    >
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height }}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }} barCategoryGap={8}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={percentTick} {...AXIS_PROPS} />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            {...AXIS_PROPS}
            tickFormatter={(label: string) => (label.length > 18 ? `${label.slice(0, 17)}…` : label)}
          />
          <Tooltip
            cursor={CURSOR_FILL}
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
              if (!point) return null;
              return (
                <ChartTooltipBox
                  title={point.sprint}
                  rows={[
                    { label: "Progress", value: `${point.progress}%` },
                    { label: "Completed", value: `${point.completedWorkItems} / ${point.totalWorkItems}` },
                    { label: "Health", value: HEALTH_DISPLAY[point.health].label },
                  ]}
                />
              );
            }}
          />
          {/* Completed share + the remaining track (visual only), stacked so 0% rows still render. */}
          <Bar dataKey="progress" stackId="sprint" maxBarSize={18} isAnimationActive={false}>
            {/* Same rule as <Meter>: a finished sprint reads as complete (green); label + tooltip carry it too. */}
            {data.map((point) => (
              <Cell key={point.sprintId} fill={point.progress >= 100 ? CHART_COLORS.good : CHART_COLORS.series1} />
            ))}
          </Bar>
          <Bar
            dataKey="track"
            stackId="sprint"
            fill={CHART_COLORS.track}
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="progress"
              content={({ x, y, width, height, value }) => (
                <text
                  x={Number(x ?? 0) + Number(width ?? 0) + 8}
                  y={Number(y ?? 0) + Number(height ?? 0) / 2}
                  dominantBaseline="central"
                  fill={CHART_COLORS.text}
                  fontSize={12}
                >
                  {`${value ?? 0}%`}
                </text>
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
