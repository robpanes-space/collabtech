import type { ReactNode } from "react";

/**
 * Shared chart styling (one place): recessive axes/grid, theme-token colors, tooltip shell,
 * and an accessible <figure> wrapper with a text summary for screen readers.
 */

export const CHART_COLORS = {
  series1: "var(--viz-series-1)",
  good: "var(--status-good)",
  done: "var(--viz-done)",
  inProgress: "var(--viz-in-progress)",
  todo: "var(--viz-todo)",
  unknown: "var(--viz-unknown)",
  grid: "var(--viz-grid)",
  track: "var(--viz-track)",
  surface: "var(--card)",
  muted: "var(--muted-foreground)",
  text: "var(--foreground)",
} as const;

export const AXIS_TICK = { fill: CHART_COLORS.muted, fontSize: 12 } as const;
export const AXIS_PROPS = { tickLine: false, axisLine: false, tick: AXIS_TICK } as const;
export const GRID_PROPS = { stroke: CHART_COLORS.grid, strokeDasharray: "0", vertical: true, horizontal: false } as const;
export const CURSOR_FILL = { fill: "var(--muted)", opacity: 0.6 } as const;

export const percentTick = (value: number) => `${value}%`;

/** Tooltip shell used by every chart's custom tooltip content. */
export function ChartTooltipBox({ title, rows }: { title: string; rows: { label: string; value: ReactNode }[] }) {
  return (
    <div className="min-w-40 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      <p className="mb-1 font-medium">{title}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-right tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Figure with an accessible text interpretation of the chart. */
export function ChartFigure({
  label,
  summary,
  children,
  height,
}: {
  label: string;
  summary: string[];
  children: ReactNode;
  height: number;
}) {
  return (
    <figure className="m-0 min-w-0">
      <div role="img" aria-label={label} className="w-full min-w-0 overflow-hidden" style={{ height }}>
        {children}
      </div>
      <figcaption className="sr-only">
        {label}:{" "}
        <ul>
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
