import { describe, expect, it } from "vitest";
import {
  migrationSprintNumber,
  milestoneNumber,
  normalizeIssue,
  normalizeMilestone,
  normalizeProjectData,
  normalizeSprint,
} from "@/lib/jira/normalize";
import type { RawJiraIssue, RawJiraSprint } from "@/lib/jira/schemas";
import { defaultOptions, fixtures, rawIssue } from "../fixtures/jira";

const sprintRaw: RawJiraSprint = {
  id: 42,
  name: "MIG S3 - Loads Quotes I",
  state: "future",
  goal: "  ",
  startDate: null,
  endDate: "not-a-date",
};

const sprintOf = (raws: RawJiraIssue[]) =>
  normalizeSprint(
    sprintRaw,
    raws.map((raw) => normalizeIssue(raw, defaultOptions)),
  );

describe("normalizeSprint", () => {
  it("empty sprint: zero counts, progress 0, coverage null", () => {
    expect(sprintOf([])).toMatchObject({
      totalIssues: 0,
      completedIssues: 0,
      progress: 0,
      progressMethod: "workItems",
      estimationCoverage: null,
      storyPointsTotal: null,
      storyPointsCompleted: null,
    });
  });

  it("keeps sprint metadata; blank goal and invalid dates → null", () => {
    expect(sprintOf([])).toMatchObject({
      id: 42,
      state: "future",
      goal: null,
      startDate: null,
      endDate: null,
      completeDate: null,
      migrationSprintNumber: 3,
    });
  });

  it("all To Do", () => {
    const sprint = sprintOf([rawIssue({ points: 3 }), rawIssue({ points: 5 })]);
    expect(sprint).toMatchObject({ todoIssues: 2, completedIssues: 0, progress: 0, progressMethod: "storyPoints" });
  });

  it("partially complete, all estimated → story points", () => {
    const sprint = sprintOf([
      rawIssue({ category: "done", points: 3 }),
      rawIssue({ category: "in_progress", points: 5 }),
      rawIssue({ points: 2 }),
    ]);
    expect(sprint).toMatchObject({
      totalIssues: 3,
      completedIssues: 1,
      inProgressIssues: 1,
      todoIssues: 1,
      storyPointsTotal: 10,
      storyPointsCompleted: 3,
      estimatedIssueCount: 3,
      unestimatedIssueCount: 0,
      estimationCoverage: 100,
      progress: 30,
      progressMethod: "storyPoints",
    });
  });

  it("all complete → 100", () => {
    const sprint = sprintOf([rawIssue({ category: "done", points: 1 }), rawIssue({ category: "done", points: 2 })]);
    expect(sprint).toMatchObject({ progress: 100, progressMethod: "storyPoints" });
    expect(sprintOf([rawIssue({ category: "done" })])).toMatchObject({ progress: 100, progressMethod: "workItems" });
  });

  it("mixed statuses including unknown category", () => {
    const unknown = rawIssue();
    unknown.fields.status.statusCategory = { key: "undefined" };
    const sprint = sprintOf([rawIssue({ category: "done" }), rawIssue({ category: "in_progress" }), unknown]);
    expect(sprint).toMatchObject({ completedIssues: 1, inProgressIssues: 1, todoIssues: 0, unknownIssues: 1 });
  });

  it("counts unresolved blocked work items only", () => {
    const blockedBy = [
      { type: { name: "Blocks", inward: "is blocked by", outward: "blocks" }, inwardIssue: { id: "1", key: "SCRUM-1" } },
    ];
    const sprint = sprintOf([
      rawIssue({ links: blockedBy }),
      rawIssue({ links: blockedBy, category: "done" }),
      rawIssue(),
    ]);
    expect(sprint.blockedIssues).toBe(1);
  });

  it("partially estimated → issue count, coverage exposed, points not mixed in", () => {
    const sprint = sprintOf([
      rawIssue({ category: "done", points: 8 }),
      rawIssue({ category: "done", points: 2 }),
      rawIssue({ category: "in_progress", points: 5 }),
      rawIssue({ points: null }),
    ]);
    expect(sprint).toMatchObject({
      progress: 50,
      progressMethod: "workItems",
      estimatedIssueCount: 3,
      unestimatedIssueCount: 1,
      estimationCoverage: 75,
      storyPointsTotal: 15,
      storyPointsCompleted: 10,
    });
  });

  it("no estimates → issue count, coverage 0", () => {
    const sprint = sprintOf([rawIssue({ category: "done" }), rawIssue(), rawIssue(), rawIssue()]);
    expect(sprint).toMatchObject({
      progress: 25,
      progressMethod: "workItems",
      estimationCoverage: 0,
      storyPointsTotal: null,
    });
  });

  it("all estimated at 0 points → falls back to issue count", () => {
    const sprint = sprintOf([rawIssue({ category: "done", points: 0 }), rawIssue({ points: 0 })]);
    expect(sprint).toMatchObject({ progress: 50, progressMethod: "workItems", estimationCoverage: 100 });
  });

  it("epics and subtasks are not work items", () => {
    const sprint = sprintOf([
      rawIssue({ type: "Epic", category: "done" }),
      rawIssue({ type: "Subtask", category: "done" }),
      rawIssue({ points: 3 }),
    ]);
    expect(sprint).toMatchObject({ totalIssues: 1, progress: 0, progressMethod: "storyPoints", estimationCoverage: 100 });
    expect(sprint.issues).toHaveLength(3);
  });
});

