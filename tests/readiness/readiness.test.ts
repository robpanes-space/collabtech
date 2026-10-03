import { describe, expect, it } from "vitest";
import { summarizeWork } from "@/lib/dashboard/work-progress";
import { buildHistoryDto } from "@/lib/history/build-history";
import { normalizeIssue } from "@/lib/jira/normalize";
import type { RawJiraIssue, RawJiraSprint } from "@/lib/jira/schemas";
import { buildReadinessDto, overallStatus } from "@/lib/readiness/build-readiness";
import type { ReadinessInput } from "@/lib/readiness/context";
import type { ProjectReadinessDto, ReadinessCheckCode } from "@/lib/readiness/types";
import { defaultOptions } from "../fixtures/jira";
import { blockedBy, buildData, raw } from "../dashboard/helpers";

const NOW = new Date("2026-10-07T12:00:00.000Z");
const STATUSES = [
  { id: "1", name: "To Do", categoryKey: "new" },
  { id: "2", name: "In Progress", categoryKey: "indeterminate" },
  { id: "3", name: "Blocked", categoryKey: "indeterminate" },
  { id: "4", name: "Done", categoryKey: "done" },
];
const S1: RawJiraSprint = { id: 1, name: "MIG S1 - Discovery", state: "active", startDate: "2026-10-05T00:00:00.000Z", endDate: "2026-10-16T00:00:00.000Z" };
const S2: RawJiraSprint = { id: 2, name: "MIG S2 - Schema", state: "future", startDate: "2026-10-19T00:00:00.000Z", endDate: "2026-10-30T00:00:00.000Z" };

const epic = raw({ key: "SCRUM-5", type: "Epic", summary: "M1 - Discovery" });
const story = (key: string, overrides: Parameters<typeof raw>[0] = {}) => raw({ key, parent: { key: "SCRUM-5" }, points: 3, ...overrides });

function input(options: {
  sprints?: RawJiraSprint[];
  issues?: RawJiraIssue[];
  sprintIssues?: Record<number, RawJiraIssue[]>;
  storyPointsField?: string | null;
  history?: "build" | null;
  blockedStatusNames?: string[];
  statuses?: ReadinessInput["projectStatuses"];
  now?: Date;
  authStatus?: ReadinessInput["config"]["authStatus"];
  timeZone?: string | null;
}): ReadinessInput {
  const issues = options.issues ?? [epic, story("SCRUM-13"), story("SCRUM-14")];
  const now = options.now ?? NOW;
  const data = buildData({
    sprints: options.sprints ?? [S1, S2],
    projectIssues: issues,
    sprintIssues: options.sprintIssues ?? { 1: issues.filter((i) => i.key !== "SCRUM-5") },
    storyPointsField: options.storyPointsField,
    sprintField: "customfield_10020",
  });
  const history =
    options.history === null
      ? null
      : buildHistoryDto({
          data,
          changelogs: [],
          statusCatalog: [],
          now,
          timeZone: "UTC",
          cacheSeconds: 300,
          jiraBrowseBaseUrl: null,
        });
  return {
    data,
    history,
    projectStatuses: options.statuses === undefined ? STATUSES : options.statuses,
    config: {
      blockedStatusNames: options.blockedStatusNames ?? [],
      authStatus: options.authStatus ?? "enabled",
      timeZone: options.timeZone === undefined ? "Asia/Manila" : options.timeZone,
      timeZoneValid: options.timeZone !== "Mars/Olympus",
      jiraLinksEnabled: true,
    },
    now,
    issueUrl: (key) => `https://site.example/browse/${key}`,
  };
}

const find = (dto: ProjectReadinessDto, code: ReadinessCheckCode) =>
  dto.sections.flatMap((s) => s.checks).find((c) => c.code === code)!;

