import { afterEach, describe, expect, it, vi } from "vitest";
import { summarizeWork } from "@/lib/dashboard/work-progress";
import { normalizeIssue } from "@/lib/jira/normalize";
import { getJiraConfig } from "@/lib/jira/config";
import { defaultOptions, rawIssue } from "../fixtures/jira";

/**
 * Blocker merge rule: blocked = (unresolved "is blocked by" link) OR (status name in
 * JIRA_BLOCKED_STATUSES, exact match, case-insensitive, trimmed). An issue matching both is one
 * blocked item. Done always wins: a done-category issue is never "blocked by status", and
 * blocked counts only include unresolved work.
 */
const link = { type: { name: "Blocks", inward: "is blocked by", outward: "blocks" }, inwardIssue: { id: "1", key: "SCRUM-38" } };

function inStatus(name: string, category: "new" | "indeterminate" | "done", links: unknown[] = []) {
  const raw = rawIssue({ links });
  raw.fields.status = { id: "9", name, statusCategory: { key: category } };
  return raw;
}

const normalize = (raw: ReturnType<typeof rawIssue>, blockedStatusNames: string[] = []) =>
  normalizeIssue(raw, { ...defaultOptions, blockedStatusNames });

describe("blocked status support", () => {
  it("blocked by link", () => {
    expect(normalize(rawIssue({ links: [link] }))).toMatchObject({ blocked: true, blockedByStatus: false, blockers: ["SCRUM-38"] });
  });

  it("blocked by configured status", () => {
    expect(normalize(inStatus("Blocked", "indeterminate"), ["Blocked"])).toMatchObject({ blocked: true, blockedByStatus: true, blockers: [] });
  });

  it("blocked by both → counted once", () => {
    const both = normalize(inStatus("Blocked", "indeterminate", [link]), ["Blocked"]);
    expect(both).toMatchObject({ blocked: true, blockedByStatus: true, blockers: ["SCRUM-38"] });
    expect(summarizeWork([both, normalize(rawIssue())]).blockedIssues).toBe(1);
  });

  it("status called Blocked but no configuration → not blocked", () => {
    expect(normalize(inStatus("Blocked", "indeterminate"))).toMatchObject({ blocked: false, blockedByStatus: false });
  });

  it("multiple configured statuses, case and whitespace differences", () => {
    const names = [" blocked ", "WAITING ON CLIENT"];
    expect(normalize(inStatus("Blocked", "indeterminate"), names).blockedByStatus).toBe(true);
    expect(normalize(inStatus("Waiting on Client", "new"), names).blockedByStatus).toBe(true);
    expect(normalize(inStatus("Waiting", "new"), names).blockedByStatus).toBe(false);
  });

  it("names merely containing the word are not matched", () => {
    expect(normalize(inStatus("Unblocked", "indeterminate"), ["Blocked"]).blockedByStatus).toBe(false);
  });

  it("empty configuration entries are ignored", () => {
    expect(normalize(inStatus("Blocked", "indeterminate"), ["", "  "]).blockedByStatus).toBe(false);
  });

  it("done issue in a configured 'blocked' status → done wins (not blocked by status, not counted)", () => {
    const done = normalize(inStatus("Blocked", "done"), ["Blocked"]);
    expect(done).toMatchObject({ blockedByStatus: false, blocked: false });
    expect(summarizeWork([done]).blockedIssues).toBe(0);
  });

  it("done issue with an open link blocker is still not counted as blocked work", () => {
    const done = normalize(inStatus("Done", "done", [link]));
    expect(done.blocked).toBe(true);
    expect(summarizeWork([done]).blockedIssues).toBe(0);
  });
});

describe("JIRA_BLOCKED_STATUSES parsing", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("parses a comma-separated server-side list", () => {
    vi.stubEnv("JIRA_BASE_URL", "https://site.atlassian.net");
    vi.stubEnv("JIRA_EMAIL", "bot@example.com");
    vi.stubEnv("JIRA_API_TOKEN", "t");
    vi.stubEnv("JIRA_BOARD_ID", "1");
    vi.stubEnv("JIRA_BLOCKED_STATUSES", " Blocked , Waiting on Client ,, ");
    expect(getJiraConfig().blockedStatusNames).toEqual(["Blocked", "Waiting on Client"]);
    vi.stubEnv("JIRA_BLOCKED_STATUSES", "");
    expect(getJiraConfig().blockedStatusNames).toEqual([]);
  });
});
