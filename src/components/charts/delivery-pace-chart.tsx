"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_PROPS, CHART_COLORS, ChartFigure, ChartTooltipBox, CURSOR_FILL } from "./chart-kit";

export type PacePoint = { sprint: string; label: string; committed: number; completed: number };

/**
 * Committed vs completed per closed sprint — used for story-point velocity (when available)
 * or work-item throughput. Two series → legend always shown.
 */
export function DeliveryPaceChart({ title, unit, points }: { title: string; unit: string; points: readonly PacePoint[] }) {
  const height = 220;
  return (
    <ChartFigure
      label={title}
      height={height}
      summary={points.map((p) => `${p.sprint}: ${p.completed} of ${p.committed} ${unit} completed`)}
    >
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height }}>
        <BarChart data={[...points]} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barGap={2}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="label" {...AXIS_PROPS} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          <Tooltip
            cursor={CURSOR_FILL}
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as PacePoint | undefined) : undefined;
              if (!point) return null;
              return (
                <ChartTooltipBox
                  title={point.sprint}
                  rows={[
                    { label: `Committed ${unit}`, value: point.committed },
                    { label: `Completed ${unit}`, value: point.completed },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="committed" name="Committed" fill={CHART_COLORS.todo} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Bar dataKey="completed" name="Completed" fill={CHART_COLORS.done} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
