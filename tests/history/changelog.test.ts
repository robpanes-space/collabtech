import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchChangelogs } from "@/lib/jira/changelog";
import { classifyField, normalizeChangelogs, normalizeInstant, parseSprintIds, parseStoryPoints } from "@/lib/history/normalize-history";

const fixture = (name: string) => JSON.parse(readFileSync(path.join(import.meta.dirname, "../fixtures/jira", name), "utf8"));
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubEnv("JIRA_BASE_URL", "https://example.atlassian.net");
  vi.stubEnv("JIRA_EMAIL", "bot@example.com");
  vi.stubEnv("JIRA_API_TOKEN", "token");
  vi.stubEnv("JIRA_BOARD_ID", "1");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("bulk changelog fetch", () => {
  it("single page: one POST with issue IDs and field filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ issueChangeLogs: fixture("changelog-page-2.json").issueChangeLogs }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchChangelogs(["10010", "10015"], ["status", "customfield_10020"]);
    expect(result.requestCount).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.atlassian.net/rest/api/3/changelog/bulkfetch");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      issueIdsOrKeys: ["10010", "10015"],
      maxResults: 1000,
      fieldIds: ["status", "customfield_10020"],
    });
    expect(result.changelogs.map((c) => c.issueId)).toEqual(["10010", "10015"]);
  });

  it("follows nextPageToken and merges histories of the same issue across pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(fixture("changelog-page-1.json")))
      .mockResolvedValueOnce(json(fixture("changelog-page-2.json")));
    vi.stubGlobal("fetch", fetchMock);
    const { changelogs, requestCount } = await fetchChangelogs(["10010", "10012", "10015"]);
    expect(requestCount).toBe(2);
    expect(JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string).nextPageToken).toBe("page-2");
    expect(changelogs.find((c) => c.issueId === "10010")?.changeHistories.map((h) => h.id)).toEqual(["500", "501", "502"]);
  });

  it("batches more than 1000 issues sequentially (never per issue)", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ issueChangeLogs: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const ids = Array.from({ length: 2001 }, (_, i) => String(10000 + i));
    const { requestCount } = await fetchChangelogs(ids);
    expect(requestCount).toBe(3);
    const sizes = fetchMock.mock.calls.map((call) => JSON.parse((call as [string, RequestInit])[1].body as string).issueIdsOrKeys.length);
    expect(sizes).toEqual([1000, 1000, 1]);
  });

  it("strips author emails, avatars and account metadata at the schema boundary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ issueChangeLogs: fixture("changelog-page-1.json").issueChangeLogs })));
    const { changelogs } = await fetchChangelogs(["10010"]);
    const serialized = JSON.stringify(changelogs);
    expect(serialized).not.toContain("alex.rivera@example.com");
    expect(serialized).not.toContain("timeZone");
    expect(serialized).not.toContain("/rest/api/3/user");
  });
});

describe("history normalization", () => {
  const ids = { sprintField: "customfield_10020", storyPointsField: "customfield_10016" };
  const keyById = new Map([
    ["10010", "SCRUM-10"],
    ["10012", "SCRUM-12"],
    ["10015", "SCRUM-15"],
  ]);
  const raw = [...fixture("changelog-page-1.json").issueChangeLogs, ...fixture("changelog-page-2.json").issueChangeLogs];
  const events = normalizeChangelogs(raw, keyById, ids);
  const of = (key: string, field: string) => events.filter((e) => e.issueKey === key && e.field === field);

  it("classifies fields by ID using discovered custom fields", () => {
    expect(classifyField({ field: "Sprint", fieldId: "customfield_10020" }, ids)).toBe("sprint");
    expect(classifyField({ field: "Story point estimate", fieldId: "customfield_10016" }, ids)).toBe("storyPoints");
    expect(classifyField({ field: "status", fieldId: "status" }, ids)).toBe("status");
    expect(classifyField({ field: "Sprint", fieldId: "customfield_10020" }, { sprintField: null, storyPointsField: null })).toBe("other");
    expect(classifyField({ field: "Rank", fieldId: "customfield_10019" }, ids)).toBe("other");
  });

  it("status change → status IDs and names", () => {
    expect(of("SCRUM-10", "status").map((e) => [e.from, e.to])).toEqual([
      [{ kind: "status", value: { id: "10000", name: "To Do" } }, { kind: "status", value: { id: "10001", name: "In Progress" } }],
      [{ kind: "status", value: { id: "10001", name: "In Progress" } }, { kind: "status", value: { id: "10001", name: "Done" } }],
    ]);
  });

  it("sprint change → sprint ID sets", () => {
    expect(of("SCRUM-10", "sprint")[0]).toMatchObject({ from: { kind: "sprint", value: [] }, to: { kind: "sprint", value: [1] } });
    expect(parseSprintIds("3, 1, 3")).toEqual([1, 3]);
    expect(parseSprintIds("")).toEqual([]);
  });

  it("story-point change → numbers (invalid → null)", () => {
    expect(of("SCRUM-15", "storyPoints")[0]).toMatchObject({ from: { value: null }, to: { value: 3 } });
    expect(parseStoryPoints("3.5")).toBe(3.5);
    expect(parseStoryPoints("-1")).toBeNull();
    expect(parseStoryPoints("abc")).toBeNull();
  });

  it("assignee change keeps the display name only (no account ID)", () => {
    const [assignee] = of("SCRUM-15", "assignee");
    expect(assignee?.to).toEqual({ kind: "text", value: "Sam Chen" });
    expect(JSON.stringify(events)).not.toContain("5f0000000000000000000002");
  });

  it("unknown fields become 'other'; links are 'other'", () => {
    expect(of("SCRUM-15", "other")).toHaveLength(1);
    expect(of("SCRUM-12", "other")).toHaveLength(1);
  });

  it("accepts epoch-ms and ISO timestamps; actors without a name stay null", () => {
    expect(normalizeInstant(1791010138637)).toBe("2026-10-03T06:48:58.637Z");
    expect(normalizeInstant("2026-10-02T11:00:00.000+0000")).toBe("2026-10-02T11:00:00.000Z");
    expect(of("SCRUM-10", "status")[1]?.actor).toBeNull();
    expect(JSON.stringify(events)).not.toMatch(/@|accountId/);
  });

  it("ignores changelogs for issues outside the tracked scope and sorts ascending", () => {
    const only = normalizeChangelogs(raw, new Map([["10010", "SCRUM-10"]]), ids);
    expect(new Set(only.map((e) => e.issueKey))).toEqual(new Set(["SCRUM-10"]));
    expect(only.map((e) => e.timestamp)).toEqual([...only.map((e) => e.timestamp)].sort());
  });
});
