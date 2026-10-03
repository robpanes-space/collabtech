"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { filterRisks, sortRisksForRegister, type RiskFilter } from "@/lib/dashboard/selectors";
import type { RiskDashboardDto } from "@/lib/dashboard/types";
import { EmptyState } from "@/components/dashboard/primitives";
import { JiraLink } from "@/components/dashboard/jira-link";
import { SeverityBadge } from "@/components/dashboard/status";
import { cn } from "@/lib/utils";

const FILTERS: { value: RiskFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "P0", label: "P0" },
  { value: "P1", label: "P1" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
];

/** Client-side filtering over the already-loaded DTO (no extra requests). */
export function RiskRegister({ risks }: { risks: readonly RiskDashboardDto[] }) {
  const [filter, setFilter] = useState<RiskFilter>("all");
  const visible = sortRisksForRegister(filterRisks(risks, filter));

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Filter risks" className="flex flex-wrap gap-1.5">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              "h-8 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              filter === option.value && "border-foreground bg-foreground text-background hover:bg-foreground/90",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        Showing {visible.length} of {risks.length} risks
      </p>
      <RiskList risks={visible} />
    </div>
  );
}

export function RiskList({ risks }: { risks: readonly RiskDashboardDto[] }) {
  if (risks.length === 0) {
    return <EmptyState title="No risks">No P0 or P1 risks match this view.</EmptyState>;
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {risks.map((risk) => (
        <RiskCard key={risk.key} risk={risk} />
      ))}
    </ul>
  );
}

export function RiskCard({ risk }: { risk: RiskDashboardDto }) {
  return (
    <li
      className={cn(
        "flex flex-col gap-3 border-l-2 border-l-transparent px-4 py-4 md:grid md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-6",
        risk.severity === "P0" && !risk.resolved && "border-l-2 border-l-status-critical",
      )}
    >
      <div className="flex items-center gap-2 md:flex-col md:items-start">
        <span className="text-sm font-semibold tabular-nums">{risk.registerId ?? risk.key}</span>
        <SeverityBadge severity={risk.severity} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium break-words">{risk.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <JiraLink issueKey={risk.key} url={risk.jiraUrl} />
          <span>·</span>
          {risk.resolved ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 aria-hidden className="size-3.5 text-status-good" /> Resolved
            </span>
          ) : (
            <span>{risk.status}</span>
          )}
          {risk.owner ? <span>· {risk.owner}</span> : null}
        </p>
      </div>
      <div className="min-w-0 text-sm">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Blocks</p>
        {risk.blocks.length === 0 ? (
          <p className="mt-1 text-muted-foreground">No open work items</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5">
            {risk.blocks.map((item) => (
              <li key={item.key} className="break-words">
                {item.summary ?? item.key}
                <span className="text-muted-foreground">
                  {" "}
                  · <JiraLink issueKey={item.key} url={item.jiraUrl} />
                  {item.milestoneLabel ? ` · ${item.milestoneLabel}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
