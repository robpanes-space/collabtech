import type { HealthAssessment, MilestoneDashboardDto, ProjectHealth, SprintDashboardDto } from "./types";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Project health — deterministic roll-up, evaluated in order (not a forecast):
 *   1. complete  ≥1 in-scope milestone and every in-scope milestone is complete.
 *   2. blocked   any in-scope milestone is blocked.
 *   3. at_risk   any in-scope milestone is at risk, or the active migration sprint is
 *                blocked / at risk.
 *   4. healthy   otherwise.
 */
export function assessProjectHealth(
  milestones: readonly MilestoneDashboardDto[],
  activeMigrationSprint: SprintDashboardDto | null,
): HealthAssessment<ProjectHealth> {
  const scoped = milestones.filter((m) => m.inProjectScope);
  const count = (status: MilestoneDashboardDto["health"]["status"]) =>
    scoped.filter((m) => m.health.status === status).length;

  if (scoped.length > 0 && count("complete") === scoped.length) {
    return { status: "complete", reasons: ["All milestones are complete."] };
  }

  const blocked = count("blocked");
  if (blocked > 0) {
    return {
      status: "blocked",
      reasons: [`${plural(blocked, "milestone is", "milestones are")} blocked by open P0 risks.`],
    };
  }

  const reasons: string[] = [];
  const atRisk = count("at_risk");
  if (atRisk > 0) reasons.push(`${plural(atRisk, "milestone is", "milestones are")} at risk.`);
  const sprintStatus = activeMigrationSprint?.health.status;
  if (activeMigrationSprint && (sprintStatus === "blocked" || sprintStatus === "at_risk")) {
    reasons.push(`${activeMigrationSprint.name} is ${sprintStatus === "blocked" ? "blocked" : "at risk"}.`);
  }
  return reasons.length > 0 ? { status: "at_risk", reasons } : { status: "healthy", reasons: [] };
}
