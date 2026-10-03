import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DashboardDto, RiskDashboardDto } from "@/lib/dashboard/types";
import { EmptyState, Panel } from "./primitives";
import { SeverityBadge } from "./status";

/**
 * Open P0/P1 counts as two simple bars (not a pie for two values) plus the top open risks.
 * Bar lengths are relative to the larger open count; counts are always printed.
 */
export function RiskSummary({
  distribution,
  risks,
  limit = 4,
}: {
  distribution: DashboardDto["charts"]["riskDistribution"];
  risks: readonly RiskDashboardDto[];
  limit?: number;
}) {
  const p0 = distribution.find((d) => d.severity === "P0") ?? { open: 0, resolved: 0 };
  const p1 = distribution.find((d) => d.severity === "P1") ?? { open: 0, resolved: 0 };
  const max = Math.max(p0.open, p1.open, 1);
  const openRisks = risks.filter((risk) => !risk.resolved).slice(0, limit);

  return (
    <Panel className="flex h-full flex-col gap-4">
      <dl className="flex flex-col gap-3" aria-label="Open risks by severity">
        {(
          [
            ["P0", p0],
            ["P1", p1],
          ] as const
        ).map(([severity, counts]) => (
          <div key={severity} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3">
            <dt>
              <SeverityBadge severity={severity} />
            </dt>
            <dd aria-hidden className="h-2 overflow-hidden rounded-full bg-viz-track">
              <div
                className={severity === "P0" ? "h-full rounded-full bg-status-critical" : "h-full rounded-full bg-status-serious"}
                style={{ width: `${(counts.open / max) * 100}%` }}
              />
            </dd>
            <dd className="text-sm tabular-nums">
              <span className="font-semibold">{counts.open}</span> open
              {counts.resolved > 0 ? <span className="text-muted-foreground"> · {counts.resolved} resolved</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      {openRisks.length === 0 ? (
        <EmptyState title="No open risks">No P0 or P1 risks are open in Jira.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2 border-t border-border pt-3">
          {openRisks.map((risk) => (
            <li key={risk.key} className="flex min-w-0 items-start gap-2 text-sm">
              <SeverityBadge severity={risk.severity} />
              <span className="min-w-0">
                <span className="font-medium">{risk.registerId ?? risk.key}</span> {risk.title}
                {risk.blocksWorkItems.length > 0 ? (
                  <span className="text-muted-foreground"> · blocks {risk.blocksWorkItems.length}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/risks"
        className="mt-auto inline-flex w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Open risk register <ArrowRight aria-hidden className="size-4" />
      </Link>
    </Panel>
  );
}
