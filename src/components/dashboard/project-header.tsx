import type { DashboardDto } from "@/lib/dashboard/types";
import { formatDashboardDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RefreshButton } from "./refresh-button";
import { HEALTH_DISPLAY, HealthIcon } from "./status";

/** Page title + last-synced time (from sync.timestamp) + manual refresh. */
export function ProjectHeader({
  title,
  eyebrow = "Jira Dashboard",
  description,
  sync,
  now,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  sync: DashboardDto["sync"];
  now: Date;
}) {
  const syncedAt = sync.timestamp;
  const relative = formatRelativeTime(syncedAt, now);
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex items-start gap-3">
        {relative ? (
          <p className="pt-2 text-xs text-muted-foreground">
            Last synced{" "}
            <time dateTime={syncedAt} title={formatDashboardDateTime(syncedAt) ?? undefined}>
              {relative}
            </time>
          </p>
        ) : null}
        <RefreshButton syncedAt={syncedAt} refreshIntervalSeconds={sync.refreshIntervalSeconds} />
      </div>
    </header>
  );
}

/** Deterministic project health roll-up from the backend. */
export function ProjectHealthBanner({ health }: { health: DashboardDto["projectHealth"] }) {
  const display = HEALTH_DISPLAY[health.status];
  return (
    <section
      aria-label="Project health"
      className={cn(
        "flex flex-col gap-1 rounded-xl border px-5 py-4 sm:flex-row sm:items-center sm:gap-4",
        health.status === "blocked" && "border-status-critical/40 bg-status-critical/5",
        health.status === "at_risk" && "border-status-warning/50 bg-status-warning/8",
        (health.status === "healthy" || health.status === "complete") && "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-2">
        <HealthIcon status={health.status} className="size-5" />
        <span className="text-sm text-muted-foreground">Project health</span>
        <span className="text-lg font-semibold tracking-tight">{display.label}</span>
      </div>
      {health.reasons.length > 0 ? <p className="text-sm text-muted-foreground">{health.reasons.join(" ")}</p> : null}
    </section>
  );
}