describe("project readiness", () => {
  it("clean project → ready", () => {
    const dto = buildReadinessDto(input({ statuses: STATUSES.filter((s) => s.name !== "Blocked") }));
    const notPassing = dto.sections
      .flatMap((s) => s.checks)
      .filter((c) => c.importance !== "informational" && c.status !== "pass" && c.status !== "not_applicable");
    expect(notPassing.map((c) => [c.code, c.message])).toEqual([]);
    expect(dto.overall.status).toBe("ready");
    expect(dto.overall.summary).toBe("Jira data is ready for client reporting.");
    expect(find(dto, "ACTIVE_MIGRATION_SPRINT")).toMatchObject({ status: "pass", message: "MIG S1 - Discovery is active." });
  });

  it("missing dates: future sprints → warning with scheduled count; active sprint → fail", () => {
    const future = buildReadinessDto(input({ sprints: [S1, { ...S2, startDate: null, endDate: null }] }));
    expect(find(future, "SPRINT_DATES")).toMatchObject({
      status: "warning",
      message: "1 of 2 migration sprints scheduled. 1 upcoming sprint without dates.",
      action: "Add planned start and end dates in Jira to MIG S2 - Schema.",
    });
    const active = buildReadinessDto(input({ sprints: [{ ...S1, endDate: S1.startDate }, S2] }));
    expect(find(active, "SPRINT_DATES").status).toBe("fail");
    expect(active.overall.status).toBe("attention");
  });

  it("empty active Jira sprint → warning naming it (not auto-closed)", () => {
    const dto = buildReadinessDto(input({ sprints: [S1, S2, { id: 9, name: "SCRUM Sprint 0", state: "active" }] }));
    expect(find(dto, "EMPTY_ACTIVE_SPRINT")).toMatchObject({
      status: "warning",
      message: "SCRUM Sprint 0 is active but contains no work items.",
      action: "Close SCRUM Sprint 0 in Jira if it is no longer needed.",
    });
    expect(find(dto, "ACTIVE_MIGRATION_SPRINT").status).toBe("pass");
    expect(dto.facts.emptyActiveSprints).toEqual(["SCRUM Sprint 0"]);
  });

  it("multiple active migration sprints → warning", () => {
    const dto = buildReadinessDto(input({ sprints: [S1, { ...S2, state: "active" }] }));
    expect(find(dto, "ACTIVE_MIGRATION_SPRINT").status).toBe("warning");
  });

  it("no active migration sprint: not yet expected → n/a; expected → fail (blocked); none at all → fail", () => {
    const notYet = buildReadinessDto(input({ sprints: [{ ...S1, state: "future" }, S2], now: new Date("2026-10-01T00:00:00Z") }));
    expect(find(notYet, "ACTIVE_MIGRATION_SPRINT").status).toBe("not_applicable");
    const expected = buildReadinessDto(input({ sprints: [{ ...S1, state: "closed" }, S2] }));
    expect(find(expected, "ACTIVE_MIGRATION_SPRINT").status).toBe("fail");
    expect(expected.overall.status).toBe("blocked");
    const none = buildReadinessDto(input({ sprints: [{ id: 9, name: "SCRUM Sprint 0", state: "active" }] }));
    expect(find(none, "ACTIVE_MIGRATION_SPRINT")).toMatchObject({ status: "fail", message: "No migration sprints were found on the board." });
  });

  it("an unrelated active sprint never counts as the migration sprint", () => {
    const dto = buildReadinessDto(input({ sprints: [{ ...S1, state: "closed" }, { id: 9, name: "SCRUM Sprint 0", state: "active" }] }));
    expect(find(dto, "ACTIVE_MIGRATION_SPRINT").status).toBe("fail");
  });

  it("0% estimation → warning explaining the work-item fallback; 100% → pass; no field → warning", () => {
    const none = buildReadinessDto(input({ issues: [epic, story("SCRUM-13", { points: null }), story("SCRUM-14", { points: null })] }));
    expect(find(none, "STORY_POINT_COVERAGE")).toMatchObject({
      status: "warning",
      message: "0 of 2 committed work items estimated (0%). Progress currently uses work items because estimation coverage is incomplete.",
    });
    expect(none.facts).toMatchObject({ estimationCoverage: 0, progressMethod: "workItems" });
    const full = buildReadinessDto(input({}));
    expect(find(full, "STORY_POINT_COVERAGE")).toMatchObject({ status: "pass" });
    expect(full.facts.progressMethod).toBe("storyPoints");
    const noField = buildReadinessDto(input({ storyPointsField: null }));
    expect(find(noField, "STORY_POINT_COVERAGE").status).toBe("warning");
    expect(find(noField, "STORY_POINT_FIELD").status).toBe("warning");
  });

  it("open P0 risks → attention (never hidden); no risks → pass", () => {
    const withRisk = buildReadinessDto(input({ issues: [epic, story("SCRUM-13"), raw({ key: "SCRUM-38", summary: "I-01 P0 - Tenant Metadata Absent" })] }));
    expect(find(withRisk, "OPEN_P0_RISKS")).toMatchObject({ status: "warning", message: "1 open P0 risk is blocking delivery." });
    expect(find(withRisk, "OPEN_P0_RISKS").items.map((i) => i.key)).toEqual(["SCRUM-38"]);
    expect(withRisk.overall.status).toBe("attention");
    expect(find(buildReadinessDto(input({})), "OPEN_P0_RISKS")).toMatchObject({ status: "pass", message: "No open P0 risks." });
  });

  it("unclassified committed work (no milestone) → warning with items; excluded work is listed separately", () => {
    const issues = [
      epic,
      story("SCRUM-13"),
      raw({ key: "SCRUM-3", summary: "Task 3", category: "in_progress", points: 1 }),
      raw({ key: "SCRUM-50", summary: "Acceptance Controls", labels: ["project-control"], points: 1 }),
      raw({ key: "SCRUM-51", summary: "Internal", labels: ["exclude-from-progress"], points: 1 }),
    ];
    const dto = buildReadinessDto(input({ issues }));
    expect(find(dto, "UNCLASSIFIED_WORK")).toMatchObject({
      status: "warning",
      message: "1 committed work item is not assigned to a migration milestone but counts toward progress.",
    });
    expect(find(dto, "UNCLASSIFIED_WORK").items.map((i) => i.key)).toEqual(["SCRUM-3"]);
    expect(find(dto, "EXCLUDED_WORK").items.map((i) => i.key)).toEqual(["SCRUM-50", "SCRUM-51"]);
    expect(dto.facts).toMatchObject({ includedWorkItems: 2, excludedWorkItems: 2, unclassifiedWorkItems: 1 });
  });
});

