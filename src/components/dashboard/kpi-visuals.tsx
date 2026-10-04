import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small KPI visuals. Purely presentational: every value is a backend-computed percentage or a
 * raw Jira count from the DTO. Composition/segment geometry uses counts directly (flex-grow,
 * segment index) — no percentages are derived here.
 */

/** Radial gauge for a backend-rounded 0–100 percentage. Decorative: pair with visible text. */
export function ProgressRing({
  value,
  size = 132,
  stroke = 12,
  className,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: ReactNode;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - stroke) / 2;
  const center = size / 2;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} className="stroke-viz-track" />
        {clamped > 0 ? (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${clamped} 100`}
            className={clamped >= 100 ? "stroke-status-good" : "stroke-viz-series-1"}
          />
        ) : null}
      </svg>
      {children ? <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div> : null}
    </div>
  );
}

export type CompositionSegment = { key: string; label: string; count: number; className: string };

/**
 * Part-to-whole bar sized by raw counts (flex-grow), with a 2px surface gap between segments.
 * The legend below carries labels + counts so identity never relies on color.
 */
export function CompositionBar({
  segments,
  label,
  legend = true,
  className,
}: {
  segments: readonly CompositionSegment[];
  label: string;
  legend?: boolean;
  className?: string;
}) {
  const visible = segments.filter((segment) => segment.count > 0);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div aria-hidden className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-viz-track">
        {visible.map((segment) => (
          <div key={segment.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", segment.className)} style={{ flexGrow: segment.count }} />
        ))}
      </div>
      {legend ? (
        <ul aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2 rounded-sm", segment.className)} />
              {segment.label}
              <span className="font-medium text-foreground tabular-nums">{segment.count}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** "N of M" drawn as M segments with the first N filled. Falls back to nothing for large M. */
export function SegmentTrack({
  filled,
  total,
  className,
  fillClassName = "bg-viz-series-1",
}: {
  filled: number;
  total: number;
  className?: string;
  fillClassName?: string;
}) {
  if (total <= 0 || total > 24) return null;
  return (
    <div aria-hidden className={cn("flex h-1.5 w-full gap-1", className)}>
      {Array.from({ length: total }, (_, index) => (
        <div key={index} className={cn("h-full flex-1 rounded-full", index < filled ? fillClassName : "bg-viz-track")} />
      ))}
    </div>
  );
}

/** Tinted rounded square behind a KPI icon. Tone maps to existing status/viz tokens. */
export function IconChip({
  tone,
  children,
}: {
  tone: "good" | "accent" | "critical" | "serious" | "neutral";
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4",
        tone === "good" && "bg-status-good/12 text-status-good",
        tone === "accent" && "bg-viz-series-1/12 text-viz-series-1",
        tone === "critical" && "bg-status-critical/12 text-status-critical",
        tone === "serious" && "bg-status-serious/15 text-status-serious",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** Thin bar showing `count` against `total` (both raw counts) — geometry only, no percentage. */
export function ShareBar({ count, total, fillClassName }: { count: number; total: number; fillClassName: string }) {
  if (total <= 0) return null;
  return (
    <div aria-hidden className="flex h-1.5 w-full overflow-hidden rounded-full bg-viz-track">
      {count > 0 ? <div className={cn("h-full rounded-full", fillClassName)} style={{ flexGrow: count }} /> : null}
      <div style={{ flexGrow: Math.max(0, total - count) }} />
    </div>
  );
}
