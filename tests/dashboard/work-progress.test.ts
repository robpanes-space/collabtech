import { describe, expect, it } from "vitest";
import { isWorkItem, summarizeWork } from "@/lib/dashboard/work-progress";
import { normalizeIssue } from "@/lib/jira/normalize";
import { defaultOptions, rawIssue } from "../fixtures/jira";

const issue = (overrides: Parameters<typeof rawIssue>[0] = {}) => normalizeIssue(rawIssue(overrides), defaultOptions);

describe("isWorkItem", () => {
  it("excludes epics and subtasks", () => {
    expect(isWorkItem(issue({ type: "Story" }))).toBe(true);
    expect(isWorkItem(issue({ type: "Task" }))).toBe(true);
    expect(isWorkItem(issue({ type: "Epic" }))).toBe(false);
    expect(isWorkItem(issue({ type: "Subtask" }))).toBe(false);
  });
});

describe("summarizeWork", () => {
  it("is deterministic and never mixes points with counts", () => {
    const issues = [issue({ category: "done", points: 13 }), issue({ points: null })];
    const first = summarizeWork(issues);
    expect(first).toEqual(summarizeWork(issues));
    expect(first).toMatchObject({ progress: 50, progressMethod: "workItems", estimationCoverage: 50 });
  });

  it("supports decimal story points", () => {
    const summary = summarizeWork([issue({ category: "done", points: 1.5 }), issue({ points: 0.5 })]);
    expect(summary).toMatchObject({ storyPointsTotal: 2, storyPointsCompleted: 1.5, progress: 75 });
  });
});
