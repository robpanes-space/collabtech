import { describe, expect, it } from "vitest";
import { metric, percentageFromRaw, progressMetric, roundPercent, toPercentage } from "@/lib/dashboard/metrics";
import { projectProgress, projectWork } from "@/lib/dashboard/project-progress";
import { buildRiskDtos, countRisks, riskDistribution } from "@/lib/dashboard/risks";
import { statusDistribution } from "@/lib/dashboard/status-distribution";
import { workloadByAssignee } from "@/lib/dashboard/workload";
import { blockedBy, buildData, ctxFor, issue, raw } from "./helpers";

describe("percentages", () => {
  it.each([
    [0, 0],
    [100, 100],
    [50.5, 51],
    [66.6666, 67],
    [99.6, 99],
    [0.3, 1],
    [-5, 0],
    [150, 100],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])("roundPercent(%s) → %s", (input, expected) => {
    expect(roundPercent(input)).toBe(expected);
  });

  it("toPercentage keeps raw and never divides by zero", () => {
    expect(toPercentage(2, 3)).toEqual({ value: 67, raw: (2 / 3) * 100 });
    expect(toPercentage(5, 0)).toEqual({ value: 0, raw: 0 });
    expect(toPercentage(4, 2)).toEqual({ value: 100, raw: 100 });
    expect(percentageFromRaw(Number.NaN)).toEqual({ value: 0, raw: 0 });
  });

  it("metric() omits undefined description", () => {
    expect(metric(3, "jira", "Sprints")).toEqual({ value: 3, source: "jira", label: "Sprints" });
  });
});

describe("overall project progress", () => {
  const progressOf = (issues: ReturnType<typeof raw>[]) => {
    const ctx = ctxFor(buildData({ projectIssues: issues }));
    return progressMetric("Overall progress", projectProgress(ctx));
  };

  it("all estimated → story points", () => {
    const result = progressOf([raw({ category: "done", points: 3 }), raw({ points: 5 }), raw({ category: "in_progress", points: 2 })]);
    expect(result).toMatchObject({
      value: 30,
      raw: 30,
      method: "storyPoints",
      source: "storyPoints",
      estimationCoverage: 100,
      description: "Based on completed story points.",
    });
  });

  it("partially estimated → work items, coverage exposed", () => {
    const result = progressOf([
      raw({ category: "done", points: 8 }),
      raw({ points: 3 }),
      raw({ points: null }),
    ]);
    expect(result).toMatchObject({ value: 33, method: "workItems", source: "workItems", estimationCoverage: 67 });
    expect(result.description).toBe("Based on completed work items because story-point coverage is 67%.");
  });

  it("no estimates → work items, coverage 0", () => {
    expect(progressOf([raw({ category: "done" }), raw()])).toMatchObject({ value: 50, method: "workItems", estimationCoverage: 0 });
  });

  it("zero work → 0, never NaN", () => {
    expect(progressOf([])).toMatchObject({ value: 0, raw: 0, method: "workItems", estimationCoverage: null });
  });

  it("all complete → 100", () => {
    expect(progressOf([raw({ category: "done", points: 1 }), raw({ category: "done", points: 4 })])).toMatchObject({
      value: 100,
      method: "storyPoints",
    });
  });

  describe("project scope", () => {
    const epicM9 = raw({ key: "SCRUM-90", type: "Epic", summary: "M9 - Future or Additional Development" });
    const epicM2 = raw({ key: "SCRUM-2", type: "Epic", summary: "M2 - Schema" });

    it("excludes epics, subtasks, risk-register items and opt-out labels; keeps ordinary tasks", () => {
      const ctx = ctxFor(
        buildData({
          projectIssues: [
            epicM2,
            raw({ key: "SCRUM-10", type: "Task", parent: { key: "SCRUM-2" } }),
            raw({ key: "SCRUM-11", type: "Subtask", parent: { key: "SCRUM-10", type: "Task" } }),
            raw({ key: "SCRUM-12", type: "Task", summary: "I-01 P0 - Tenant Metadata Absent" }),
            raw({ key: "SCRUM-13", type: "Task", labels: ["exclude-from-progress"] }),
            raw({ key: "SCRUM-14", type: "Task", labels: ["p0"] }),
            raw({ key: "SCRUM-15", type: "Bug" as "Task" }),
          ],
        }),
      );
      expect(projectWork(ctx).map((i) => i.key)).toEqual(["SCRUM-10", "SCRUM-14", "SCRUM-15"]);
    });

    it("excludes M9 work until it enters delivery", () => {
      const ctx = ctxFor(
        buildData({
          sprints: [{ id: 7, name: "MIG S1 - Discovery", state: "active" }],
          projectIssues: [
            epicM9,
            raw({ key: "SCRUM-91", parent: { key: "SCRUM-90" } }),
            raw({ key: "SCRUM-92", parent: { key: "SCRUM-90" }, category: "in_progress" }),
          ],
          sprintIssues: { 7: [raw({ key: "SCRUM-93", parent: { key: "SCRUM-90" } })] },
        }),
      );
      expect(projectWork(ctx).map((i) => i.key).sort()).toEqual(["SCRUM-92", "SCRUM-93"]);
    });
  });
});

