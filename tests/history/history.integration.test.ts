import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHistoryDto } from "@/lib/history/build-history";
import { normalizeProjectData } from "@/lib/jira/normalize";
import type { RawChangelogItem, RawIssueChangelog, RawStatusCatalog } from "@/lib/jira/history-schemas";
import { defaultOptions, fixtures, rawIssue } from "../fixtures/jira";

/**
 * Full pipeline: raw Jira issues + raw bulk changelogs + sprints → normalize → reconstruct →
 * HistoryDto. Live-like shape: MIG S1 active Oct 5–9, MIG S2 future without dates.
 */
const NOW = new Date("2026-10-08T12:00:00.000Z");
const SPRINT_FIELD = "customfield_10020";
const STATUS: RawStatusCatalog = [
  { id: "10000", name: "To Do", statusCategory: { key: "new" } },
  { id: "10001", name: "In Progress", statusCategory: { key: "indeterminate" } },
  { id: "10004", name: "Done", statusCategory: { key: "done" } },
];
const status = (id: string, category: string) => ({ id, name: id, statusCategory: { key: category } });

function item(key: string, created: string, statusId: string, category: string, sprintIds: number[], extra: Record<string, unknown> = {}) {
  const raw = rawIssue({
    key,
    summary: (extra.summary as string) ?? `Story ${key}`,
    parent: { key: "SCRUM-5" },
    extraFields: { created, [SPRINT_FIELD]: sprintIds.map((id) => ({ id })), ...extra },
  });
  raw.fields.status = status(statusId, category);
  return { ...raw, id: `id-${key}` };
}

const ms = (iso: string) => Date.parse(iso);
const history = (id: string, created: string, items: RawChangelogItem[]) => ({
  id,
  created: ms(created),
  author: { accountId: "5f00", displayName: "Alex Rivera" },
  items,
});
const sprintItem = (from: string, to: string) => ({ field: "Sprint", fieldId: SPRINT_FIELD, from, fromString: "", to, toString: "" });
const statusItem = (from: string, to: string) => ({ field: "status", fieldId: "status", from, fromString: from, to, toString: to });

const epic = rawIssue({ key: "SCRUM-5", type: "Epic", summary: "M1 - Discovery" });
const issues = [
  epic,
  item("SCRUM-13", "2026-10-01T00:00:00Z", "10004", "done", [1]),
  item("SCRUM-14", "2026-10-01T00:00:00Z", "10001", "indeterminate", [1]),
  item("SCRUM-15", "2026-10-01T00:00:00Z", "10000", "new", [1]),
  item("SCRUM-16", "2026-10-06T09:00:00Z", "10000", "new", [1]), // created mid-sprint
  item("SCRUM-40", "2026-10-01T00:00:00Z", "10004", "done", [], { summary: "I-01 P0 - Tenant Metadata Absent" }),
];
const changelogs: RawIssueChangelog[] = [
  { issueId: "id-SCRUM-13", changeHistories: [history("1", "2026-10-02T10:00:00Z", [sprintItem("", "1")]), history("2", "2026-10-06T15:00:00Z", [statusItem("10000", "10004")])] },
  {
    issueId: "id-SCRUM-14",
    changeHistories: [
      history("3", "2026-10-02T10:00:00Z", [sprintItem("", "1")]),
      history("4", "2026-10-06T10:00:00Z", [statusItem("10000", "10004")]),
      history("5", "2026-10-07T10:00:00Z", [statusItem("10004", "10001")]),
    ],
  },
  { issueId: "id-SCRUM-15", changeHistories: [history("6", "2026-10-02T10:00:00Z", [sprintItem("", "1")])] },
  { issueId: "id-SCRUM-16", changeHistories: [history("7", "2026-10-06T09:00:00Z", [sprintItem("", "1")])] },
  { issueId: "id-SCRUM-40", changeHistories: [history("8", "2026-10-07T12:00:00Z", [statusItem("10000", "10004")])] },
];

const data = normalizeProjectData(
  {
    project: fixtures.project(),
    board: fixtures.board(),
    sprints: [
      { id: 1, name: "MIG S1 - Discovery", state: "active", startDate: "2026-10-05T00:00:00.000Z", endDate: "2026-10-09T23:00:00.000Z" },
      { id: 2, name: "MIG S2 - Schema Mapping", state: "future" },
    ],
    sprintIssues: { 1: issues.slice(1, 5) },
    projectIssues: issues,
  },
  { ...defaultOptions, sprintField: SPRINT_FIELD },
  NOW,
);

const dto = buildHistoryDto({
  data,
  changelogs,
  statusCatalog: STATUS,
  now: NOW,
  timeZone: "UTC",
  cacheSeconds: 300,
  jiraBrowseBaseUrl: "https://site.example.atlassian.net/browse/",
});

