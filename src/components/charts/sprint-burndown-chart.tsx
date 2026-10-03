"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BurndownPoint } from "@/lib/history/types";
import { cn } from "@/lib/utils";
import { AXIS_PROPS, CHART_COLORS, ChartFigure, ChartTooltipBox } from "./chart-kit";

type Unit = "workItems" | "storyPoints";

/**
 * Reconstructed sprint burndown: "Remaining" (Jira history) + "Ideal" (mathematical reference,
 * fixed at the start commitment). Future days have no Remaining value (nothing is projected).
 * The Story points view exists only when the backend marks story-point history complete.
 */
export function SprintBurndownChart({ points, storyPointsAvailable }: { points: readonly BurndownPoint[]; storyPointsAvailable: boolean }) {
  const [unit, setUnit] = useState<Unit>("workItems");
  const active: Unit = storyPointsAvailable ? unit : "workItems";
  const unitLabel = active === "workItems" ? "work items" : "story points";
  const data = points.map((p) => ({
    ...p,
    remaining: active === "workItems" ? p.remainingWorkItems : p.remainingStoryPoints,
    completed: active === "workItems" ? p.completedWorkItems : p.completedStoryPoints,
    ideal: active === "workItems" ? p.idealWorkItems : p.idealStoryPoints,
  }));
  const recorded = data.filter((p) => p.remaining !== null);
  const height = 240;

  return (
    <div className="flex flex-col gap-3">
      {storyPointsAvailable ? (
        <div role="group" aria-label="Burndown unit" className="flex gap-1.5">
          {(["workItems", "storyPoints"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={active === option}
              onClick={() => setUnit(option)}
              className={cn(
                "h-7 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active === option && "border-foreground bg-foreground text-background hover:bg-foreground/90",
              )}
            >
              {option === "workItems" ? "Work items" : "Story points"}
            </button>
          ))}
        </div>
      ) : null}
      <ChartFigure
        label={`Sprint burndown (${unitLabel})`}
        height={height}
        summary={recorded.map((p) => `${p.label}: ${p.remaining} ${unitLabel} remaining, ideal ${p.ideal}`)}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height }}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={16} />
            <YAxis allowDecimals={false} {...AXIS_PROPS} />
            <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 12 }} />
            <Tooltip
              content={({ active: isActive, payload }) => {
                const point = isActive ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
                if (!point) return null;
                return (
                  <ChartTooltipBox
                    title={point.label}
                    rows={[
                      { label: "Remaining", value: point.remaining ?? "Not yet" },
                      { label: "Completed", value: point.completed ?? "—" },
                      ...(active === "workItems" ? [{ label: "In sprint", value: point.scopeWorkItems ?? "—" }] : []),
                      { label: "Ideal", value: point.ideal ?? "—" },
                    ]}
                  />
                );
              }}
            />
            <Line
              type="linear"
              dataKey="ideal"
              name="Ideal"
              stroke={CHART_COLORS.muted}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="remaining"
              name="Remaining"
              stroke={CHART_COLORS.series1}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.series1 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartFigure>
    </div>
  );
}