describe("status distribution", () => {
  it("counts mixed statuses and totals the work item count", () => {
    const issues = [issue({ category: "done" }), issue({ category: "done" }), issue({ category: "in_progress" }), issue()];
    const points = statusDistribution(issues);
    expect(points).toEqual([
      { key: "done", status: "Done", count: 2 },
      { key: "in_progress", status: "In Progress", count: 1 },
      { key: "todo", status: "To Do", count: 1 },
    ]);
    expect(points.reduce((sum, p) => sum + p.count, 0)).toBe(issues.length);
  });

  it("includes unknown only when non-zero", () => {
    const points = statusDistribution([issue(), { ...issue(), status: { id: null, name: "x", category: "unknown" } }]);
    expect(points.at(-1)).toEqual({ key: "unknown", status: "Unknown", count: 1 });
  });

  it("a blocked issue stays in its status bucket", () => {
    const points = statusDistribution([issue({ category: "in_progress", links: [blockedBy("SCRUM-1")] })]);
    expect(points.find((p) => p.key === "in_progress")?.count).toBe(1);
    expect(points.reduce((sum, p) => sum + p.count, 0)).toBe(1);
  });
});

describe("risk counts", () => {
  const issues = [
    issue({ summary: "I-01 P0 - Open" }),
    issue({ summary: "I-02 P0 - Closed", category: "done" }),
    issue({ summary: "I-08 P1 - Open", category: "in_progress" }),
    issue({ labels: ["risk-p1"], category: "done" }),
    issue({ type: "Task", summary: "Ordinary task" }),
  ];

  it("counts open/resolved P0 and P1; ignores non-risk tasks", () => {
    expect(countRisks(issues)).toEqual({ openP0: 1, openP1: 1, resolvedP0: 1, resolvedP1: 1 });
    expect(riskDistribution(countRisks(issues))).toEqual([
      { severity: "P0", open: 1, resolved: 1 },
      { severity: "P1", open: 1, resolved: 1 },
    ]);
  });

  it("risk DTOs: open first, P0 first, with blocked work items", () => {
    const risk = issue({ key: "SCRUM-20", summary: "I-01 P0 - Tenant Metadata Absent" });
    const work = issue({ key: "SCRUM-16", links: [blockedBy("SCRUM-20")] });
    const dtos = buildRiskDtos([...issues, risk, work]);
    expect(dtos).toHaveLength(4 + 1);
    expect(dtos.map((d) => [d.severity, d.resolved])).toEqual([
      ["P0", false],
      ["P0", false],
      ["P1", false],
      ["P0", true],
      ["P1", true],
    ]);
    expect(dtos.find((d) => d.key === "SCRUM-20")).toMatchObject({ registerId: "I-01", blocksWorkItems: ["SCRUM-16"] });
  });
});

describe("workload", () => {
  const alex = { accountId: "a-1", displayName: "Alex Rivera" };
  const sam = { accountId: "a-2", displayName: "Sam Chen" };

  it("groups open work by assignee, excludes done, groups unassigned, counts blocked", () => {
    const entries = workloadByAssignee([
      issue({ assignee: alex, category: "in_progress", points: 3 }),
      issue({ assignee: alex, links: [blockedBy("SCRUM-1")], points: 2 }),
      issue({ assignee: alex, category: "done", points: 8 }),
      issue({ assignee: sam }),
      issue(),
      issue(),
    ]);
    expect(entries).toEqual([
      { key: "assignee-1", unassigned: false, displayName: "Alex Rivera", openWorkItems: 2, inProgressWorkItems: 1, blockedWorkItems: 1, storyPointsOpen: 5 },
      { key: "unassigned", unassigned: true, displayName: "Unassigned", openWorkItems: 2, inProgressWorkItems: 0, blockedWorkItems: 0, storyPointsOpen: null },
      { key: "assignee-2", unassigned: false, displayName: "Sam Chen", openWorkItems: 1, inProgressWorkItems: 0, blockedWorkItems: 0, storyPointsOpen: null },
    ]);
  });

  it("never exposes Jira account IDs", () => {
    expect(JSON.stringify(workloadByAssignee([issue({ assignee: alex })]))).not.toContain("a-1");
  });

  it("returns nothing when all work is done", () => {
    expect(workloadByAssignee([issue({ category: "done" })])).toEqual([]);
  });
});
