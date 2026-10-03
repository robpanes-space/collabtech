import { afterEach, describe, expect, it, vi } from "vitest";
import { JiraApiError } from "@/lib/jira/errors";

const getHistoryData = vi.fn();
const getSession = vi.fn();
vi.mock("@/lib/history/history-service", () => ({ getHistoryData }));
vi.mock("@/lib/auth/server", () => ({ getSession }));
const { GET } = await import("@/app/api/jira/history/route");

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("GET /api/jira/history", () => {
  it("requires a session (401) and never touches Jira", async () => {
    getSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(getHistoryData).not.toHaveBeenCalled();
  });

  it("returns the history DTO for signed-in users", async () => {
    getSession.mockResolvedValue({ email: "client@example.com", expiresAt: "2099-01-01T00:00:00Z" });
    getHistoryData.mockResolvedValue({ recentActivity: [], sync: { cacheSeconds: 300 } });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ sync: { cacheSeconds: 300 } });
  });

  it("returns a client-safe error when Jira history fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getSession.mockResolvedValue({ email: "client@example.com", expiresAt: "2099-01-01T00:00:00Z" });
    getHistoryData.mockRejectedValue(new JiraApiError("RATE_LIMITED", { detail: "token=secret /rest/api/3/changelog/bulkfetch" }));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ error: { code: "RATE_LIMITED", message: "Historical analytics are temporarily unavailable." } });
    expect(JSON.stringify(body)).not.toMatch(/secret|rest/);
  });
});