describe("migrationSprintNumber / milestoneNumber", () => {
  it.each([
    ["MIG S1 - Discovery", 1],
    ["mig s8 - Cutover", 8],
    ["SCRUM Sprint 0", null],
    ["Platform hardening", null],
    ["MIGRATION S1", null],
  ] as const)("%s → %s", (name, expected) => {
    expect(migrationSprintNumber(name)).toBe(expected);
  });

  it.each([
    ["M1 - Discovery, Metadata & Architecture", 1],
    ["M9 - Future or Additional Development", 9],
    ["MIG S1 - Discovery", null],
    ["Migration readiness", null],
  ] as const)("%s → %s", (summary, expected) => {
    expect(milestoneNumber(summary)).toBe(expected);
  });
});

describe("normalizeMilestone", () => {
  const epic = normalizeIssue(rawIssue({ key: "SCRUM-2", type: "Epic", summary: "M2 - Zoho Schema" }), defaultOptions);
  const child = (overrides: Parameters<typeof rawIssue>[0] = {}) =>
    normalizeIssue(rawIssue({ parent: { key: "SCRUM-2" }, ...overrides }), defaultOptions);

  it("epic with no children", () => {
    expect(normalizeMilestone(epic, [epic])).toMatchObject({
      key: "SCRUM-2",
      milestoneNumber: 2,
      childIssues: [],
      totalWorkItems: 0,
      completedWorkItems: 0,
      progress: 0,
      riskCounts: { p0: 0, p1: 0 },
    });
  });

  it("epic with mixed children (other epics' issues excluded)", () => {
    const other = normalizeIssue(rawIssue({ parent: { key: "SCRUM-3" }, category: "done" }), defaultOptions);
    const milestone = normalizeMilestone(epic, [
      epic,
      child({ category: "done", points: 5 }),
      child({ category: "in_progress", points: 3 }),
      child({ points: 2 }),
      other,
    ]);
    expect(milestone).toMatchObject({
      totalWorkItems: 3,
      completedWorkItems: 1,
      storyPointsTotal: 10,
      storyPointsCompleted: 5,
      progress: 50,
      progressMethod: "storyPoints",
    });
  });

  it("epic with blockers", () => {
    const milestone = normalizeMilestone(epic, [epic, fixtureChild(fixtures.blockedIssue()), child()]);
    expect(milestone.blockedWorkItems).toBe(1);
  });

  it("counts unresolved P0/P1 risk children", () => {
    const milestone = normalizeMilestone(epic, [
      epic,
      fixtureChild(fixtures.riskP0()),
      child({ summary: "I-09 P1 - Report gaps" }),
      child({ summary: "I-02 P0 - Closed risk", category: "done" }),
    ]);
    expect(milestone.riskCounts).toEqual({ p0: 1, p1: 1 });
  });
});

function fixtureChild(raw: RawJiraIssue) {
  return normalizeIssue(raw, defaultOptions);
}

