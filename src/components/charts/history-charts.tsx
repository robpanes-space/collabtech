"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProjectTrendPoint, ThroughputPoint } from "@/lib/history/types";
import { AXIS_PROPS, CHART_COLORS, ChartFigure, ChartTooltipBox, CURSOR_FILL, percentTick } from "./chart-kit";

/** Project progress over time (0–100%) of the current committed scope, from status history. */
export function ProjectProgressTrend({ points }: { points: readonly ProjectTrendPoint[] }) {
  const height = 220;
  return (
    <ChartFigure
      label="Project progress over time"
      height={height}
      summary={points.map((p) => `${p.label}: ${p.progress}% (${p.completed} of ${p.total} work items)`)}
    >
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height }}>
        <AreaChart data={[...points]} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={16} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={percentTick} {...AXIS_PROPS} />
          <Tooltip
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as ProjectTrendPoint | undefined) : undefined;
              if (!point) return null;
              return (
                <ChartTooltipBox
                  title={point.label}
                  rows={[
                    { label: "Progress", value: `${point.progress}%` },
                    { label: "Completed", value: point.completed },
                    { label: "Total scope", value: point.total },
                  ]}
                />
              );
            }}
          />
          {/* Soft area under the line: one series, flat low-opacity fill (no gradient). */}
          <Area
            type="linear"
            dataKey="progress"
            name="Progress"
            fill={CHART_COLORS.series1}
            fillOpacity={0.1}
            stroke={CHART_COLORS.series1}
            strokeWidth={2}
            dot={points.length <= 31 ? { r: 2.5, strokeWidth: 0, fill: CHART_COLORS.series1 } : false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

/** Completed work items per week (actual transitions to done). */
export function ThroughputChart({ points }: { points: readonly ThroughputPoint[] }) {
  const height = 200;
  return (
    <ChartFigure label="Weekly throughput" height={height} summary={points.map((p) => `${p.label}: ${p.completed} completed`)}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height }}>
        <BarChart data={[...points]} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="periodStart" {...AXIS_PROPS} tickFormatter={(_, index) => points[index]?.label.split(" – ")[0] ?? ""} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Tooltip
            cursor={CURSOR_FILL}
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as ThroughputPoint | undefined) : undefined;
              if (!point) return null;
              return <ChartTooltipBox title={point.label} rows={[{ label: "Completed", value: point.completed }]} />;
            }}
          />
          <Bar dataKey="completed" name="Completed" fill={CHART_COLORS.series1} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
