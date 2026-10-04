import type { ReactNode } from "react";
import type { MetricValue } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";
import { IconChip } from "./kpi-visuals";
import { InfoHint } from "./primitives";

/**
 * KPI tile. The provenance line (from MetricValue.description or `provenance`) is always
 * visible; the optional hint adds detail on hover/focus only.
 */
export function MetricCard({
  label,
  value,
  suffix,
  provenance,
  hint,
  icon,
  tone = "neutral",
  visual,
  emphasis,
  className,
}: {
  label: string;
  value: ReactNode;
  suffix?: ReactNode;
  provenance?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Icon chip tint; status tones always ship with the label text. */
  tone?: Parameters<typeof IconChip>[0]["tone"];
  /** Optional decorative mini visual (meter, segments) drawn from the same DTO values. */
  visual?: ReactNode;
  emphasis?: "critical" | "serious";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/15",
        emphasis === "critical" && "border-status-critical/40 bg-status-critical/[0.04] hover:border-status-critical/60",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon ? <IconChip tone={tone}>{icon}</IconChip> : null}
        <span className="min-w-0 leading-tight">{label}</span>
        {hint ? <InfoHint label={`About ${label}`}>{hint}</InfoHint> : null}
      </div>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
        {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
      {visual ? <div className="mt-0.5">{visual}</div> : null}
      {provenance ? <p className="text-xs text-muted-foreground">{provenance}</p> : null}
    </div>
  );
}

/** Convenience: a MetricCard driven directly by a backend MetricValue. */
export function MetricValueCard({
  metric,
  label,
  ...rest
}: { metric: MetricValue; label?: string } & Omit<Parameters<typeof MetricCard>[0], "label" | "value" | "provenance">) {
  return <MetricCard label={label ?? metric.label} value={metric.value} provenance={metric.description} {...rest} />;
}

/** "Based on story points" / "Based on work items" — the short visible provenance. */
export function progressSourceLabel(source: MetricValue["source"]): string {
  return source === "storyPoints" ? "Based on story points" : "Based on work items";
}
