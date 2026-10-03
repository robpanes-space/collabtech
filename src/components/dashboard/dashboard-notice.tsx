import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import type { DashboardWarning, DashboardWarningCode } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

/** Client-friendly titles for backend warning codes (codes stay in data-code only). */
const TITLES: Record<DashboardWarningCode, string> = {
  STORY_POINTS_INCOMPLETE: "Story-point estimation incomplete",
  NO_STORY_POINTS_FIELD: "Story points not configured",
  NO_ACTIVE_SPRINT: "No active sprint",
  MULTIPLE_ACTIVE_SPRINTS: "Multiple active Jira sprints",
  NO_ACTIVE_MIGRATION_SPRINT: "No migration sprint in progress",
  ACTIVE_NON_MIGRATION_SPRINT: "Active sprint is not a migration sprint",
  NO_MIGRATION_SPRINTS: "No migration sprints found",
  MISSING_SPRINT_DATES: "Sprint dates not configured",
  VELOCITY_UNAVAILABLE: "Velocity unavailable",
};

type Level = DashboardWarning["level"] | "error";

const LEVEL_STYLE: Record<Level, { icon: typeof Info; className: string; iconClass: string }> = {
  info: { icon: Info, className: "border-border bg-muted/40", iconClass: "text-viz-series-1" },
  warning: { icon: AlertTriangle, className: "border-status-warning/50 bg-status-warning/8", iconClass: "text-status-warning" },
  error: { icon: OctagonAlert, className: "border-status-critical/40 bg-status-critical/6", iconClass: "text-status-critical" },
};

export function DashboardNotice({
  level,
  title,
  children,
  code,
  className,
}: {
  level: Level;
  title: string;
  children?: React.ReactNode;
  code?: string;
  className?: string;
}) {
  const style = LEVEL_STYLE[level];
  const Icon = style.icon;
  return (
    <div
      role={level === "error" ? "alert" : "status"}
      data-code={code}
      className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", style.className, className)}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", style.iconClass)} />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {children ? <div className="mt-0.5 text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}

export function warningTitle(code: DashboardWarningCode): string {
  return TITLES[code];
}

/** Renders backend warnings, optionally skipping codes shown elsewhere on the page. */
export function DashboardWarnings({
  warnings,
  exclude = [],
}: {
  warnings: readonly DashboardWarning[];
  exclude?: readonly DashboardWarningCode[];
}) {
  const visible = warnings.filter((warning) => !exclude.includes(warning.code));
  if (visible.length === 0) return null;
  return (
    <ul className="grid gap-2 md:grid-cols-2" aria-label="Data notes">
      {visible.map((warning, index) => (
        <li key={`${warning.code}-${index}`}>
          <DashboardNotice level={warning.level} title={warningTitle(warning.code)} code={warning.code} className="h-full">
            {warning.message}
          </DashboardNotice>
        </li>
      ))}
    </ul>
  );
}
