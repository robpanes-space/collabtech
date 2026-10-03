import { describe, expect, it } from "vitest";
import { buildDashboardDto } from "@/lib/dashboard/dashboard";
import { assessProjectHealth } from "@/lib/dashboard/project-health";
import { currentSprintOf, filterRisks, findSprint, otherActiveSprints, sortRisksForRegister } from "@/lib/dashboard/selectors";
import { sprintShortName } from "@/lib/dashboard/sprint-progress";
import type { MilestoneDashboardDto, SprintDashboardDto } from "@/lib/dashboard/types";
import { blockedBy, buildData, NOW, raw, sprint } from "./helpers";

const roadmap = (states: ("active" | "future" | "closed")[], extra: Parameters<typeof sprint>[] = []) =>
  buildDashboardDto(
    buildData({
      sprints: [...extra.map((args) => sprint(...args)), ...states.map((state, i) => sprint(100 + i, `MIG S${i + 1} - Sprint ${i + 1}`, state))],
    }),
    NOW,
  ).migrationState;

describe("followingMigrationSprint", () => {
  it("active S1 → S2", () => {
    expect(roadmap(["active", "future", "future"]).followingMigrationSprint?.name).toBe("MIG S2 - Sprint 2");
  });

  it("active S2 → S3", () => {
    expect(roadmap(["closed", "active", "future"]).followingMigrationSprint?.name).toBe("MIG S3 - Sprint 3");
  });

  it("active S8 (last) → null", () => {
    const states = Array.from({ length: 7 }, () => "closed" as const);
    const state = roadmap([...states, "active"]);
    expect(state.activeMigrationSprint?.name).toBe("MIG S8 - Sprint 8");
    expect(state.followingMigrationSprint).toBeNull();
  });

  it("no active migration sprint → first incomplete", () => {
    const state = roadmap(["closed", "future", "future"]);
    expect(state.followingMigrationSprint?.name).toBe("MIG S2 - Sprint 2");
    expect(state.followingMigrationSprint).toEqual(state.nextMigrationSprint);
  });

  it("an unrelated active sprint does not affect migration ordering", () => {
    const state = roadmap(["active", "future"], [[1, "SCRUM Sprint 0", "active"]]);
    expect(state.activeMigrationSprint?.name).toBe("MIG S1 - Sprint 1");
    expect(state.followingMigrationSprint?.name).toBe("MIG S2 - Sprint 2");
  });

  it("keeps nextMigrationSprint semantics unchanged (active sprint itself)", () => {
    expect(roadmap(["active", "future"]).nextMigrationSprint?.name).toBe("MIG S1 - Sprint 1");
  });
});

describe("project health", () => {
  const milestone = (status: MilestoneDashboardDto["health"]["status"], inProjectScope = true) =>
    ({ inProjectScope, health: { status, reasons: [] } }) as unknown as MilestoneDashboardDto;
  const sprintWith = (status: SprintDashboardDto["health"]["status"]) =>
    ({ name: "MIG S1", health: { status, reasons: [] } }) as unknown as SprintDashboardDto;

  it("blocked when any committed milestone is blocked", () => {
    expect(assessProjectHealth([milestone("blocked"), milestone("blocked"), milestone("healthy")], null)).toEqual({
      status: "blocked",
      reasons: ["2 milestones are blocked by open P0 risks."],
    });
  });

  it("ignores optional milestones", () => {
    expect(assessProjectHealth([milestone("healthy"), milestone("blocked", false)], null).status).toBe("healthy");
  });

  it("at risk from milestones or the active migration sprint", () => {
    expect(assessProjectHealth([milestone("at_risk")], null).status).toBe("at_risk");
    expect(assessProjectHealth([milestone("healthy")], sprintWith("blocked"))).toEqual({
      status: "at_risk",
      reasons: ["MIG S1 is blocked."],
    });
  });

  it("complete when all committed milestones are complete", () => {
    expect(assessProjectHealth([milestone("complete"), milestone("complete")], null).status).toBe("complete");
    expect(assessProjectHealth([], null).status).toBe("healthy");
  });
});

