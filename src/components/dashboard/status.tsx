import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  OctagonAlert,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type { MilestoneHealth, SprintHealth, WorkItemGroup } from "@/lib/dashboard/types";
import type { SprintState } from "@/lib/jira/types";
import { cn } from "@/lib/utils";

/**
 * Presentation maps for backend-computed states. Status color always ships with an icon and a
 * text label (never color alone); label text stays in foreground ink.
 */

type Tone = "good" | "warning" | "critical" | "accent" | "neutral" | "serious";

const TONE_ICON: Record<Tone, string> = {
  good: "text-status-good",
  warning: "text-status-warning",
  serious: "text-status-serious",
  critical: "text-status-critical",
  accent: "text-viz-series-1",
  neutral: "text-muted-foreground",
};

type Display = { label: string; icon: LucideIcon; tone: Tone };

export const HEALTH_DISPLAY: Record<SprintHealth | MilestoneHealth, Display> = {
  complete: { label: "Complete", icon: CheckCircle2, tone: "good" },
  healthy: { label: "On track", icon: CircleDot, tone: "good" },
  at_risk: { label: "At risk", icon: AlertTriangle, tone: "warning" },
  blocked: { label: "Blocked", icon: OctagonAlert, tone: "critical" },
  future: { label: "Upcoming", icon: Clock, tone: "neutral" },
};

export const SPRINT_STATE_DISPLAY: Record<SprintState, Display> = {
  closed: { label: "Complete", icon: CheckCircle2, tone: "good" },
  active: { label: "Active", icon: CircleDot, tone: "accent" },
  future: { label: "Upcoming", icon: Circle, tone: "neutral" },
};

export const GROUP_DISPLAY: Record<WorkItemGroup, Display> = {
  blocked: { label: "Blocked", icon: OctagonAlert, tone: "critical" },
  in_progress: { label: "In progress", icon: CircleDot, tone: "accent" },
  todo: { label: "To do", icon: Circle, tone: "neutral" },
  done: { label: "Done", icon: CheckCircle2, tone: "good" },
  unknown: { label: "Other status", icon: Circle, tone: "neutral" },
};

const SEVERITY_DISPLAY: Record<"P0" | "P1", Display> = {
  P0: { label: "P0", icon: ShieldAlert, tone: "critical" },
  P1: { label: "P1", icon: AlertTriangle, tone: "serious" },
};

function StatusPill({ display, className, label }: { display: Display; className?: string; label?: string }) {
  const Icon = display.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 text-xs font-medium whitespace-nowrap text-foreground",
        className,
      )}
    >
      <Icon aria-hidden className={cn("size-3.5", TONE_ICON[display.tone])} />
      {label ?? display.label}
    </span>
  );
}

export function HealthBadge({ status, className }: { status: SprintHealth | MilestoneHealth; className?: string }) {
  return <StatusPill display={HEALTH_DISPLAY[status]} className={className} />;
}

export function SprintStateBadge({ state, className }: { state: SprintState; className?: string }) {
  return <StatusPill display={SPRINT_STATE_DISPLAY[state]} className={className} />;
}

export function GroupBadge({ group, className }: { group: WorkItemGroup; className?: string }) {
  return <StatusPill display={GROUP_DISPLAY[group]} className={className} />;
}

/** P0 is visibly stronger than P1 (filled tint + bold). */
export function SeverityBadge({ severity, className }: { severity: "P0" | "P1"; className?: string }) {
  const display = SEVERITY_DISPLAY[severity];
  const Icon = display.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs whitespace-nowrap",
        severity === "P0"
          ? "bg-status-critical/12 font-semibold text-status-critical-text ring-1 ring-status-critical/30"
          : "border border-border font-medium text-foreground",
        className,
      )}
    >
      <Icon aria-hidden className={cn("size-3.5", TONE_ICON[display.tone])} />
      {display.label}
    </span>
  );
}

export function HealthIcon({ status, className }: { status: SprintHealth | MilestoneHealth; className?: string }) {
  const display = HEALTH_DISPLAY[status];
  const Icon = display.icon;
  return <Icon aria-hidden className={cn("size-4", TONE_ICON[display.tone], className)} />;
}

/** Accessible progress bar; `value` is the backend-rounded percentage. */
export function Meter({
  value,
  label,
  className,
  size = "md",
}: {
  value: number;
  label: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={cn(
        "w-full overflow-hidden rounded-full bg-viz-track",
        size === "sm" ? "h-1.5" : size === "lg" ? "h-3" : "h-2",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full", value >= 100 ? "bg-status-good" : "bg-viz-series-1")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
