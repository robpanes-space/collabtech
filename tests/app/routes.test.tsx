import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDashboardDto } from "@/lib/dashboard/dashboard";
import { buildData, NOW, raw, sprint } from "../dashboard/helpers";

const loadDashboard = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
});
vi.mock("@/lib/dashboard/get-dashboard-data", () => ({ loadDashboard }));
vi.mock("next/navigation", () => ({
  notFound,
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/",
}));

const { default: SprintDetailPage } = await import("@/app/(dashboard)/sprints/[sprintId]/page");
const { GET: healthGET } = await import("@/app/api/health/route");

const dto = buildDashboardDto(
  buildData({
    sprints: [sprint(1, "MIG S1 - Discovery", "active", { startDate: "2026-10-05T07:28:00.000Z", endDate: "2026-10-19T07:28:00.000Z" })],
    sprintIssues: { 1: [raw({ key: "SCRUM-14", summary: "M1.2 - Metadata" })] },
  }),
  NOW,
  { jiraBrowseBaseUrl: "https://site.example.atlassian.net/browse/" },
);

const params = (sprintId: string) => ({ params: Promise.resolve({ sprintId }), searchParams: Promise.resolve({}) });

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("/sprints/[sprintId]", () => {
  it("calls notFound() (HTTP 404) for an unknown sprint", async () => {
    loadDashboard.mockResolvedValue({ ok: true, data: dto });
    await expect(SprintDetailPage(params("999"))).rejects.toThrow("404");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it.each(["abc", "-1", "1.5", "1e3", "99999999999"])("calls notFound() for malformed id %j without loading data", async (id) => {
    await expect(SprintDetailPage(params(id))).rejects.toThrow("404");
    expect(loadDashboard).not.toHaveBeenCalled();
  });

  it("renders a known sprint with Jira deep links", async () => {
    loadDashboard.mockResolvedValue({ ok: true, data: dto });
    const html = renderToStaticMarkup(await SprintDetailPage(params("1")));
    expect(html).toContain("MIG S1 - Discovery");
    expect(html).toContain('href="https://site.example.atlassian.net/browse/SCRUM-14"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(notFound).not.toHaveBeenCalled();
  });

  it("renders a client-safe error (no internals) when Jira fails", async () => {
    loadDashboard.mockResolvedValue({ ok: false, error: { code: "JIRA_UNAVAILABLE", message: "Jira is currently unavailable." } });
    const html = renderToStaticMarkup(await SprintDetailPage(params("1")));
    expect(html).toContain("Project data is temporarily unavailable");
    expect(html).not.toMatch(/JIRA_UNAVAILABLE|stack|atlassian/);
  });
});

describe("GET /api/health", () => {
  it("returns 503 without variable names when misconfigured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JIRA_API_TOKEN", "");
    const response = healthGET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("misconfigured");
    expect(JSON.stringify(body)).not.toMatch(/JIRA|DASHBOARD|atlassian/);
  });

  it("returns 200 when fully configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JIRA_BASE_URL", "https://site.atlassian.net");
    vi.stubEnv("JIRA_EMAIL", "bot@example.com");
    vi.stubEnv("JIRA_API_TOKEN", "token");
    vi.stubEnv("JIRA_BOARD_ID", "1");
    vi.stubEnv("DASHBOARD_USERS", "a@example.com:scrypt.16384.8.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    vi.stubEnv("DASHBOARD_SESSION_SECRET", "s".repeat(40));
    vi.stubEnv("DASHBOARD_TIME_ZONE", "Asia/Manila");
    const response = healthGET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });
});