describe("blocked status configuration readiness", () => {
  it("Jira has a Blocked status but detection is not configured → informational warning", () => {
    const dto = buildReadinessDto(input({}));
    expect(find(dto, "BLOCKED_STATUS_CONFIG")).toMatchObject({
      importance: "informational",
      status: "warning",
      message: 'Jira includes a "Blocked" workflow status, but status-based blocker detection is not configured.',
      action: 'If work in "Blocked" should count as blocked, set JIRA_BLOCKED_STATUSES=Blocked in the deployment environment.',
    });
  });

  it("only an exact name is suggested (not names containing 'blocked')", () => {
    const dto = buildReadinessDto(input({ statuses: [{ id: "9", name: "Unblocked Review", categoryKey: "indeterminate" }] }));
    expect(find(dto, "BLOCKED_STATUS_CONFIG").status).toBe("not_applicable");
  });

  it("configured → pass; typo → important warning", () => {
    expect(find(buildReadinessDto(input({ blockedStatusNames: ["Blocked"] })), "BLOCKED_STATUS_CONFIG").status).toBe("pass");
    const typo = find(buildReadinessDto(input({ blockedStatusNames: ["Blokced"] })), "BLOCKED_STATUS_CONFIG");
    expect(typo).toMatchObject({ importance: "important", status: "warning" });
  });

  it("reports link-blocked, status-blocked and unique blocked counts", () => {
    const blockedStatus = (key: string, links: unknown[] = []) => {
      const issue = story(key, { links });
      issue.fields.status = { id: "3", name: "Blocked", statusCategory: { key: "indeterminate" } };
      return issue;
    };
    const issues = [epic, story("SCRUM-13", { links: [blockedBy("SCRUM-99")] }), blockedStatus("SCRUM-14"), blockedStatus("SCRUM-15", [blockedBy("SCRUM-99")])];
    const base = input({ issues, blockedStatusNames: ["Blocked"] });
    const data = buildData({
      sprints: [S1, S2],
      projectIssues: issues,
      sprintIssues: { 1: issues.slice(1) },
    });
    const withStatus = { ...base, data: { ...data, issues: data.issues.map((i) => ({ ...i, ...reNormalize(issues, i.key, ["Blocked"]) })) } };
    const dto = buildReadinessDto(withStatus);
    expect(dto.facts).toMatchObject({ linkBlockedWorkItems: 2, statusBlockedWorkItems: 2, blockedWorkItems: 3 });
  });
});

/** Re-normalize one raw issue with blocked statuses configured (buildData uses default options). */
function reNormalize(issues: RawJiraIssue[], key: string, blockedStatusNames: string[]) {
  const rawIssue = issues.find((i) => i.key === key)!;
  const normalized = normalizeIssue(rawIssue, { ...defaultOptions, blockedStatusNames });
  return { blocked: normalized.blocked, blockedByStatus: normalized.blockedByStatus };
}

