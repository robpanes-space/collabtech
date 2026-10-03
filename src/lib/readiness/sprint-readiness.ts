import type { NormalizedSprint } from "@/lib/jira/types";
import { check, listNames, plural, type ReadinessContext } from "./context";
import type { ReadinessCheck } from "./types";

/** Valid schedule: both dates present and end after start. */
export function hasValidDates(sprint: Pick<NormalizedSprint, "startDate" | "endDate">): boolean {
  if (!sprint.startDate || !sprint.endDate) return false;
  return Date.parse(sprint.endDate) > Date.parse(sprint.startDate);
}

/**
 * ACTIVE_MIGRATION_SPRINT (critical)
 *   pass     exactly one active migration sprint (unrelated active sprints never count)
 *   warning  several active migration sprints
 *   fail     none active while delivery is expected (a migration sprint has closed, or one's
 *            start date has passed) — or no migration sprints exist at all
 *   n/a      none active and none expected yet
 */
export function activeMigrationSprintCheck(ctx: ReadinessContext): ReadinessCheck {
  const { migrationSprints } = ctx.data;
  const base = { code: "ACTIVE_MIGRATION_SPRINT", category: "sprint_planning", importance: "critical", title: "Active migration sprint" } as const;
  if (migrationSprints.length === 0) {
    return check({
      ...base,
      status: "fail",
      message: "No migration sprints were found on the board.",
      action: 'Create the migration sprints in Jira using the naming convention "MIG S<number> - <name>".',
    });
  }
  const active = migrationSprints.filter((s) => s.state === "active");
  if (active.length === 1) return check({ ...base, status: "pass", message: `${active[0]!.name} is active.` });
  if (active.length > 1) {
    return check({
      ...base,
      status: "warning",
      message: `${active.length} migration sprints are active at once: ${listNames(active.map((s) => s.name))}.`,
      action: "Complete or close the earlier migration sprint in Jira so only the current one is active.",
    });
  }
  const now = ctx.now.getTime();
  const expected = migrationSprints.some((s) => s.state === "closed" || (s.startDate !== null && Date.parse(s.startDate) <= now));
  return expected
    ? check({
        ...base,
        status: "fail",
        message: "No migration sprint is active, but delivery should be underway.",
        action: "Start the current migration sprint on the Jira board.",
      })
    : check({ ...base, status: "not_applicable", message: "No migration sprint has started yet." });
}

/** EMPTY_ACTIVE_SPRINT (important): any active Jira sprint with zero issues. */
export function emptyActiveSprintCheck(ctx: ReadinessContext): ReadinessCheck {
  const base = { code: "EMPTY_ACTIVE_SPRINT", category: "sprint_planning", importance: "important", title: "Empty active sprints" } as const;
  const empty = ctx.data.activeSprints.filter((s) => s.issues.length === 0);
  if (empty.length === 0) return check({ ...base, status: "pass", message: "Every active Jira sprint contains work." });
  const names = empty.map((s) => s.name);
  return check({
    ...base,
    status: "warning",
    message:
      empty.length === 1
        ? `${names[0]} is active but contains no work items.`
        : `${empty.length} active sprints contain no work items: ${listNames(names)}.`,
    action: `Close ${listNames(names)} in Jira if ${empty.length === 1 ? "it is" : "they are"} no longer needed.`,
  });
}

/**
 * SPRINT_DATES (important)
 *   fail     the active migration sprint lacks valid dates
 *   warning  upcoming migration sprints lack dates
 *   pass     every migration sprint has start < end
 */
export function sprintDatesCheck(ctx: ReadinessContext): ReadinessCheck {
  const base = { code: "SPRINT_DATES", category: "sprint_planning", importance: "important", title: "Sprint dates" } as const;
  const sprints = ctx.data.migrationSprints;
  if (sprints.length === 0) return check({ ...base, status: "not_applicable", message: "No migration sprints to schedule." });
  const scheduled = sprints.filter(hasValidDates);
  const missing = sprints.filter((s) => !hasValidDates(s));
  const summary = `${scheduled.length} of ${sprints.length} migration sprints scheduled.`;
  if (missing.length === 0) return check({ ...base, status: "pass", message: summary });
  const activeMissing = missing.filter((s) => s.state === "active");
  const action = `Add planned start and end dates in Jira to ${listNames(missing.map((s) => s.name), 8)}.`;
  if (activeMissing.length > 0) {
    return check({
      ...base,
      status: "fail",
      message: `${summary} The active sprint ${listNames(activeMissing.map((s) => s.name))} has no valid dates.`,
      action,
    });
  }
  return check({ ...base, status: "warning", message: `${summary} ${plural(missing.length, "upcoming sprint")} without dates.`, action });
}
