import type { DashboardDto, RiskDashboardDto, SprintDashboardDto } from "./types";

/**
 * Pure lookups over an already-built DashboardDto for the UI. No metrics are computed here —
 * only selection of DTO records.
 */

/** The migration context sprint: the active migration sprint, else Jira's active sprint. */
export function currentSprintOf(dto: DashboardDto): SprintDashboardDto | null {
  const activeMigrationId = dto.migrationState.activeMigrationSprint?.id;
  return dto.migrationSprints.find((sprint) => sprint.id === activeMigrationId) ?? dto.activeSprint;
}

/** Other sprints Jira reports as active besides `current`. */
export function otherActiveSprints(dto: DashboardDto, current: SprintDashboardDto | null): SprintDashboardDto[] {
  return dto.activeSprints.filter((sprint) => sprint.id !== current?.id);
}

/** Any sprint present in the DTO (roadmap or active). */
export function findSprint(dto: DashboardDto, sprintId: number): SprintDashboardDto | null {
  return (
    dto.migrationSprints.find((sprint) => sprint.id === sprintId) ??
    dto.activeSprints.find((sprint) => sprint.id === sprintId) ??
    null
  );
}

export type RiskFilter = "all" | "P0" | "P1" | "open" | "resolved";

export function filterRisks(risks: readonly RiskDashboardDto[], filter: RiskFilter): RiskDashboardDto[] {
  switch (filter) {
    case "P0":
    case "P1":
      return risks.filter((risk) => risk.severity === filter);
    case "open":
      return risks.filter((risk) => !risk.resolved);
    case "resolved":
      return risks.filter((risk) => risk.resolved);
    default:
      return [...risks];
  }
}

/** Risk register display order: P0 before P1, open before resolved, then register ID / key. */
export function sortRisksForRegister(risks: readonly RiskDashboardDto[]): RiskDashboardDto[] {
  const id = (risk: RiskDashboardDto) => risk.registerId ?? risk.key;
  return [...risks].sort(
    (a, b) =>
      a.severity.localeCompare(b.severity) ||
      Number(a.resolved) - Number(b.resolved) ||
      id(a).localeCompare(id(b), "en", { numeric: true }),
  );
}
