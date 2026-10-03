import { AlertTriangle, CheckCircle2, ChevronRight, CircleMinus, OctagonAlert, type LucideIcon } from "lucide-react";
import { JiraLink } from "@/components/dashboard/jira-link";
import { Section } from "@/components/dashboard/primitives";
import { formatDashboardDateTime } from "@/lib/format";
import type {
  BurndownReadinessState,
  CheckStatus,
  OverallReadiness,
  ProjectReadinessDto,
  ReadinessCheck,
  SprintBurndownReadiness,
} from "@/lib/readiness/types";
import { cn } from "@/lib/utils";

/** Admin data-readiness view (presentation only; all logic lives in src/lib/readiness). */

const STATUS_DISPLAY: Record<CheckStatus, { label: string; icon: LucideIcon; className: string }> = {
  pass: { label: "Pass", icon: CheckCircle2, className: "text-status-good" },
  warning: { label: "Needs attention", icon: AlertTriangle, className: "text-status-warning" },
  fail: { label: "Failing", icon: OctagonAlert, className: "text-status-critical" },
  not_applicable: { label: "Not yet applicable", icon: CircleMinus, className: "text-muted-foreground" },
};

const OVERALL_DISPLAY: Record<OverallReadiness, { label: string; icon: LucideIcon; className: string; panel: string }> = {
  ready: { label: "Ready", icon: CheckCircle2, className: "text-status-good", panel: "border-border bg-card" },
  attention: { label: "Attention", icon: AlertTriangle, className: "text-status-warning", panel: "border-status-warning/50 bg-status-warning/8" },
  blocked: { label: "Blocked", icon: OctagonAlert, className: "text-status-critical", panel: "border-status-critical/40 bg-status-critical/5" },
};

const BURNDOWN_LABEL: Record<BurndownReadinessState, { label: string; status: CheckStatus }> = {
  available: { label: "Available", status: "pass" },
  waiting_for_start: { label: "Waiting for start", status: "not_applicable" },
  missing_dates: { label: "Missing dates", status: "warning" },
  insufficient_history: { label: "Insufficient history", status: "not_applicable" },
  low_confidence: { label: "Low confidence", status: "fail" },
};

function StatusIcon({ status, className }: { status: CheckStatus; className?: string }) {
  const display = STATUS_DISPLAY[status];
  const Icon = display.icon;
  return <Icon aria-hidden className={cn("size-4 shrink-0", display.className, className)} />;
}

export function ReadinessOverview({ readiness }: { readiness: ProjectReadinessDto }) {
  const overall = OVERALL_DISPLAY[readiness.overall.status];
  const Icon = overall.icon;
  const { counts } = readiness.overall;
  return (
    <section aria-label="Overall readiness" className={cn("flex flex-col gap-3 rounded-xl border px-5 py-4", overall.panel)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Icon aria-hidden className={cn("size-5", overall.className)} />
        <span className="text-sm text-muted-foreground">Overall</span>
        <span className="text-lg font-semibold tracking-tight">{overall.label}</span>
        <span className="text-sm text-muted-foreground">{readiness.overall.summary}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {counts.pass} passing · {counts.warning} need attention · {counts.fail} failing · {counts.not_applicable} not yet applicable
        (informational checks excluded) · Checked {formatDashboardDateTime(readiness.generatedAt)}
      </p>
    </section>
  );
}

export function ReadinessFactsGrid({ facts }: { facts: ProjectReadinessDto["facts"] }) {
  const rows: [string, string][] = [
    ["Active Jira sprints", facts.activeSprints.join(", ") || "None"],
    ["Active migration sprint", facts.activeMigrationSprints.join(", ") || "None"],
    ["Empty active sprints", facts.emptyActiveSprints.join(", ") || "None"],
    ["Migration sprints scheduled", `${facts.migrationSprintsScheduled} / ${facts.migrationSprintsTotal}`],
    ["Story-point coverage", `${facts.estimationCoverage ?? "—"}% (${facts.estimatedWorkItems} / ${facts.eligibleWorkItems})`],
    ["Progress method", facts.progressMethod === "storyPoints" ? "Story points" : "Work items"],
    ["Committed work items", String(facts.includedWorkItems)],
    ["Excluded by label", String(facts.excludedWorkItems)],
    ["Without milestone", String(facts.unclassifiedWorkItems)],
    ["Open P0 / P1 risks", `${facts.openP0Risks} / ${facts.openP1Risks}`],
    [
      "Blocked work items",
      `${facts.blockedWorkItems} (links ${facts.linkBlockedWorkItems}, status ${facts.blockedStatusesConfigured.length > 0 ? facts.statusBlockedWorkItems : "off"})`,
    ],
    ["Change history", facts.historyAvailable ? "Loaded" : "Unavailable"],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CheckRow({ check }: { check: ReadinessCheck }) {
  return (
    <li className="flex gap-3 px-4 py-4" data-code={check.code} data-status={check.status}>
      <StatusIcon status={check.status} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold">{check.title}</h3>
          <span className="text-xs text-muted-foreground">
            {STATUS_DISPLAY[check.status].label}
            {check.importance === "informational" ? " · informational" : ""}
          </span>
        </div>
        <p className="mt-1 text-sm break-words">{check.message}</p>
        {check.action ? (
          <p className="mt-2 text-sm break-words text-muted-foreground">
            <span className="font-medium text-foreground">Recommended action: </span>
            {check.action}
          </p>
        ) : null}
        {check.items.length > 0 ? (
          <details className="group mt-2">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
              {check.items.length} item{check.items.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-2 flex flex-col gap-1 border-l border-border pl-3 text-sm">
              {check.items.map((item) => (
                <li key={item.key} className="break-words">
                  <JiraLink issueKey={item.key} url={item.jiraUrl} className="text-muted-foreground" /> {item.summary}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </li>
  );
}

export function ReadinessSections({ sections }: { sections: ProjectReadinessDto["sections"] }) {
  return (
    <>
      {sections.map((section) => (
        <Section key={section.category} id={`readiness-${section.category}`} title={section.title}>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {section.checks.map((check) => (
              <CheckRow key={check.code} check={check} />
            ))}
          </ul>
        </Section>
      ))}
    </>
  );
}

export function BurndownReadinessList({ sprints }: { sprints: readonly SprintBurndownReadiness[] }) {
  if (sprints.length === 0) {
    return <p className="text-sm text-muted-foreground">No migration sprint history is available.</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {sprints.map((sprint) => {
        const display = BURNDOWN_LABEL[sprint.state];
        return (
          <li key={sprint.sprintId} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium sm:w-64">
              <StatusIcon status={display.status} />
              <span className="truncate">{sprint.name}</span>
            </span>
            <span className="text-xs font-medium sm:w-36">
              {display.label}
              {sprint.confidence ? ` · ${sprint.confidence} confidence` : ""}
            </span>
            <span className="min-w-0 flex-1 text-sm break-words text-muted-foreground">{sprint.message}</span>
          </li>
        );
      })}
    </ul>
  );
}
