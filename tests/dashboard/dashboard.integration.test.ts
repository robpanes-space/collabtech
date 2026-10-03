import { describe, expect, it } from "vitest";
import { buildDashboardDto } from "@/lib/dashboard/dashboard";
import { normalizeProjectData } from "@/lib/jira/normalize";
import { defaultOptions, fixtures } from "../fixtures/jira";

/**
 * End-to-end over the synthetic fixtures: raw Jira JSON → normalizeProjectData →
 * buildDashboardDto. Mirrors the real project state: "SCRUM Sprint 0" is active while
 * MIG S1–S8 are future.
 */
const NOW = new Date("2026-10-03T12:00:00.000Z");

function buildFixtureDto() {
  const issues = fixtures.issues();
  const sprintZero = ["SCRUM-10", "SCRUM-11", "SCRUM-12", "SCRUM-14", "SCRUM-15"];
  const data = normalizeProjectData(
    {
      project: fixtures.project(),
      board: fixtures.board(),
      sprints: fixtures.sprints(),
      projectIssues: [...issues, fixtures.riskP0(), fixtures.riskP1()],
      sprintIssues: {
        1: issues.filter((issue) => sprintZero.includes(issue.key)),
        3: [fixtures.blockedIssue(), fixtures.unestimatedIssue()],
      },
    },
    defaultOptions,
    NOW,
  );
  return buildDashboardDto(data, NOW);
}

describe("buildDashboardDto (fixtures)", () => {
  const dto = buildFixtureDto();

  it("is deterministic", () => {
    expect(buildFixtureDto()).toEqual(dto);
  });

  it("is JSON-serializable and free of raw Jira structures and emails", () => {
    const json = JSON.stringify(dto);
    expect(JSON.parse(json)).toEqual(dto);
    expect(json).not.toMatch(/"fields"|"self"|customfield_|@|issuelinks|statusCategory"\s*:\s*\{/);
  });

  it("reports project, board and sync", () => {
    expect(dto.project).toEqual({ id: "10000", key: "SCRUM", name: "Example Team" });
    expect(dto.board).toEqual({ id: 1, name: "SCRUM board" });
    expect(dto.sync).toEqual({
      timestamp: "2026-10-03T12:00:00.000Z",
      source: "jira",
      refreshIntervalSeconds: 60,
      nextRefreshAt: "2026-10-03T12:01:00.000Z",
    });
  });

  it("keeps Jira's actual active sprint and exposes migration state separately", () => {
    expect(dto.activeSprint).toMatchObject({
      id: 1,
      name: "SCRUM Sprint 0",
      state: "active",
      isMigrationSprint: false,
      roadmapPosition: null,
      elapsedPercent: 37,
    });
    const s1 = {
      id: 2,
      name: "MIG S1 - Discovery",
      state: "future",
      roadmapPosition: 1,
      startDate: "2026-10-12T09:00:00.000Z",
      endDate: "2026-10-26T09:00:00.000Z",
    };
    // No active migration sprint → following = first incomplete (same as next).
    expect(dto.migrationState).toEqual({ activeMigrationSprint: null, nextMigrationSprint: s1, followingMigrationSprint: s1 });
  });

  it("builds the migration roadmap in MIG S<n> order without the unrelated sprint", () => {
    expect(dto.migrationSprints.map((s) => s.roadmapPosition)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(dto.migrationSprints.map((s) => s.name)).not.toContain("Platform hardening");
    expect(dto.migrationSprints.every((s) => s.health.status === "future")).toBe(true);
    expect(dto.migrationSprints[1]).toMatchObject({
      name: "MIG S2 - Schema Mapping",
      totalWorkItems: 2,
      blockedWorkItems: 1,
      progressMethod: "workItems",
      estimationCoverage: 50,
      milestoneKeys: ["SCRUM-2"],
    });
  });

  it("summarizes project work (risk-register items and subtasks excluded)", () => {
    const { summary } = dto;
    expect(summary.overallProgress).toEqual({
      value: 50,
      raw: 50,
      source: "workItems",
      label: "Overall progress",
      description: "Based on completed work items because story-point coverage is 83%.",
      method: "workItems",
      completed: 3,
      total: 6,
      estimationCoverage: 83,
    });
    expect(summary.totalWorkItems.value).toBe(6);
    expect(summary.completedWorkItems.value).toBe(3);
    expect(summary.inProgressWorkItems.value).toBe(1);
    expect(summary.todoWorkItems.value).toBe(2);
    expect(summary.blockedWorkItems).toMatchObject({ value: 1, source: "issueLinks" });
    expect(summary.p0Risks.value).toBe(1);
    expect(summary.p1Risks.value).toBe(1);
    expect(summary.totalMilestones.value).toBe(3);
    expect(summary.completedMilestones.value).toBe(1);
    expect(summary.completedSprints.value).toBe(0);
    expect(summary.totalMigrationSprints.value).toBe(8);
  });

  it("derives milestone progress and health", () => {
    expect(
      dto.milestones.map((m) => [m.milestoneLabel, m.progress, m.progressMethod, m.health.status, m.openP0Risks]),
    ).toEqual([
      ["M1", 100, "storyPoints", "complete", 0],
      ["M2", 0, "workItems", "blocked", 1],
      ["M3", 0, "workItems", "healthy", 0],
    ]);
    expect(dto.milestones[1]).toMatchObject({ totalWorkItems: 3, inProgressWorkItems: 1, blockedWorkItems: 1 });
  });

  it("lists risks P0 first with blocked work", () => {
    expect(dto.risks.map((r) => [r.registerId, r.severity, r.resolved, r.blocksWorkItems])).toEqual([
      ["I-01", "P0", false, ["SCRUM-16"]],
      ["I-08", "P1", false, []],
    ]);
  });

  it("produces chart-ready datasets", () => {
    expect(dto.charts.statusDistribution).toEqual([
      { key: "done", status: "Done", count: 3 },
      { key: "in_progress", status: "In Progress", count: 1 },
      { key: "todo", status: "To Do", count: 2 },
    ]);
    expect(dto.charts.riskDistribution).toEqual([
      { severity: "P0", open: 1, resolved: 0 },
      { severity: "P1", open: 1, resolved: 0 },
    ]);
    expect(dto.charts.velocity).toEqual({ available: false, points: [] });
    expect(dto.charts.workload.map((w) => [w.displayName, w.openWorkItems])).toEqual([
      ["Alex Rivera", 1],
      ["Former user", 1],
      ["Sam Chen", 1],
    ]);
    expect(dto.charts.sprintProgress).toHaveLength(8);
    expect(dto.charts.milestoneProgress[0]).toEqual({
      key: "SCRUM-1",
      milestone: "M1",
      name: "Discovery, Metadata & Architecture",
      progress: 100,
      progressMethod: "storyPoints",
      health: "complete",
    });
  });

  it("emits client-safe warnings and no fabricated activity", () => {
    expect(dto.warnings.map((w) => w.code)).toEqual([
      "STORY_POINTS_INCOMPLETE",
      "ACTIVE_NON_MIGRATION_SPRINT",
      "NO_ACTIVE_MIGRATION_SPRINT",
      "MISSING_SPRINT_DATES",
      "VELOCITY_UNAVAILABLE",
    ]);
  });

  it("matches the snapshot of the client-facing contract", () => {
    expect(dto).toMatchSnapshot();
  });
});
