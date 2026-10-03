"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WorkloadEntry } from "@/lib/dashboard/types";
import { AXIS_PROPS, CHART_COLORS, ChartFigure, ChartTooltipBox, CURSOR_FILL, GRID_PROPS } from "./chart-kit";

/** Open work items per assignee (incl. Unassigned). Display names only — no emails. */
export function WorkloadChart({ entries }: { entries: readonly WorkloadEntry[] }) {
  const data = entries.map((entry) => ({ ...entry, name: entry.displayName }));
  const height = Math.max(120, data.length * 36 + 36);

  return (
    <ChartFigure
      label="Open work items by assignee"
      height={height}
      summary={entries.map(
        (e) => `${e.displayName}: ${e.openWorkItems} open, ${e.inProgressWorkItems} in progress, ${e.blockedWorkItems} blocked`,
      )}
    >
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height }}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }} barCategoryGap={8}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis type="number" allowDecimals={false} {...AXIS_PROPS} />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            {...AXIS_PROPS}
            tickFormatter={(name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name)}
          />
          <Tooltip
            cursor={CURSOR_FILL}
            content={({ active, payload }) => {
              const entry = active ? (payload?.[0]?.payload as WorkloadEntry | undefined) : undefined;
              if (!entry) return null;
              return (
                <ChartTooltipBox
                  title={entry.displayName}
                  rows={[
                    { label: "Open", value: entry.openWorkItems },
                    { label: "In progress", value: entry.inProgressWorkItems },
                    { label: "Blocked", value: entry.blockedWorkItems },
                    { label: "Open story points", value: entry.storyPointsOpen ?? "Not estimated" },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="openWorkItems" fill={CHART_COLORS.series1} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            <LabelList dataKey="openWorkItems" position="right" fill={CHART_COLORS.text} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