describe("history & burndown readiness", () => {
  it("before the sprint starts → waiting for start (not bad history)", () => {
    const dto = buildReadinessDto(input({ now: new Date("2026-10-03T00:00:00Z") }));
    expect(dto.burndown.find((s) => s.name.startsWith("MIG S1"))).toMatchObject({ state: "waiting_for_start", confidence: null });
    expect(find(dto, "BURNDOWN_READINESS").status).toBe("not_applicable");
    expect(find(dto, "SPRINT_HISTORY").message).toBe("Migration sprint history: 2 awaiting sprint execution.");
  });

  it("after start with evidenced membership → available; inferred membership → medium", () => {
    const dto = buildReadinessDto(input({}));
    // No Sprint-field changes recorded in this fixture → membership inferred → medium confidence.
    expect(dto.burndown.find((s) => s.name.startsWith("MIG S1"))).toMatchObject({ state: "available", confidence: "medium" });
    expect(find(dto, "BURNDOWN_READINESS")).toMatchObject({ status: "pass", message: "MIG S1 - Discovery burndown is available." });
    expect(find(dto, "SPRINT_HISTORY").message).toBe(
      "Migration sprint history: 1 available (0 high, 1 medium confidence), 1 awaiting sprint execution.",
    );
  });

  it("missing dates on the active sprint → burndown readiness warning", () => {
    const dto = buildReadinessDto(input({ sprints: [{ ...S1, startDate: null, endDate: null }, S2] }));
    expect(dto.burndown[0]).toMatchObject({ state: "missing_dates" });
    expect(find(dto, "BURNDOWN_READINESS").status).toBe("warning");
  });

  it("low-confidence history → burndown state low_confidence and a warning", () => {
    const issues = [epic, story("SCRUM-13", { category: "done" }), story("SCRUM-14")]; // done, no recorded transition
    const dto = buildReadinessDto(input({ issues }));
    expect(dto.burndown.find((s) => s.name.startsWith("MIG S1"))).toMatchObject({ state: "low_confidence" });
    expect(find(dto, "BURNDOWN_READINESS").status).toBe("warning");
    expect(find(dto, "HISTORY_CONSISTENCY")).toMatchObject({ status: "warning" });
    expect(find(dto, "HISTORY_CONSISTENCY").message).toContain("1 done item without recorded transitions");
  });

  it("insufficient days → trend not applicable; no completions → throughput not applicable", () => {
    const issues = [epic, story("SCRUM-13"), story("SCRUM-14")].map((issue) => ({
      ...issue,
      fields: { ...issue.fields, created: "2026-10-07T01:00:00.000Z" },
    }));
    const dto = buildReadinessDto(input({ issues }));
    expect(find(dto, "PROJECT_TREND_READINESS")).toMatchObject({
      status: "not_applicable",
      message: "Project progress trend requires at least two days of recorded delivery history.",
    });
    expect(find(dto, "THROUGHPUT_READINESS")).toMatchObject({
      status: "not_applicable",
      message: "Throughput will appear after work items begin reaching Done.",
    });
  });

  it("history service unavailable → history checks degrade without failing readiness", () => {
    const dto = buildReadinessDto(input({ history: null }));
    expect(find(dto, "HISTORY_SOURCE")).toMatchObject({ status: "warning" });
    expect(dto.burndown).toEqual([]);
    expect(dto.facts.historyAvailable).toBe(false);
  });
});

describe("overall status and safety", () => {
  it("informational checks never change the overall status", () => {
    const base = { category: "estimation" as const, title: "x", message: "x", action: null, items: [] };
    expect(overallStatus([{ ...base, code: "JIRA_LINKS", importance: "informational", status: "fail" }])).toBe("ready");
    expect(overallStatus([{ ...base, code: "SPRINT_DATES", importance: "important", status: "fail" }])).toBe("attention");
    expect(overallStatus([{ ...base, code: "CLIENT_ACCESS", importance: "critical", status: "fail" }])).toBe("blocked");
  });

  it("client sign-in misconfigured → blocked; time zone missing → attention", () => {
    expect(buildReadinessDto(input({ authStatus: "misconfigured" })).overall.status).toBe("blocked");
    expect(find(buildReadinessDto(input({ timeZone: null })), "DISPLAY_TIME_ZONE").status).toBe("warning");
  });

  it("contains no emails, account IDs or raw Jira payloads", () => {
    const issues = [epic, story("SCRUM-13", { assignee: { accountId: "5f00-secret", displayName: "Alex" } }), raw({ key: "SCRUM-38", summary: "I-01 P0 - Risk" })];
    const json = JSON.stringify(buildReadinessDto(input({ issues })));
    expect(json).not.toMatch(/@|accountId|5f00-secret|customfield_|\/rest\//);
  });

  it("story-point readiness reuses the progress engine (100% rule unchanged)", () => {
    const dto = buildReadinessDto(input({ issues: [epic, story("SCRUM-13"), story("SCRUM-14", { points: null })] }));
    const data = input({ issues: [epic, story("SCRUM-13"), story("SCRUM-14", { points: null })] }).data;
    const summary = summarizeWork(data.issues.filter((i) => !i.isEpic));
    expect(dto.facts.progressMethod).toBe(summary.progressMethod);
    expect(dto.facts).toMatchObject({ estimatedWorkItems: 1, eligibleWorkItems: 2, estimationCoverage: 50 });
  });
});
