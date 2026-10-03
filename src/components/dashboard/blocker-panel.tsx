import { OctagonAlert } from "lucide-react";
import type { BlockedWorkItemDto } from "@/lib/dashboard/types";
import { JiraLink } from "./jira-link";
import { EmptyState } from "./primitives";
import { SeverityBadge } from "./status";

/** Blocked work items exactly as the backend lists them (critical first). */
export function BlockerPanel({ blockers, limit = 5 }: { blockers: readonly BlockedWorkItemDto[]; limit?: number }) {
  if (blockers.length === 0) {
    return <EmptyState title="No blocked work">No open work item has an unresolved blocker in Jira.</EmptyState>;
  }
  const shown = blockers.slice(0, limit);
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {shown.map((item) => (
          <li key={item.key} className="flex flex-col gap-1.5 px-4 py-3">
            <div className="flex min-w-0 items-start gap-2">
              <OctagonAlert
                aria-hidden
                className={item.critical ? "mt-0.5 size-4 shrink-0 text-status-critical" : "mt-0.5 size-4 shrink-0 text-status-warning"}
              />
              <p className="min-w-0 text-sm">
                <span className="font-medium">{item.summary}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · <JiraLink issueKey={item.key} url={item.jiraUrl} />
                  {item.milestoneLabel ? ` · ${item.milestoneLabel}` : ""} · {item.status}
                </span>
              </p>
            </div>
            <ul className="flex flex-col gap-1 pl-6 text-sm text-muted-foreground" aria-label={`${item.key} is blocked by`}>
              {item.blockedBy.map((blocker) => (
                <li key={blocker.key} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span>Blocked by</span>
                  {blocker.severity ? <SeverityBadge severity={blocker.severity} /> : null}
                  <span className="min-w-0 text-foreground">
                    {blocker.registerId ? `${blocker.registerId} ` : ""}
                    {blocker.title ?? blocker.key}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {blockers.length > shown.length ? (
        <p className="text-xs text-muted-foreground">
          Showing {shown.length} of {blockers.length} blocked work items.
        </p>
      ) : null}
    </div>
  );
}
