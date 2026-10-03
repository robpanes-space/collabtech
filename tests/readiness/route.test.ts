import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdminEmail, parseAdminEmails } from "@/lib/auth/config";

const getReadinessData = vi.fn();
const getAdminSession = vi.fn();
vi.mock("@/lib/readiness/readiness-service", () => ({ getReadinessData }));
vi.mock("@/lib/auth/server", () => ({ getAdminSession }));
const { GET } = await import("@/app/api/jira/readiness/route");

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/jira/readiness", () => {
  it("unauthenticated → 401", async () => {
    getAdminSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(getReadinessData).not.toHaveBeenCalled();
  });

  it("signed in but not an admin → 403", async () => {
    getAdminSession.mockResolvedValue("forbidden");
    const response = await GET();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "FORBIDDEN", message: "This view is limited to administrators." } });
  });

  it("admin → readiness DTO", async () => {
    getAdminSession.mockResolvedValue({ email: "ops@example.com", expiresAt: "2099-01-01T00:00:00Z" });
    getReadinessData.mockResolvedValue({ overall: { status: "attention" } });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ overall: { status: "attention" } });
  });
});

describe("admin allowlist", () => {
  it("unset → every signed-in user; set → only listed (trimmed, case-insensitive)", () => {
    expect(isAdminEmail("client@example.com", {} as NodeJS.ProcessEnv)).toBe(true);
    const env = { DASHBOARD_ADMIN_EMAILS: " Ops@Example.com , lead@example.com" } as unknown as NodeJS.ProcessEnv;
    expect(isAdminEmail("ops@example.com", env)).toBe(true);
    expect(isAdminEmail("client@example.com", env)).toBe(false);
    expect([...parseAdminEmails("a@x.com,, b@x.com ")]).toEqual(["a@x.com", "b@x.com"]);
  });
});
