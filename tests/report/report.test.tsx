import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDashboardDto } from "@/lib/dashboard/dashboard";
import { deriveDataConfidence } from "@/lib/readiness/data-confidence";
import type { ReadinessCheck, ReadinessCheckCode } from "@/lib/readiness/types";
import { completedWithin, parseReportPeriod } from "@/lib/report/period";
import type { HistoryDto } from "@/lib/history/types";
import { blockedBy, buildData, NOW, raw, sprint } from "../dashboard/helpers";

const loadDashboard = vi.fn();
const loadHistory = vi.fn();
const loadDataConfidence = vi.fn();
vi.mock("@/lib/dashboard/get-dashboard-data", () => ({ loadDashboard }));
vi.mock("@/lib/history/history-service", () => ({ loadHistory }));
vi.mock("@/lib/readiness/readiness-service", () => ({ loadDataConfidence }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/report", notFound: vi.fn(), redirect: vi.fn() }));
const { default: ReportPage } = await import("@/app/(dashboard)/report/page");

afterEach(() => vi.resetAllMocks());

const c = (code: ReadinessCheckCode, status: ReadinessCheck["status"]): ReadinessCheck => ({
  code,
  status,
  category: "sprint_planning",
  importance: "important",
  title: code,
  message: "m",
  action: null,
  items: [{ key: "SCRUM-3", summary: "Task 3", jiraUrl: null }],
});

describe("data confidence (client-safe)", () => {
  it("good when data checks pass", () => {
    expect(deriveDataConfidence([c("SPRINT_DATES", "pass"), c("STORY_POINT_COVERAGE", "pass")])).toEqual({
      level: "good",
      label: "Good",
      reasons: [],
      summary: "Good: Jira data is complete for reporting.",
    });
  });

  it("limited with readable reasons when schedule and estimates are incomplete", () => {
    const confidence = deriveDataConfidence([c("SPRINT_DATES", "warning"), c("STORY_POINT_COVERAGE", "warning"), c("UNCLASSIFIED_WORK", "warning")]);
    expect(confidence).toMatchObject({ level: "limited", label: "Limited" });
    expect(confidence.summary).toBe("Limited: sprint schedule incomplete, estimates incomplete and some work not yet assigned to a milestone.");
  });

  it("low when a data check fails", () => {
    expect(deriveDataConfidence([c("SPRINT_DATES", "fail"), c("STORY_POINT_COVERAGE", "warning")])).toMatchObject({
      level: "low",
      summary: "Low: current sprint has no dates and estimates incomplete.",
    });
  });

  it("ignores delivery risk and app configuration (P0 risks, blockers, sign-in)", () => {
    expect(deriveDataConfidence([c("OPEN_P0_RISKS", "warning"), c("BLOCKER_DETECTION", "warning"), c("CLIENT_ACCESS", "fail")]).level).toBe("good");
  });

  it("never carries item keys, summaries or counts", () => {
    const json = JSON.stringify(deriveDataConfidence([c("UNCLASSIFIED_WORK", "warning")]));
    expect(json).not.toMatch(/SCRUM-3|Task 3|\d/);
  });
});

describe("report period", () => {
  it("accepts 7/14/30 and defaults to 7", () => {
    expect(parseReportPeriod("14")).toBe(14);
    expect(parseReportPeriod(["30"])).toBe(30);
    expect(parseReportPeriod("99")).toBe(7);
    expect(parseReportPeriod(undefined)).toBe(7);
    expect(parseReportPeriod("7; DROP")).toBe(7);
  });

  it("filters completions to the window", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const items = [{ completedAt: "2026-10-09T00:00:00Z" }, { completedAt: "2026-10-01T00:00:00Z" }, { completedAt: "2026-10-11T00:00:00Z" }];
    expect(completedWithin(items, 7, now)).toEqual([{ completedAt: "2026-10-09T00:00:00Z" }]);
    expect(completedWithin(items, 14, now)).toHaveLength(2);
  });
});

describe("/report page", () => {
  const dto = buildDashboardDto(
    buildData({
      sprints: [
        sprint(1, "MIG S1 - Discovery", "active", { startDate: "2026-10-05T07:28:00.000Z", endDate: "2026-10-19T07:28:00.000Z" }),
        sprint(2, "MIG S2 - Schema Mapping", "future"),
      ],
      projectIssues: [
        raw({ key: "SCRUM-5", type: "Epic", summary: "M1 - Discovery, Metadata & Architecture" }),
        raw({ key: "SCRUM-38", summary: "I-01 P0 - Tenant Metadata Absent" }),
        raw({ key: "SCRUM-45", summary: "I-08 P1 - Rules and Reports Incomplete" }),
      ],
      sprintIssues: {
        1: [
          raw({ key: "SCRUM-14", summary: "M1.2 - Salesforce Metadata", parent: { key: "SCRUM-5" }, links: [blockedBy("SCRUM-38")] }),
          raw({ key: "SCRUM-13", summary: "M1.1 - Stakeholders", parent: { key: "SCRUM-5" }, category: "done" }),
        ],
      },
    }),
    NOW,
  );
  const history = {
    recentActivity: [
      { id: "1", timestamp: "2026-10-02T10:00:00Z", issueKey: "SCRUM-13", issueSummary: "M1.1 - Stakeholders", type: "completed", title: "SCRUM-13 completed", description: null, actorDisplayName: "Alex", jiraUrl: null, issueKeys: ["SCRUM-13"] },
    ],
    completions: [
      { issueKey: "SCRUM-13", summary: "M1.1 - Stakeholders", completedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), kind: "work", riskSeverity: null, milestoneLabel: "M1", jiraUrl: null },
      { issueKey: "SCRUM-12", summary: "Older item", completedAt: new Date(Date.now() - 20 * 86_400_000).toISOString(), kind: "work", riskSeverity: null, milestoneLabel: "M1", jiraUrl: null },
    ],
  } as unknown as HistoryDto;
  const render = async (period?: string) => renderToStaticMarkup(await ReportPage({ params: Promise.resolve({}), searchParams: Promise.resolve(period ? { period } : {}) } as never));

  it("renders every stakeholder section from the existing DTOs", async () => {
    loadDashboard.mockResolvedValue({ ok: true, data: dto });
    loadHistory.mockResolvedValue({ ok: true, data: history });
    loadDataConfidence.mockResolvedValue(deriveDataConfidence([c("SPRINT_DATES", "warning"), c("STORY_POINT_COVERAGE", "warning")]));
    const html = await render();
    for (const text of [
      "Project status report",
      "Overall progress",
      "Project health",
      "Current sprint",
      "MIG S1 - Discovery",
      "Next sprint",
      "MIG S2 - Schema Mapping",
      "Schedule not set",
      "Completed in the last 7 days",
      "M1.1 - Stakeholders",
      "Current blockers",
      "I-01 Tenant Metadata Absent (P0)",
      "Open risks",
      "Rules and Reports Incomplete",
      "Milestones",
      "Discovery, Metadata &amp; Architecture",
      "Recent activity",
      "SCRUM-13 completed",
      "Data confidence: ",
      "Limited",
      "sprint schedule incomplete and estimates incomplete",
      "Print / Save as PDF",
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).not.toContain("Older item");
  });

  it("period=30 widens the completed window", async () => {
    loadDashboard.mockResolvedValue({ ok: true, data: dto });
    loadHistory.mockResolvedValue({ ok: true, data: history });
    loadDataConfidence.mockResolvedValue(null);
    const html = await render("30");
    expect(html).toContain("Completed in the last 30 days");
    expect(html).toContain("Older item");
    expect(html).not.toContain("Data confidence");
  });

  it("degrades history sections when history is unavailable", async () => {
    loadDashboard.mockResolvedValue({ ok: true, data: dto });
    loadHistory.mockResolvedValue({ ok: false, error: { code: "JIRA_UNAVAILABLE", message: "x" } });
    loadDataConfidence.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("Completion history is temporarily unavailable.");
    expect(html).toContain("Recent activity is temporarily unavailable.");
    expect(html).toContain("Current blockers");
  });

  it("shows the client-safe error when Jira is unavailable", async () => {
    loadDashboard.mockResolvedValue({ ok: false, error: { code: "JIRA_UNAVAILABLE", message: "Jira is currently unavailable." } });
    loadHistory.mockResolvedValue({ ok: false, error: { code: "x", message: "x" } });
    loadDataConfidence.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("Project data is temporarily unavailable");
    expect(html).not.toMatch(/JIRA_UNAVAILABLE|stack/);
  });

  it("contains no emails, account IDs or admin diagnostics", async () => {
    loadDashboard.mockResolvedValue({ ok: true, data: dto });
    loadHistory.mockResolvedValue({ ok: true, data: history });
    loadDataConfidence.mockResolvedValue(deriveDataConfidence([c("UNCLASSIFIED_WORK", "warning")]));
    const html = await render();
    expect(html).not.toMatch(/@|accountId|Recommended action|customfield_/);
  });
});
