import { describe, expect, it } from "vitest";
import { buildDashboardDto } from "@/lib/dashboard/dashboard";
import { jiraBrowseBase } from "@/lib/jira/links";
import { blockedBy, buildData, NOW, raw, sprint } from "./helpers";

/** DTO built as production would: links from the configured site origin. */
const data = buildData({
  sprints: [sprint(1, "MIG S1 - Discovery", "active")],
  projectIssues: [raw({ key: "SCRUM-38", summary: "I-01 P0 - Tenant Metadata Absent" })],
  sprintIssues: { 1: [raw({ key: "SCRUM-14", links: [blockedBy("SCRUM-38")], extraFields: { duedate: "2026-10-10" } })] },
});
const dto = buildDashboardDto(data, NOW, { jiraBrowseBaseUrl: jiraBrowseBase("https://websprint.example.atlassian.net") });
const json = JSON.stringify(dto);

describe("DTO security", () => {
  it("contains safe browse links on work items, blockers and risks", () => {
    const browse = "https://websprint.example.atlassian.net/browse/";
    expect(dto.activeSprint?.workItems[0]?.jiraUrl).toBe(`${browse}SCRUM-14`);
    expect(dto.blockers[0]?.jiraUrl).toBe(`${browse}SCRUM-14`);
    expect(dto.blockers[0]?.blockedBy[0]?.jiraUrl).toBe(`${browse}SCRUM-38`);
    expect(dto.risks[0]?.jiraUrl).toBe(`${browse}SCRUM-38`);
    expect(dto.risks[0]?.blocks[0]?.jiraUrl).toBe(`${browse}SCRUM-14`);
  });

  it("never contains REST endpoints, credentials, emails or auth data", () => {
    expect(json).not.toMatch(/\/rest\/|customfield_|Authorization|Basic |api[_-]?token|accountId|@/i);
    const urls = json.match(/https?:\/\/[^"]+/g) ?? [];
    expect(urls.every((url) => url.startsWith("https://websprint.example.atlassian.net/browse/"))).toBe(true);
  });

  it("omits links entirely when disabled", () => {
    const noLinks = JSON.stringify(buildDashboardDto(data, NOW));
    expect(noLinks).not.toMatch(/https?:\/\//);
  });

  it("carries the due date as a calendar date and cache metadata", () => {
    expect(dto.activeSprint?.workItems[0]?.dueDate).toBe("2026-10-10");
    expect(dto.sync).toMatchObject({ refreshIntervalSeconds: 60, nextRefreshAt: "2026-10-03T12:01:00.000Z" });
  });
});
