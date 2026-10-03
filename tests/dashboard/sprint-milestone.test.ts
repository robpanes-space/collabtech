import { describe, expect, it } from "vitest";
import { buildMilestoneDto } from "@/lib/dashboard/milestone-progress";
import { assessSprintHealth, elapsedPercent } from "@/lib/dashboard/sprint-health";
import { buildSprintDto, migrationRoadmap, nextMigrationSprint } from "@/lib/dashboard/sprint-progress";
import { summarizeWork } from "@/lib/dashboard/work-progress";
import type { RawJiraIssue, RawJiraSprint } from "@/lib/jira/schemas";
import { blockedBy, buildData, ctxFor, issue, NOW, raw, sprint } from "./helpers";

/** Active sprint, 2026-10-01 → 2026-10-11 (NOW = 10-03 12:00 → 25% elapsed). */
const ACTIVE = sprint(1, "MIG S1 - Discovery", "active", {
  startDate: "2026-10-01T00:00:00.000Z",
  endDate: "2026-10-11T00:00:00.000Z",
});

function sprintDto(issues: RawJiraIssue[], rawSprint: RawJiraSprint = ACTIVE, extra: RawJiraIssue[] = [], now = NOW) {
  const data = buildData({ sprints: [rawSprint], sprintIssues: { [rawSprint.id]: issues }, projectIssues: extra });
  return buildSprintDto(data.sprints[0]!, ctxFor(data, now));
}

describe("sprint progress", () => {
  it("all estimated → story points", () => {
    expect(sprintDto([raw({ category: "done", points: 5 }), raw({ points: 5 })])).toMatchObject({
      progress: 50,
      progressMethod: "storyPoints",
      storyPointsCommitted: 10,
      storyPointsCompleted: 5,
      estimationCoverage: 100,
    });
  });

  it("incomplete estimates → work items", () => {
    const dto = sprintDto([raw({ category: "done", points: 5 }), raw(), raw()]);
    expect(dto).toMatchObject({ progress: 33, progressMethod: "workItems", estimationCoverage: 33 });
    expect(dto.progressRaw).toBeCloseTo(100 / 3);
  });

  it("zero work → 0", () => {
    expect(sprintDto([])).toMatchObject({ progress: 0, totalWorkItems: 0, estimationCoverage: null, workItems: [] });
  });

  it("all done → 100", () => {
    expect(sprintDto([raw({ category: "done" }), raw({ category: "done" })])).toMatchObject({ progress: 100 });
  });

  it("exposes milestone keys and slim work items (no risk-register items)", () => {
    const dto = sprintDto([
      raw({ key: "SCRUM-10", parent: { key: "SCRUM-2" } }),
      raw({ key: "SCRUM-11", parent: { key: "SCRUM-1" } }),
      raw({ key: "SCRUM-20", summary: "I-01 P0 - Risk" }),
    ]);
    expect(dto.workItems.map((w) => w.key)).toEqual(["SCRUM-10", "SCRUM-11"]);
    expect(dto.milestoneKeys).toEqual(["SCRUM-1", "SCRUM-2"]);
    expect(Object.keys(dto.workItems[0]!)).not.toContain("fields");
  });
});