describe("blockers list and work item details", () => {
  const data = buildData({
    sprints: [sprint(1, "MIG S1 - Discovery", "active")],
    projectIssues: [
      raw({ key: "SCRUM-5", type: "Epic", summary: "M1 - Discovery" }),
      raw({ key: "SCRUM-38", summary: "I-01 P0 - Tenant Metadata Absent" }),
      raw({ key: "SCRUM-45", summary: "I-08 P1 - Rules Incomplete" }),
    ],
    sprintIssues: {
      1: [
        raw({ key: "SCRUM-14", parent: { key: "SCRUM-5" }, links: [blockedBy("SCRUM-38")] }),
        raw({ key: "SCRUM-25", parent: { key: "SCRUM-5" }, links: [blockedBy("SCRUM-45")] }),
        raw({ key: "SCRUM-26", category: "done", links: [blockedBy("SCRUM-45")] }),
        raw({ key: "SCRUM-27", points: 3, category: "in_progress" }),
      ],
    },
  });
  const dto = buildDashboardDto(data, NOW);

  it("lists unresolved blocked work, critical first, with readable blockers", () => {
    expect(dto.blockers.map((b) => [b.key, b.critical, b.milestoneLabel, b.sprintName])).toEqual([
      ["SCRUM-14", true, "M1", "MIG S1 - Discovery"],
      ["SCRUM-25", false, "M1", "MIG S1 - Discovery"],
    ]);
    expect(dto.blockers[0]?.blockedBy).toEqual([
      {
        key: "SCRUM-38",
        jiraUrl: null,
        registerId: "I-01",
        summary: "I-01 P0 - Tenant Metadata Absent",
        title: "Tenant Metadata Absent",
        severity: "P0",
      },
    ]);
    expect(dto.blockers.length).toBe(dto.summary.blockedWorkItems.value);
  });

  it("work items carry display group, milestone label and blocker details", () => {
    const items = dto.activeSprint?.workItems ?? [];
    expect(items.map((i) => [i.key, i.group])).toEqual([
      ["SCRUM-14", "blocked"],
      ["SCRUM-25", "blocked"],
      ["SCRUM-26", "done"],
      ["SCRUM-27", "in_progress"],
    ]);
    expect(items[0]).toMatchObject({ milestoneLabel: "M1", blockedBy: [{ registerId: "I-01", severity: "P0" }] });
  });

  it("risk DTOs carry titles and blocked work details; risk metrics include affected items", () => {
    const i01 = dto.risks.find((r) => r.registerId === "I-01");
    expect(i01).toMatchObject({ title: "Tenant Metadata Absent", blocks: [{ key: "SCRUM-14", milestoneLabel: "M1" }] });
    expect(dto.summary.riskAffectedWorkItems.value).toBe(2);
    expect(dto.summary.resolvedRisks.value).toBe(0);
  });

  it("exposes estimation counts, completed/total and remaining story points", () => {
    expect(dto.summary.estimatedWorkItems.value).toBe(1);
    expect(dto.summary.overallProgress).toMatchObject({ method: "workItems", completed: 1, total: 4 });
    expect(dto.activeSprint).toMatchObject({ shortName: "Discovery", storyPointsRemaining: 3 });
  });
});

describe("selectors", () => {
  const dto = buildDashboardDto(
    buildData({
      sprints: [sprint(1, "MIG S1 - Discovery", "active"), sprint(2, "SCRUM Sprint 0", "active"), sprint(3, "MIG S2 - Schema", "future")],
      projectIssues: [raw({ summary: "I-01 P0 - A" }), raw({ summary: "I-08 P1 - B", category: "done" }), raw({ labels: ["p0"], category: "done" })],
    }),
    NOW,
  );

  it("current sprint = active migration sprint; other active sprints listed", () => {
    const current = currentSprintOf(dto);
    expect(current?.name).toBe("MIG S1 - Discovery");
    expect(otherActiveSprints(dto, current).map((s) => s.name)).toEqual(["SCRUM Sprint 0"]);
    expect(findSprint(dto, 2)?.name).toBe("SCRUM Sprint 0");
    expect(findSprint(dto, 999)).toBeNull();
  });

  it("filters and sorts the risk register", () => {
    expect(filterRisks(dto.risks, "P0")).toHaveLength(2);
    expect(filterRisks(dto.risks, "P1")).toHaveLength(1);
    expect(filterRisks(dto.risks, "open")).toHaveLength(1);
    expect(filterRisks(dto.risks, "resolved")).toHaveLength(2);
    expect(filterRisks(dto.risks, "all")).toHaveLength(3);
    expect(sortRisksForRegister(dto.risks).map((r) => [r.severity, r.resolved])).toEqual([
      ["P0", false],
      ["P0", true],
      ["P1", true],
    ]);
  });

  it("short sprint names", () => {
    expect(sprintShortName("MIG S3 - Loads Quotes I")).toBe("Loads Quotes I");
    expect(sprintShortName("SCRUM Sprint 0")).toBe("SCRUM Sprint 0");
  });
});