describe("normalizeProjectData", () => {
  const now = new Date("2026-10-03T12:00:00.000Z");
  const sprints = fixtures.sprints();
  const baseIssues = fixtures.issues();
  const sprintZeroKeys = ["SCRUM-10", "SCRUM-11", "SCRUM-12", "SCRUM-14", "SCRUM-15"];
  const data = normalizeProjectData(
    {
      project: fixtures.project(),
      board: fixtures.board(),
      sprints,
      projectIssues: [...baseIssues, fixtures.riskP0(), fixtures.riskP1()],
      sprintIssues: {
        1: baseIssues.filter((issue) => sprintZeroKeys.includes(issue.key)),
        // Only available via the sprint endpoint (not in project search):
        3: [fixtures.blockedIssue(), fixtures.unestimatedIssue()],
      },
    },
    defaultOptions,
    now,
  );

  it("preserves Jira's active sprint even when it is not a migration sprint", () => {
    expect(data.activeSprint?.name).toBe("SCRUM Sprint 0");
    expect(data.activeSprint?.state).toBe("active");
    expect(data.activeSprints).toHaveLength(1);
  });

  it("classifies migration sprints conservatively and orders them", () => {
    expect(data.migrationSprints.map((sprint) => sprint.migrationSprintNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(data.migrationSprints.every((sprint) => sprint.state === "future")).toBe(true);
    expect(data.sprints.map((sprint) => sprint.name)).toContain("Platform hardening");
    expect(data.migrationSprints.map((sprint) => sprint.name)).not.toContain("Platform hardening");
  });

  it("computes active sprint work from Jira data (subtask excluded)", () => {
    expect(data.activeSprint).toMatchObject({
      totalIssues: 4,
      completedIssues: 3,
      inProgressIssues: 1,
      storyPointsTotal: 17,
      storyPointsCompleted: 9,
      progressMethod: "storyPoints",
      estimationCoverage: 100,
    });
    expect(data.activeSprint?.progress).toBeCloseTo((9 / 17) * 100);
    expect(data.activeSprint?.issues).toHaveLength(5);
  });

  it("merges sprint-only issues and attaches sprint IDs", () => {
    const blocked = data.issues.find((issue) => issue.key === "SCRUM-16");
    expect(blocked).toMatchObject({ sprintId: 3, blocked: true, epicKey: "SCRUM-2" });
    const migS2 = data.sprints.find((sprint) => sprint.id === 3);
    expect(migS2).toMatchObject({
      totalIssues: 2,
      blockedIssues: 1,
      progressMethod: "workItems",
      estimationCoverage: 50,
    });
  });

  it("builds milestones from epics in M-number order", () => {
    expect(data.milestones.map((milestone) => [milestone.key, milestone.milestoneNumber])).toEqual([
      ["SCRUM-1", 1],
      ["SCRUM-2", 2],
      ["SCRUM-3", 3],
    ]);
    const m1 = data.milestones[0]!;
    expect(m1).toMatchObject({ totalWorkItems: 2, completedWorkItems: 2, progress: 100 });
    const m2 = data.milestones[1]!;
    expect(m2).toMatchObject({ blockedWorkItems: 1, riskCounts: { p0: 1, p1: 0 } });
    expect(m2.childIssues.map((issue) => issue.key).sort()).toEqual(["SCRUM-12", "SCRUM-16", "SCRUM-17", "SCRUM-20"]);
    expect(data.milestones[2]).toMatchObject({ totalWorkItems: 0, progress: 0 });
  });

  it("lists risks P0 first", () => {
    expect(data.risks.map((risk) => [risk.key, risk.riskSeverity])).toEqual([
      ["SCRUM-20", "P0"],
      ["SCRUM-22", "P1"],
    ]);
  });

  it("records metadata deterministically", () => {
    expect(data.metadata).toEqual({
      storyPointsField: "customfield_10016",
      sprintField: null,
      normalizedAt: "2026-10-03T12:00:00.000Z",
    });
    expect(data.project).toEqual({ id: "10000", key: "SCRUM", name: "Example Team" });
    expect(data.board).toEqual({ id: 1, name: "SCRUM board", type: "scrum" });
  });

  it("returns activeSprint null when Jira reports none", () => {
    const empty = normalizeProjectData(
      {
        project: fixtures.project(),
        board: fixtures.board(),
        sprints: [],
        projectIssues: [],
        sprintIssues: {},
      },
      defaultOptions,
      now,
    );
    expect(empty).toMatchObject({ activeSprint: null, sprints: [], migrationSprints: [], milestones: [], risks: [] });
  });
});

describe("sprint membership fallback", () => {
  it("uses sprint-endpoint membership when the sprint field is absent (active > future > closed)", () => {
    const shared = rawIssue({ key: "SCRUM-300" });
    const data = normalizeProjectData(
      {
        project: fixtures.project(),
        board: fixtures.board(),
        sprints: [
          { id: 5, name: "MIG S1", state: "closed" },
          { id: 6, name: "MIG S2", state: "active" },
        ],
        sprintIssues: { 5: [shared], 6: [shared], 7: [rawIssue({ key: "SCRUM-301" })] },
        projectIssues: [],
      },
      defaultOptions,
      new Date("2026-10-03T00:00:00Z"),
    );
    expect(data.issues.find((i) => i.key === "SCRUM-300")?.sprintId).toBe(6);
    expect(data.issues.find((i) => i.key === "SCRUM-301")?.sprintId).toBe(7);
  });
});

describe("sprint membership (sprintIds)", () => {
  it("reads the Sprint field when configured, else unions sprint-endpoint membership", () => {
    const issue = rawIssue({ key: "SCRUM-400", extraFields: { customfield_10020: [{ id: 3 }, { id: 1 }, { id: 3 }] } });
    const base = {
      project: fixtures.project(),
      board: fixtures.board(),
      sprints: [
        { id: 1, name: "MIG S1", state: "closed" as const },
        { id: 3, name: "MIG S2", state: "active" as const },
      ],
      sprintIssues: { 1: [issue], 3: [issue] },
      projectIssues: [],
    };
    const withField = normalizeProjectData(base, { ...defaultOptions, sprintField: "customfield_10020" }, new Date());
    expect(withField.issues[0]?.sprintIds).toEqual([1, 3]);
    const withoutField = normalizeProjectData({ ...base, sprintIssues: { 3: [issue] } }, defaultOptions, new Date());
    expect(withoutField.issues[0]?.sprintIds).toEqual([3]);
  });
});
