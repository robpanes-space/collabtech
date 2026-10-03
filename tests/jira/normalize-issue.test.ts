import { describe, expect, it } from "vitest";
import {
  normalizeDateOnly,
  normalizeIssue,
  normalizeIssueLinks,
  normalizeRiskSeverity,
  normalizeStatus,
  normalizeStoryPoints,
  normalizeTimestamp,
} from "@/lib/jira/normalize";
import { defaultOptions, fixtures, rawIssue } from "../fixtures/jira";

describe("normalizeStatus", () => {
  it.each([
    ["new", "todo"],
    ["indeterminate", "in_progress"],
    ["done", "done"],
    ["undefined", "unknown"],
    ["something-else", "unknown"],
    [null, "unknown"],
    [undefined, "unknown"],
  ] as const)("%s → %s", (input, expected) => {
    expect(normalizeStatus(input)).toBe(expected);
  });

  it("uses the category, not the status name", () => {
    const issue = normalizeIssue(fixtures.issues().find((i) => i.key === "SCRUM-12")!, defaultOptions);
    expect(issue.status).toEqual({ id: "10010", name: "QA Review", category: "in_progress" });
  });
});

describe("normalizeStoryPoints", () => {
  it.each([
    [8, 8],
    [3.5, 3.5],
    [0, 0],
    [null, null],
    [undefined, null],
    ["8", null],
    [-1, null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    [{ value: 8 }, null],
  ])("%s → %s", (input, expected) => {
    expect(normalizeStoryPoints(input)).toBe(expected);
  });

  it("reads the configured field and tolerates its absence", () => {
    expect(normalizeIssue(rawIssue({ points: 5 }), defaultOptions).storyPoints).toBe(5);
    expect(normalizeIssue(rawIssue(), defaultOptions).storyPoints).toBeNull();
    expect(normalizeIssue(fixtures.unestimatedIssue(), defaultOptions).storyPoints).toBeNull();
    expect(normalizeIssue(rawIssue({ points: 5 }), { storyPointsField: null }).storyPoints).toBeNull();
  });
});

describe("normalizeRiskSeverity", () => {
  it("custom risk field P0 (string, option object, array)", () => {
    expect(normalizeRiskSeverity({ riskFieldValue: "P0" })).toEqual({ severity: "P0", source: "riskField" });
    expect(normalizeRiskSeverity({ riskFieldValue: { value: "P1 - High" } })).toEqual({
      severity: "P1",
      source: "riskField",
    });
    expect(normalizeRiskSeverity({ riskFieldValue: [{ value: "P1" }, { value: "P0" }] }).severity).toBe("P0");
  });

  it("priority P0", () => {
    expect(normalizeRiskSeverity({ priorityName: "P0" })).toEqual({ severity: "P0", source: "priority" });
    expect(normalizeRiskSeverity({ priorityName: "P1 - Major" }).severity).toBe("P1");
  });

  it("does not treat standard priorities as P0/P1", () => {
    expect(normalizeRiskSeverity({ priorityName: "Highest" }).severity).toBeNull();
    expect(normalizeRiskSeverity({ priorityName: "High" }).severity).toBeNull();
  });

  it.each([
    [["p0"], "P0"],
    [["P0"], "P0"],
    [["priority-p0"], "P0"],
    [["risk-p0"], "P0"],
    [["p1"], "P1"],
    [["risk-p1"], "P1"],
    [["priority-p1"], "P1"],
    [["risk-p1", "p0"], "P0"],
  ] as const)("label %j → %s", (labels, expected) => {
    expect(normalizeRiskSeverity({ labels })).toEqual({ severity: expected, source: "label" });
  });

  it("ignores labels that merely contain p0/p1", () => {
    expect(normalizeRiskSeverity({ labels: ["p01", "sp0", "risk", "p0-later"] }).severity).toBeNull();
  });

  it.each([
    ["I-01 P0 - Tenant Metadata Absent", "P0"],
    ["I-08 P1 - Rules and Reports Incomplete", "P1"],
    ["  I-10 P1: Report parity", "P1"],
  ] as const)("summary %s → %s", (summary, expected) => {
    expect(normalizeRiskSeverity({ summary })).toEqual({ severity: expected, source: "summary" });
  });

  it.each([
    "Map Account fields to Zoho",
    "Upgrade to API v2 for p0 support",
    "Fix SP01 export",
    "I-01 P01 - not a severity",
    "Review P0 risks with client",
    "Mapp0 field",
  ])("unrelated summary %s → null", (summary) => {
    expect(normalizeRiskSeverity({ summary })).toEqual({ severity: null, source: null });
  });

  it("applies precedence: risk field > priority > labels > summary", () => {
    expect(
      normalizeRiskSeverity({ riskFieldValue: "P1", priorityName: "P0", labels: ["p0"], summary: "I-01 P0 - x" }),
    ).toEqual({ severity: "P1", source: "riskField" });
    expect(normalizeRiskSeverity({ priorityName: "P1", labels: ["p0"], summary: "I-01 P0 - x" })).toEqual({
      severity: "P1",
      source: "priority",
    });
    expect(normalizeRiskSeverity({ labels: ["risk-p1"], summary: "I-01 P0 - x" })).toEqual({
      severity: "P1",
      source: "label",
    });
  });

  it("detects risks in fixtures and honours a configured risk field", () => {
    expect(normalizeIssue(fixtures.riskP0(), defaultOptions)).toMatchObject({
      riskSeverity: "P0",
      riskSeveritySource: "summary",
    });
    expect(normalizeIssue(fixtures.riskP1(), defaultOptions)).toMatchObject({
      riskSeverity: "P1",
      riskRegisterId: "I-08",
    });
    expect(normalizeIssue(rawIssue({ labels: ["p0"] }), defaultOptions).riskRegisterId).toBeNull();
    const withField = rawIssue({ extraFields: { customfield_20000: { value: "P0" } } });
    expect(
      normalizeIssue(withField, { ...defaultOptions, riskField: "customfield_20000" }).riskSeveritySource,
    ).toBe("riskField");
  });
});

describe("normalizeIssueLinks / blockers", () => {
  const blocks = { name: "Blocks", inward: "is blocked by", outward: "blocks" };
  const link = (direction: "inwardIssue" | "outwardIssue", key: string, category = "new", type = blocks) => ({
    type,
    [direction]: { id: "1", key, fields: { status: { name: "x", statusCategory: { key: category } } } },
  });

  it("'is blocked by' (inwardIssue) blocks the issue", () => {
    expect(normalizeIssueLinks([link("inwardIssue", "SCRUM-20")])).toEqual(["SCRUM-20"]);
  });

  it("'blocks' (outwardIssue) does not block the issue", () => {
    expect(normalizeIssueLinks([link("outwardIssue", "SCRUM-12")])).toEqual([]);
  });

  it("collects multiple blockers, deduplicated", () => {
    expect(
      normalizeIssueLinks([
        link("inwardIssue", "SCRUM-20"),
        link("inwardIssue", "SCRUM-30", "indeterminate"),
        link("inwardIssue", "SCRUM-20"),
      ]),
    ).toEqual(["SCRUM-20", "SCRUM-30"]);
  });

  it("ignores resolved blockers", () => {
    expect(normalizeIssueLinks([link("inwardIssue", "SCRUM-21", "done")])).toEqual([]);
  });

  it("handles no links", () => {
    expect(normalizeIssueLinks([])).toEqual([]);
    expect(normalizeIssueLinks(null)).toEqual([]);
    expect(normalizeIssueLinks(undefined)).toEqual([]);
  });

  it("ignores unrelated link types", () => {
    const relates = { name: "Relates", inward: "relates to", outward: "relates to" };
    const clones = { name: "Cloners", inward: "is cloned by", outward: "clones" };
    expect(
      normalizeIssueLinks([link("inwardIssue", "SCRUM-11", "new", relates), link("inwardIssue", "SCRUM-9", "new", clones)]),
    ).toEqual([]);
  });

  it("recognises custom blocker link types by their inward description", () => {
    const custom = { name: "Dependency", inward: "is blocked by", outward: "blocks" };
    expect(normalizeIssueLinks([link("inwardIssue", "SCRUM-40", "new", custom)])).toEqual(["SCRUM-40"]);
  });

  it("blocked-issue fixture: one open blocker; resolved, outward and relates ignored", () => {
    const issue = normalizeIssue(fixtures.blockedIssue(), defaultOptions);
    expect(issue.blockers).toEqual(["SCRUM-20"]);
    expect(issue.blocked).toBe(true);
  });

  it("P0 label, age, or incompleteness alone never mark an issue blocked", () => {
    const issue = normalizeIssue(rawIssue({ labels: ["p0"], category: "in_progress" }), defaultOptions);
    expect(issue.blocked).toBe(false);
  });

  it("configured blocked status marks the issue blocked", () => {
    const raw = rawIssue();
    raw.fields.status.name = "Blocked";
    expect(normalizeIssue(raw, defaultOptions).blocked).toBe(false);
    const issue = normalizeIssue(raw, { ...defaultOptions, blockedStatusNames: ["blocked"] });
    expect(issue).toMatchObject({ blocked: true, blockedByStatus: true, blockers: [] });
  });
});

describe("hierarchy", () => {
  it("story under an Epic → epicKey", () => {
    const issue = normalizeIssue(rawIssue({ parent: { key: "SCRUM-2", type: "Epic" } }), defaultOptions);
    expect(issue).toMatchObject({ epicKey: "SCRUM-2", parentKey: null });
  });

  it("subtask under a Story → parentKey, no invented epic", () => {
    const issue = normalizeIssue(
      rawIssue({ type: "Subtask", parent: { key: "SCRUM-12", type: "Story" } }),
      defaultOptions,
    );
    expect(issue).toMatchObject({ parentKey: "SCRUM-12", epicKey: null, isSubtask: true });
  });

  it("issue without parent", () => {
    expect(normalizeIssue(rawIssue(), defaultOptions)).toMatchObject({ parentKey: null, epicKey: null });
  });

  it("unknown parent type → parentKey only", () => {
    const issue = normalizeIssue(rawIssue({ parent: { key: "SCRUM-99", type: null } }), defaultOptions);
    expect(issue).toMatchObject({ parentKey: "SCRUM-99", epicKey: null });
  });

  it("legacy Epic Link is used only when no parent exists", () => {
    const options = { ...defaultOptions, epicLinkField: "customfield_10014" };
    const legacyOnly = rawIssue({ extraFields: { customfield_10014: "SCRUM-3" } });
    expect(normalizeIssue(legacyOnly, options).epicKey).toBe("SCRUM-3");
    const both = rawIssue({ parent: { key: "SCRUM-2" }, extraFields: { customfield_10014: "SCRUM-3" } });
    expect(normalizeIssue(both, options).epicKey).toBe("SCRUM-2");
  });

  it("detects epics", () => {
    expect(normalizeIssue(rawIssue({ type: "Epic" }), defaultOptions).isEpic).toBe(true);
  });
});

describe("dates and full issue", () => {
  it("timestamps become UTC ISO; invalid → null", () => {
    expect(normalizeTimestamp("2026-10-01T10:00:00.000+0800")).toBe("2026-10-01T02:00:00.000Z");
    expect(normalizeTimestamp("not a date")).toBeNull();
    expect(normalizeTimestamp("")).toBeNull();
    expect(normalizeTimestamp(null)).toBeNull();
  });

  it("due dates stay calendar dates", () => {
    expect(normalizeDateOnly("2026-10-10")).toBe("2026-10-10");
    expect(normalizeDateOnly("2026-10-10T00:00:00Z")).toBeNull();
    expect(normalizeDateOnly("2026-13-45")).toBeNull();
    expect(normalizeDateOnly(null)).toBeNull();
  });

  it("invalid timestamps do not throw", () => {
    const issue = normalizeIssue(rawIssue({ extraFields: { created: "garbage", updated: null } }), defaultOptions);
    expect(issue).toMatchObject({ createdAt: null, updatedAt: null });
  });

  it("normalizes a full fixture issue", () => {
    const raw = fixtures.issues().find((i) => i.key === "SCRUM-12")!;
    expect(normalizeIssue(raw, defaultOptions)).toEqual({
      id: "10012",
      key: "SCRUM-12",
      summary: "Map Account fields to Zoho modules",
      issueType: { id: "10004", name: "Story", hierarchyLevel: 0 },
      isEpic: false,
      isSubtask: false,
      status: { id: "10010", name: "QA Review", category: "in_progress" },
      assignee: { accountId: "5f0000000000000000000003", displayName: "Former user", active: false },
      priority: { id: "3", name: "Medium" },
      storyPoints: 8,
      parentKey: null,
      epicKey: "SCRUM-2",
      labels: [],
      createdAt: "2026-09-20T02:15:00.000Z",
      updatedAt: "2026-10-01T08:40:12.345Z",
      resolvedAt: null,
      dueDate: "2026-10-10",
      blockers: [],
      blocked: false,
      blockedByStatus: false,
      riskSeverity: null,
      riskSeveritySource: null,
      riskRegisterId: null,
      sprintId: 1,
      sprintIds: [],
    });
  });

  it("unassigned issues have a null assignee", () => {
    expect(normalizeIssue(rawIssue(), defaultOptions).assignee).toBeNull();
  });
});
