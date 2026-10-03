import type { Metadata } from "next";
import { DashboardError } from "@/components/dashboard/dashboard-error";
import { Section } from "@/components/dashboard/primitives";
import {
  BurndownReadinessList,
  ReadinessFactsGrid,
  ReadinessOverview,
  ReadinessSections,
} from "@/components/readiness/readiness-view";
import { requireAdmin } from "@/lib/auth/server";
import { loadReadiness } from "@/lib/readiness/readiness-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Data readiness" };

/** Operator view of Jira data quality. Read-only: every action is performed in Jira. */
export default async function ReadinessPage() {
  await requireAdmin("/admin/readiness");
  const result = await loadReadiness();
  if (!result.ok) return <DashboardError message={result.error.message} />;
  const readiness = result.data;

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">Admin</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Project data readiness</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Whether Jira data is clean enough for client reporting. The dashboard never changes Jira — make the recommended
          changes in Jira and they appear here within a few minutes.
        </p>
      </header>

      <ReadinessOverview readiness={readiness} />

      <Section id="facts" title="Live Jira facts">
        <ReadinessFactsGrid facts={readiness.facts} />
      </Section>

      <ReadinessSections sections={readiness.sections} />

      <Section id="burndown-readiness" title="Burndown readiness by sprint" description="From Jira change history">
        <BurndownReadinessList sprints={readiness.burndown} />
      </Section>

      <p className="text-xs text-muted-foreground">
        Security items that cannot be verified at runtime (HTTPS, secret storage, bundle scans) are tracked in
        docs/client-launch-checklist.md.
      </p>
    </>
  );
}
