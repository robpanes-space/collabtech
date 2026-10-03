import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DashboardError } from "@/components/dashboard/dashboard-error";
import { Suspense } from "react";
import { Section } from "@/components/dashboard/primitives";
import { HistorySkeleton, SprintHistorySection } from "@/components/history/history-sections";
import { SprintHeader, SprintMetrics, SprintWorkItems } from "@/components/sprint/sprint-detail";
import { loadDashboard } from "@/lib/dashboard/get-dashboard-data";
import { findSprint } from "@/lib/dashboard/selectors";

export const dynamic = "force-dynamic";

function parseSprintId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}

export async function generateMetadata({ params }: PageProps<"/sprints/[sprintId]">): Promise<Metadata> {
  const id = parseSprintId((await params).sprintId);
  const result = id === null ? null : await loadDashboard();
  const sprint = result?.ok && id !== null ? findSprint(result.data, id) : null;
  return { title: sprint?.name ?? "Sprint" };
}

export default async function SprintDetailPage({ params }: PageProps<"/sprints/[sprintId]">) {
  const id = parseSprintId((await params).sprintId);
  if (id === null) notFound();

  const result = await loadDashboard();
  if (!result.ok) return <DashboardError message={result.error.message} />;
  const sprint = findSprint(result.data, id);
  if (!sprint) notFound();

  return (
    <>
      <SprintHeader sprint={sprint} />
      <SprintMetrics sprint={sprint} />
      {/* Streamed after the 404 decision above, so HTTP status stays correct. */}
      <Section id="burndown" title="Burndown & scope changes" description="Reconstructed from Jira history">
        <Suspense fallback={<HistorySkeleton rows={2} />}>
          <SprintHistorySection sprintId={sprint.id} />
        </Suspense>
      </Section>
      <Section id="work-items" title="Work items" description="Grouped by status · blocked items first">
        <SprintWorkItems items={sprint.workItems} />
      </Section>
    </>
  );
}
