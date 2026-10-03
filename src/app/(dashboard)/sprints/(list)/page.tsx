import type { Metadata } from "next";
import { DashboardError } from "@/components/dashboard/dashboard-error";
import { EmptyState, Section } from "@/components/dashboard/primitives";
import { ProjectHeader } from "@/components/dashboard/project-header";
import { SprintRoadmap } from "@/components/dashboard/sprint-roadmap";
import { SprintCard } from "@/components/sprint/sprint-detail";
import { loadDashboard } from "@/lib/dashboard/get-dashboard-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sprints" };

export default async function SprintsPage() {
  const result = await loadDashboard();
  if (!result.ok) return <DashboardError message={result.error.message} />;
  const dto = result.data;
  const otherActive = dto.activeSprints.filter((sprint) => !sprint.isMigrationSprint);

  return (
    <>
      <ProjectHeader title="Sprints" description="Migration delivery roadmap" sync={dto.sync} now={new Date()} />

      <Section id="roadmap" title="Delivery roadmap">
        <SprintRoadmap sprints={dto.migrationSprints} />
      </Section>

      <Section id="all-sprints" title="All migration sprints">
        {dto.migrationSprints.length === 0 ? (
          <EmptyState title="No migration sprints">Sprints named “MIG S1 - …” will appear here once created in Jira.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {dto.migrationSprints.map((sprint) => (
              <li key={sprint.id}>
                <SprintCard sprint={sprint} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {otherActive.length > 0 ? (
        <Section id="other-active" title="Other active Jira sprints" description="Active in Jira but not part of the migration roadmap">
          <ul className="flex flex-col gap-2">
            {otherActive.map((sprint) => (
              <li key={sprint.id}>
                <SprintCard sprint={sprint} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