describe("history DTO (fixture pipeline)", () => {
  it("reconstructs the active migration sprint burndown with scope changes", () => {
    const burndown = dto.activeSprintBurndown!;
    expect(burndown.name).toBe("MIG S1 - Discovery");
    expect(burndown.burndown.workItems.available).toBe(true);
    expect(burndown.burndown.workItems.points.map((p) => [p.date, p.remainingWorkItems, p.scopeWorkItems])).toEqual([
      ["2026-10-05", 3, 3],
      ["2026-10-06", 2, 4], // SCRUM-16 added; SCRUM-13 and SCRUM-14 done; reopened next day
      ["2026-10-07", 3, 4],
      ["2026-10-08", 3, 4],
      ["2026-10-09", null, null],
    ]);
    expect(burndown).toMatchObject({ committedWorkItems: 3, addedWorkItems: 1, removedWorkItems: 0, confidence: { level: "high" } });
    expect(burndown.burndown.storyPoints).toMatchObject({ available: false, reason: "ESTIMATION_INCOMPLETE" });
  });

  it("reports the undated future sprint as needing dates", () => {
    expect(dto.sprints.find((s) => s.name.startsWith("MIG S2"))?.availability).toMatchObject({ reason: "SPRINT_DATES_REQUIRED" });
  });

  it("builds recent activity (newest first) including risk resolution and reopen", () => {
    expect(dto.recentActivity.map((a) => [a.type, a.title])).toEqual([
      ["risk_resolved", "P0 risk I-01 resolved"],
      ["reopened", "SCRUM-14 reopened"],
      ["completed", "SCRUM-13 completed"],
      ["completed", "SCRUM-14 completed"],
      ["sprint_added", "SCRUM-16 added to MIG S1 - Discovery"],
      // Sprint planning on Oct 2 (same person, same sprint, same minute) → one event.
      ["sprint_added", "3 work items added to MIG S1 - Discovery"],
    ]);
    expect(dto.recentActivity[0]).toMatchObject({ title: "P0 risk I-01 resolved", jiraUrl: "https://site.example.atlassian.net/browse/SCRUM-40" });
  });

  it("builds the project trend for the current committed scope", () => {
    expect(dto.projectTrend).toMatchObject({ available: true, unit: "workItems", scopeBasis: "current_committed_scope" });
    expect(dto.projectTrend.points.at(-1)).toMatchObject({ date: "2026-10-08", completed: 1, total: 4, progress: 25 });
  });

  it("throughput needs more than one week; velocity stays unavailable without estimates", () => {
    expect(dto.throughput).toMatchObject({ available: true });
    expect(dto.availability).toEqual({
      recentActivity: true,
      projectTrend: true,
      sprintBurndown: true,
      throughput: true,
      velocity: false,
    });
  });

  it("emits human-readable warnings", () => {
    expect(dto.warnings.map((w) => w.code)).toEqual(["SPRINT_DATES_REQUIRED", "STORY_POINT_HISTORY_INCOMPLETE"]);
  });

  it("contains no raw changelog payloads, emails or account IDs", () => {
    const json = JSON.stringify(dto);
    expect(json).not.toMatch(/changeHistories|issueChangeLogs|accountId|5f00|@|customfield_/);
  });
});

describe("failure isolation", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/history/history-service");
  });

  it("history failure renders a compact notice instead of breaking the page", async () => {
    vi.doMock("@/lib/history/history-service", () => ({
      loadHistory: async () => ({ ok: false, error: { code: "JIRA_UNAVAILABLE", message: "Historical analytics are temporarily unavailable." } }),
    }));
    const { OverviewHistory, SprintHistorySection } = await import("@/components/history/history-sections");
    const overview = renderToStaticMarkup(await OverviewHistory());
    expect(overview).toContain("Historical analytics temporarily unavailable");
    expect(overview).toContain("Current project status above is unaffected");
    expect(overview).not.toMatch(/JIRA_UNAVAILABLE|stack/);
    expect(renderToStaticMarkup(await SprintHistorySection({ sprintId: 1 }))).toContain("Historical analytics temporarily unavailable");
  });

  it("renders the history sections from a real DTO", async () => {
    const { OverviewHistoryContent } = await import("@/components/history/history-sections");
    const html = renderToStaticMarkup(OverviewHistoryContent({ history: dto, now: NOW }));
    expect(html).toContain("MIG S1 - Discovery burndown");
    expect(html).toContain("Recent activity");
    expect(html).toContain("P0 risk I-01 resolved");
    expect(html).toContain("Project progress over time");
    expect(html).toContain('href="https://site.example.atlassian.net/browse/SCRUM-40"');
  });
});

describe("completions (report 'completed this period')", () => {
  it("lists final completions in the last 30 days, newest first; reopened-and-not-redone excluded", () => {
    expect(dto.completions.map((c) => [c.issueKey, c.kind, c.riskSeverity, c.milestoneLabel, c.completedAt])).toEqual([
      ["SCRUM-40", "risk", "P0", "M1", "2026-10-07T12:00:00.000Z"], // fixture parents every item to M1
      ["SCRUM-13", "work", null, "M1", "2026-10-06T15:00:00.000Z"],
    ]);
    expect(dto.completions[1]?.jiraUrl).toBe("https://site.example.atlassian.net/browse/SCRUM-13");
  });
});
