import type { Metadata } from "next";
import { DashboardError } from "@/components/dashboard/dashboard-error";
import { MetricCard } from "@/components/dashboard/metric-card";
import { EmptyState, Section } from "@/components/dashboard/primitives";
import { ProjectHeader } from "@/components/dashboard/project-header";
import { RiskRegister } from "@/components/risks/risk-register";
import { loadDashboard } from "@/lib/dashboard/get-dashboard-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Risks" };

export default async function RisksPage() {
  const result = await loadDashboard();
  if (!result.ok) return <DashboardError message={result.error.message} />;
  const { summary, risks, sync } = result.data;

  return (
    <>
      <ProjectHeader title="Risk register" description="P0 and P1 risks tracked in Jira" sync={sync} now={new Date()} />

      <section aria-label="Risk metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="P0 open"
          value={summary.p0Risks.value}
          provenance={summary.p0Risks.description}
          emphasis={summary.p0Risks.value > 0 ? "critical" : undefined}
        />
        <MetricCard label="P1 open" value={summary.p1Risks.value} provenance={summary.p1Risks.description} />
        <MetricCard label="Resolved" value={summary.resolvedRisks.value} provenance={summary.resolvedRisks.description} />
        <MetricCard
          label="Affected work items"
          value={summary.riskAffectedWorkItems.value}
          provenance={summary.riskAffectedWorkItems.description}
        />
      </section>

      <Section id="register" title="All risks" description="P0 first, then P1 · open before resolved">
        {risks.length === 0 ? (
          <EmptyState title="No risks">No P0 or P1 risks have been identified in Jira.</EmptyState>
        ) : (
          <RiskRegister risks={risks} />
        )}
      </Section>
    </>
  );
}
