import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { jiraFetch, jiraPaginate } from "@/lib/jira/client";
import { JiraApiError } from "@/lib/jira/errors";

const TOKEN = "super-secret-token";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  vi.stubEnv("JIRA_BASE_URL", "https://example.atlassian.net/");
  vi.stubEnv("JIRA_EMAIL", "test@example.com");
  vi.stubEnv("JIRA_API_TOKEN", TOKEN);
  vi.stubEnv("JIRA_PROJECT_KEY", "SCRUM");
  vi.stubEnv("JIRA_BOARD_ID", "1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("jiraFetch", () => {
  it("sends basic auth + JSON accept header and builds the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await jiraFetch("/rest/api/3/myself", { query: { a: 1, skip: undefined } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.atlassian.net/rest/api/3/myself?a=1");
    const headers = init.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json");
    expect(headers.Authorization).toMatch(/^Basic /);
  });

  it("validates responses with the provided schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ id: "not-a-number" })));
    await expect(
      jiraFetch("/x", { schema: z.object({ id: z.number() }) }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([
    [401, "INVALID_CREDENTIALS"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
  ] as const)("maps HTTP %i to %s without retrying", async (status, code) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status }));
    vi.stubGlobal("fetch", fetchMock);

    const error = await jiraFetch("/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(JiraApiError);
    expect(error).toMatchObject({ code, status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 429 honouring Retry-After, then succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = jiraFetch<{ ok: boolean }>("/x");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up on persistent 5xx with JIRA_UNAVAILABLE", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 503 })));
    vi.stubGlobal("fetch", fetchMock);

    const promise = jiraFetch("/x", { maxRetries: 2 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await promise).toMatchObject({ code: "JIRA_UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps timeouts and network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("t", "TimeoutError")));
    await expect(jiraFetch("/x")).rejects.toMatchObject({ code: "TIMEOUT" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(jiraFetch("/x")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("reports missing configuration by variable name only", async () => {
    vi.stubEnv("JIRA_API_TOKEN", "");
    const error = await jiraFetch("/x").catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "CONFIG_MISSING" });
    expect((error as Error).message).toContain("JIRA_API_TOKEN");
  });

  it("never leaks the API token in errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(TOKEN, { status: 401 })));
    const error = (await jiraFetch("/x").catch((e: unknown) => e)) as JiraApiError;
    expect(JSON.stringify(error.toJSON())).not.toContain(TOKEN);
    expect(error.message).not.toContain(TOKEN);
  });
});

describe("jiraPaginate", () => {
  it("follows startAt until isLast", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ startAt: 0, isLast: false, values: [1, 2] }))
      .mockResolvedValueOnce(jsonResponse({ startAt: 2, isLast: true, values: [3] }));
    vi.stubGlobal("fetch", fetchMock);

    const items = await jiraPaginate<{ values: number[]; isLast: boolean }, number>(
      "/rest/agile/1.0/board/1/sprint",
      (page) => ({ ...page, items: page.values }),
      { pageSize: 2 },
    );

    expect(items).toEqual([1, 2, 3]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("startAt=2");
  });

  it("stops at total and on empty pages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse({ total: 1, issues: [{ id: "1" }] })),
    );
    const items = await jiraPaginate<{ total: number; issues: unknown[] }, unknown>(
      "/x",
      (page) => ({ ...page, items: page.issues }),
    );
    expect(items).toHaveLength(1);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ values: [] })));
    const empty = await jiraPaginate<{ values: unknown[] }, unknown>("/x", (page) => ({
      ...page,
      items: page.values,
    }));
    expect(empty).toEqual([]);
  });
});
