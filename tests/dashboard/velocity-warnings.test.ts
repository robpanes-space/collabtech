import { describe, expect, it } from "vitest";
import { buildDashboardDto } from "@/lib/dashboard/dashboard";
import { completedWithinSprint, throughput, velocity } from "@/lib/dashboard/velocity";
import { buildData, issue, NOW, raw, sprint } from "./helpers";

const closedSprint = (issues: ReturnType<typeof raw>[]) => {
  const data = buildData({
    sprints: [sprint(11, "MIG S1 - Discovery", "closed", { completeDate: "2026-09-30T00:00:00.000Z" })],
    sprintIssues: { 11: issues },
  });
  return { sprint: data.sprints[0]!, work: data.sprints[0]!.issues };
};

describe("velocity & throughput", () => {
  it("closed, fully estimated sprint", () => {
    const closed = closedSprint([
      raw({ category: "done", points: 5, resolvedAt: "2026-09-29T00:00:00.000Z" }),
      raw({ points: 3 }),
    ]);
    expect(velocity([closed])).toEqual({
      available: true,
      points: [
        {
          sprintId: "11",
          sprint: "MIG S1 - Discovery",
          roadmapPosition: 1,
          available: true,
          committedStoryPoints: 8,
          completedStoryPoints: 5,
        },
      ],
    });
  });

  it("partial estimates → unavailable, no work-item substitution", () => {
    const closed = closedSprint([raw({ category: "done", points: 5 }), raw()]);
    expect(velocity([closed]).points[0]).toMatchObject({
      available: false,
      committedStoryPoints: null,
      completedStoryPoints: null,
    });
    expect(velocity([closed]).available).toBe(false);
    expect(throughput([closed])[0]).toMatchObject({ committedWorkItems: 2, completedWorkItems: 1 });
  });

  it("work resolved after the sprint closed is not credited to it", () => {
    const later = issue({ category: "done", resolvedAt: "2026-10-02T00:00:00.000Z" });
    expect(completedWithinSprint(later, { completeDate: "2026-09-30T00:00:00.000Z" })).toBe(false);
    expect(completedWithinSprint(later, { completeDate: null })).toBe(true);
  });

  it("future sprints are ignored by the dashboard velocity dataset", () => {
    const data = buildData({
      sprints: [sprint(11, "MIG S1", "future"), sprint(12, "MIG S2", "active")],
      sprintIssues: { 11: [raw({ points: 3 })], 12: [raw({ points: 3, category: "done" })] },
    });
    const dto = buildDashboardDto(data, NOW);
    expect(dto.charts.velocity).toEqual({ available: false, points: [] });
    expect(dto.charts.throughput).toEqual([]);
  });
});

describe("warnings", () => {
  const codes = (dto: ReturnType<typeof buildDashboardDto>) => dto.warnings.map((w) => w.code);

  it("active non-migration sprint", () => {
    const data = buildData({
      sprints: [sprint(1, "SCRUM Sprint 0", "active"), sprint(2, "MIG S1 - Discovery", "future")],
    });
    const dto = buildDashboardDto(data, NOW);
    expect(dto.warnings).toContainEqual({
      code: "ACTIVE_NON_MIGRATION_SPRINT",
      level: "info",
      message: "Jira currently reports SCRUM Sprint 0 as the active sprint. MIG S1 - Discovery has not started.",
    });
    expect(codes(dto)).toContain("NO_ACTIVE_MIGRATION_SPRINT");
    expect(codes(dto)).toContain("MISSING_SPRINT_DATES");
  });

  it("missing story points field", () => {
    const dto = buildDashboardDto(buildData({ projectIssues: [raw()], storyPointsField: null }), NOW);
    expect(codes(dto)).toContain("NO_STORY_POINTS_FIELD");
    expect(codes(dto)).not.toContain("STORY_POINTS_INCOMPLETE");
  });

  it("incomplete estimation", () => {
    const dto = buildDashboardDto(buildData({ projectIssues: [raw({ points: 3 }), raw()] }), NOW);
    expect(dto.warnings.find((w) => w.code === "STORY_POINTS_INCOMPLETE")?.message).toBe(
      "1 of 2 work items have no story-point estimate (coverage 50%). Progress is based on work items.",
    );
  });

  it("velocity unavailable, no active sprint, no migration sprints", () => {
    const dto = buildDashboardDto(buildData({}), NOW);
    expect(codes(dto)).toEqual(
      expect.arrayContaining(["VELOCITY_UNAVAILABLE", "NO_ACTIVE_SPRINT", "NO_MIGRATION_SPRINTS"]),
    );
  });

  it("no warning for incomplete estimation when fully estimated", () => {
    const dto = buildDashboardDto(buildData({ projectIssues: [raw({ points: 3 })] }), NOW);
    expect(codes(dto)).not.toContain("STORY_POINTS_INCOMPLETE");
  });
});

describe("parallel active sprints", () => {
  it("keeps Jira board order for activeSprint, lists all active sprints and warns", () => {
    const data = buildData({
      sprints: [
        sprint(1, "MIG S1 - Discovery", "active", { startDate: "2026-10-05T07:28:00.000Z", endDate: "2026-10-19T07:28:00.000Z" }),
        sprint(2, "SCRUM Sprint 0", "active", { startDate: "2026-10-03T06:48:59.722Z", endDate: "2026-10-17T06:48:59.722Z" }),
        sprint(3, "MIG S2 - Schema Mapping", "future"),
      ],
    });
    const dto = buildDashboardDto(data, NOW);
    expect(dto.activeSprint?.name).toBe("MIG S1 - Discovery");
    expect(dto.activeSprints.map((s) => s.name)).toEqual(["MIG S1 - Discovery", "SCRUM Sprint 0"]);
    expect(dto.migrationState.activeMigrationSprint?.name).toBe("MIG S1 - Discovery");
    expect(dto.warnings).toContainEqual({
      code: "MULTIPLE_ACTIVE_SPRINTS",
      level: "info",
      message:
        "Jira reports 2 active sprints (MIG S1 - Discovery, SCRUM Sprint 0). MIG S1 - Discovery is shown as the current sprint because it is first in the board order.",
    });
    expect(dto.warnings.map((w) => w.code)).not.toContain("ACTIVE_NON_MIGRATION_SPRINT");
  });
});