describe("sprint health", () => {
  it("future", () => {
    expect(sprintDto([raw()], sprint(2, "MIG S2 - Schema", "future")).health.status).toBe("future");
  });

  it("healthy", () => {
    expect(sprintDto([raw({ category: "done" }), raw()]).health).toEqual({ status: "healthy", reasons: [] });
  });

  it("at_risk because of a blocked work item", () => {
    expect(sprintDto([raw({ links: [blockedBy("SCRUM-99")] }), raw()]).health).toEqual({
      status: "at_risk",
      reasons: ["1 blocked work item."],
    });
  });

  it("blocked by an open P0", () => {
    const p0 = raw({ key: "SCRUM-20", summary: "I-01 P0 - Tenant Metadata Absent", category: "in_progress" });
    const health = sprintDto([raw({ links: [blockedBy("SCRUM-20", "indeterminate")] })], ACTIVE, [p0]).health;
    expect(health.status).toBe("blocked");
  });

  it("a resolved P0 does not block", () => {
    const p0 = raw({ key: "SCRUM-20", summary: "I-01 P0 - x", category: "done" });
    expect(sprintDto([raw({ links: [blockedBy("SCRUM-20", "done")] })], ACTIVE, [p0]).health.status).toBe("healthy");
  });

  it("complete when closed, or when all work is done", () => {
    expect(sprintDto([raw()], sprint(3, "MIG S1", "closed")).health.status).toBe("complete");
    expect(sprintDto([raw({ category: "done" })]).health.status).toBe("complete");
  });

  it("missing dates skip the time rule", () => {
    const undated = sprint(4, "MIG S1", "active");
    const dto = sprintDto([raw(), raw()], undated);
    expect(dto).toMatchObject({ elapsedPercent: null, health: { status: "healthy" } });
  });

  it("time-based at_risk: ≥75% elapsed with <50% complete", () => {
    const late = new Date("2026-10-08T12:00:00.000Z"); // 75%
    const dto = sprintDto([raw({ category: "done" }), raw(), raw()], ACTIVE, [], late);
    expect(dto.elapsedPercent).toBe(75);
    expect(dto.health).toEqual({
      status: "at_risk",
      reasons: ["75% of the sprint has elapsed with less than 50% of work complete."],
    });
  });

  it("time-based at_risk: ≥90% elapsed with <75% complete", () => {
    const veryLate = new Date("2026-10-10T00:00:00.000Z"); // 90%
    const dto = sprintDto([raw({ category: "done" }), raw({ category: "done" }), raw()], ACTIVE, [], veryLate);
    expect(dto.health.status).toBe("at_risk");
    expect(dto.health.reasons[0]).toContain("less than 75%");
  });

  it("time rule does not fire when work keeps pace", () => {
    const late = new Date("2026-10-08T12:00:00.000Z");
    expect(sprintDto([raw({ category: "done" }), raw()], ACTIVE, [], late).health.status).toBe("healthy");
  });

  it("elapsedPercent handles invalid ranges", () => {
    expect(elapsedPercent({ startDate: "2026-10-05T00:00:00Z", endDate: "2026-10-01T00:00:00Z" }, NOW)).toBeNull();
    expect(elapsedPercent({ startDate: null, endDate: "2026-10-01T00:00:00Z" }, NOW)).toBeNull();
    expect(elapsedPercent(ACTIVE as never, new Date("2026-12-01"))).toBe(100);
  });

  it("assessSprintHealth is pure", () => {
    const work = summarizeWork([issue()]);
    const active = { state: "active" as const, startDate: ACTIVE.startDate ?? null, endDate: ACTIVE.endDate ?? null };
    const input = { sprint: active, work, issues: [issue()], p0Keys: new Set<string>(), now: NOW };
    expect(assessSprintHealth(input)).toEqual(assessSprintHealth(input));
  });
});

describe("migration roadmap & next sprint", () => {
  const sprints = [
    sprint(30, "MIG S10 - Hypercare", "future"),
    sprint(1, "SCRUM Sprint 0", "active"),
    sprint(12, "MIG S2 - Schema Mapping", "future"),
    sprint(11, "MIG S1 - Discovery", "future"),
    sprint(40, "Platform hardening", "future"),
  ];

  it("orders S1 < S2 < S10 and excludes unrelated sprints", () => {
    const data = buildData({ sprints });
    expect(migrationRoadmap(data.sprints).map((s) => s.name)).toEqual([
      "MIG S1 - Discovery",
      "MIG S2 - Schema Mapping",
      "MIG S10 - Hypercare",
    ]);
  });

  const roadmapDtos = (raws: RawJiraSprint[], issues: Record<number, RawJiraIssue[]> = {}) => {
    const data = buildData({ sprints: raws, sprintIssues: issues });
    const ctx = ctxFor(data);
    return migrationRoadmap(data.sprints).map((s) => buildSprintDto(s, ctx));
  };

  it("all future → first roadmap sprint", () => {
    expect(nextMigrationSprint(roadmapDtos(sprints))?.name).toBe("MIG S1 - Discovery");
  });

  it("first incomplete sprint (closed and fully-done sprints are skipped)", () => {
    const dtos = roadmapDtos(
      [sprint(11, "MIG S1", "closed"), sprint(12, "MIG S2", "active"), sprint(13, "MIG S3", "future")],
      { 12: [raw({ category: "done" })] },
    );
    expect(nextMigrationSprint(dtos)?.name).toBe("MIG S3");
  });

  it("all complete → null", () => {
    expect(nextMigrationSprint(roadmapDtos([sprint(11, "MIG S1", "closed"), sprint(12, "MIG S2", "closed")]))).toBeNull();
  });
});

