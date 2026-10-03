import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JiraApiError } from "@/lib/jira/errors";

const getDashboardData = vi.fn();
const getSession = vi.fn();
vi.mock("@/lib/dashboard/get-dashboard-data", () => ({ getDashboardData }));
vi.mock("@/lib/auth/server", () => ({ getSession }));

const { GET } = await import("@/app/api/jira/dashboard/route");

beforeEach(() => {
  getSession.mockResolvedValue({ email: "client@example.com", expiresAt: "2099-01-01T00:00:00.000Z" });
});

afterEach(() => {
  getDashboardData.mockReset();
  getSession.mockReset();
  vi.restoreAllMocks();
});

describe("GET /api/jira/dashboard", () => {
  it("rejects unauthenticated requests with 401 and never loads Jira data", async () => {
    getSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Sign in to access project data." },
    });
    expect(getDashboardData).not.toHaveBeenCalled();
  });

  it("returns the DTO with 200 and no-store", async () => {
    getDashboardData.mockResolvedValue({ project: { key: "SCRUM" } });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ project: { key: "SCRUM" } });
  });

  it.each([
    ["INVALID_CREDENTIALS", 502],
    ["CONFIG_MISSING", 503],
    ["RATE_LIMITED", 503],
    ["TIMEOUT", 504],
  ] as const)("normalizes %s to a client-safe error (%i)", async (code, status) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getDashboardData.mockRejectedValue(
      new JiraApiError(code, { detail: "Missing JIRA_API_TOKEN secret-value", path: "/rest/api/3/myself" }),
    );
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(status);
    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error.code).toBe(code);
    expect(JSON.stringify(body)).not.toMatch(/secret-value|JIRA_API_TOKEN|stack|\/rest\//);
  });

  it("maps unexpected errors to UNKNOWN without leaking the message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getDashboardData.mockRejectedValue(new Error("boom at /home/secret"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "UNKNOWN", message: "An unexpected error occurred while loading Jira data." },
    });
  });
});