describe("milestone progress & health", () => {
  const epic = (category: "todo" | "in_progress" | "done" = "in_progress") =>
    raw({ key: "SCRUM-2", type: "Epic", summary: "M2 - Zoho Schema, Modules & Field Mapping", category });
  const child = (overrides: Parameters<typeof raw>[0] = {}) => raw({ parent: { key: "SCRUM-2" }, ...overrides });

  const milestoneDto = (issues: RawJiraIssue[]) => {
    const data = buildData({ projectIssues: issues });
    return buildMilestoneDto(data.milestones[0]!, ctxFor(data));
  };

  it("empty milestone", () => {
    expect(milestoneDto([epic()])).toMatchObject({
      milestoneLabel: "M2",
      title: "Zoho Schema, Modules & Field Mapping",
      totalWorkItems: 0,
      progress: 0,
      health: { status: "healthy" },
    });
    expect(milestoneDto([epic("done")]).health.status).toBe("complete");
  });

  it("partial completion → healthy", () => {
    expect(milestoneDto([epic(), child({ category: "done", points: 3 }), child({ points: 1 })])).toMatchObject({
      progress: 75,
      progressMethod: "storyPoints",
      completedWorkItems: 1,
      health: { status: "healthy", reasons: [] },
    });
  });

  it("all complete → complete", () => {
    expect(milestoneDto([epic(), child({ category: "done" }), child({ category: "done" })])).toMatchObject({
      progress: 100,
      health: { status: "complete" },
    });
  });

  it("blocked work (non-P0) → at_risk", () => {
    const dto = milestoneDto([epic(), child({ links: [blockedBy("SCRUM-77")] })]);
    expect(dto).toMatchObject({ blockedWorkItems: 1, health: { status: "at_risk", reasons: ["1 blocked work item."] } });
  });

  it("open P1 risk → at_risk", () => {
    expect(milestoneDto([epic(), child(), child({ summary: "I-08 P1 - Reports" })]).health).toEqual({
      status: "at_risk",
      reasons: ["1 open P1 risk."],
    });
  });

  it("P0 risk child → blocked; risk-register item is not counted as work", () => {
    const dto = milestoneDto([epic(), child({ category: "done" }), child({ key: "SCRUM-20", summary: "I-01 P0 - Tenant" })]);
    expect(dto).toMatchObject({
      totalWorkItems: 1,
      completedWorkItems: 1,
      openP0Risks: 1,
      health: { status: "blocked", reasons: ["1 open P0 risk."] },
    });
  });

  it("work blocked by an external open P0 → blocked", () => {
    const p0 = raw({ key: "SCRUM-50", summary: "I-03 P0 - Elsewhere" });
    const dto = milestoneDto([epic(), child({ links: [blockedBy("SCRUM-50")] }), p0]);
    expect(dto).toMatchObject({ openP0Risks: 1, health: { status: "blocked" } });
    expect(dto.health.reasons).toContain("1 work item is blocked by a P0 risk.");
  });

  it("all done but an open P0 remains → blocked, not complete", () => {
    expect(milestoneDto([epic(), child({ category: "done" }), child({ summary: "I-01 P0 - Open" })]).health.status).toBe(
      "blocked",
    );
  });
});
