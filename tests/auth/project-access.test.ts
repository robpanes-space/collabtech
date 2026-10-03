import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeAtlassianSignIn, ATLASSIAN_ME_URL, ATLASSIAN_TOKEN_URL } from "@/lib/auth/atlassian";
import { getAuthConfig } from "@/lib/auth/config";
import { createSessionToken, resolveSession } from "@/lib/auth/session";
import { isProjectMember } from "@/lib/jira/project-access";
import { projectAccessCheck } from "@/lib/readiness/configuration-readiness";
import type { ReadinessContext } from "@/lib/readiness/context";

const SECRET = "project-access-secret-0123456789abcdef";
const BASE = "https://dashboard.example.com";
const MEMBER = "557058:member-account";
const OUTSIDER = "557058:outsider-account";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DASHBOARD_SESSION_SECRET", SECRET);
  vi.stubEnv("DASHBOARD_USERS", "");
  vi.stubEnv("DASHBOARD_ALLOWED_EMAILS", "listed@client.example");
  vi.stubEnv("DASHBOARD_JIRA_PROJECT_ACCESS", "true");
  vi.stubEnv("ATLASSIAN_CLIENT_ID", "cid");
  vi.stubEnv("ATLASSIAN_CLIENT_SECRET", "csecret");
  vi.stubEnv("ATLASSIAN_CALLBACK_URL", `${BASE}/api/auth/atlassian/callback`);
  vi.stubEnv("JIRA_BASE_URL", "https://site.atlassian.net");
  vi.stubEnv("JIRA_EMAIL", "bot@example.com");
  vi.stubEnv("JIRA_API_TOKEN", "service-token");
  vi.stubEnv("JIRA_PROJECT_KEY", "SCRUM");
  vi.stubEnv("JIRA_BOARD_ID", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Jira "users with Browse Projects" pages + Atlassian token and /me for one identity. */
function mockWorld(options: { me?: Record<string, unknown>; pages?: unknown[][]; jiraDown?: boolean } = {}) {
  const pages = options.pages ?? [
    [
      { accountId: MEMBER, accountType: "atlassian", active: true },
      { accountId: "app:automation", accountType: "app", active: true },
      { accountId: "557058:former", accountType: "atlassian", active: false },
    ],
  ];
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url === ATLASSIAN_TOKEN_URL) return Response.json({ access_token: "user-token" });
      if (url === ATLASSIAN_ME_URL) {
        return Response.json({ account_type: "atlassian", account_status: "active", email: "member@client.example", name: "Member", account_id: MEMBER, ...options.me });
      }
      if (url.startsWith("https://site.atlassian.net/rest/api/3/user/permission/search")) {
        if (options.jiraDown) return new Response("", { status: 503 });
        // The service account (Basic auth) is used — never the user's Atlassian token.
        expect(String((init?.headers as Record<string, string>).Authorization)).toMatch(/^Basic /);
        const startAt = Number(new URL(url).searchParams.get("startAt"));
        return Response.json(pages[startAt / 100] ?? []);
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  return calls;
}

const config = () => {
  const c = getAuthConfig();
  if (c.status !== "enabled" || !c.atlassian) throw new Error("expected enabled config");
  return c;
};
const signIn = (checker?: (id: string) => Promise<boolean>) =>
  completeAtlassianSignIn({ config: config().atlassian!, allowedEmails: config().allowedEmails, code: "c", isProjectMember: checker });

describe("sign-in through Jira project access", () => {
  it("a project member who is not on the allowlist is allowed (via jira_project)", async () => {
    mockWorld();
    const result = await signIn((id) => isProjectMember(id, { fresh: true }));
    expect(result).toEqual({ ok: true, email: "member@client.example", displayName: "Member", accountId: MEMBER, via: "jira_project" });
  });

  it("someone without project access is refused", async () => {
    mockWorld({ me: { email: "outsider@else.example", account_id: OUTSIDER } });
    expect(await signIn((id) => isProjectMember(id, { fresh: true }))).toEqual({ ok: false, error: "not_allowed" });
  });

  it("an allowlisted email is allowed without asking Jira", async () => {
    const calls = mockWorld({ me: { email: "LISTED@client.example", account_id: OUTSIDER } });
    const result = await signIn((id) => isProjectMember(id, { fresh: true }));
    expect(result).toMatchObject({ ok: true, via: "allowlist" });
    expect(calls.some((url) => url.includes("permission/search"))).toBe(false);
  });

  it("app/bot and inactive accounts never count as project members", async () => {
    mockWorld();
    expect(await isProjectMember("app:automation", { fresh: true })).toBe(false);
    expect(await isProjectMember("557058:former", { fresh: true })).toBe(false);
    expect(await isProjectMember(MEMBER, { fresh: true })).toBe(true);
  });

  it("reads every page of the project member list", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ accountId: `557058:p1-${i}`, accountType: "atlassian", active: true }));
    mockWorld({ pages: [full, [{ accountId: "557058:on-page-2", accountType: "atlassian", active: true }]] });
    expect(await isProjectMember("557058:on-page-2", { fresh: true })).toBe(true);
  });

  it("Jira unavailable during the check → 'unavailable', no session", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockWorld({ jiraDown: true, me: { email: "member@client.example" } });
    expect(await signIn((id) => isProjectMember(id, { fresh: true }))).toEqual({ ok: false, error: "unavailable" });
  });

  it("mode off → only the allowlist counts", async () => {
    mockWorld();
    expect(await signIn(undefined)).toEqual({ ok: false, error: "not_allowed" });
  });
});

describe("project-access sessions", () => {
  const now = new Date();
  const projectSession = () =>
    createSessionToken({ provider: "atlassian", email: "member@client.example", displayName: "Member", via: "jira_project", accountId: MEMBER }, SECRET, now, 600);

  it("resolve with the account ID kept internal, only while the mode is on", () => {
    expect(resolveSession(projectSession(), getAuthConfig(), now)).toMatchObject({
      email: "member@client.example",
      accessVia: "jira_project",
      projectAccountId: MEMBER,
    });
    vi.stubEnv("DASHBOARD_JIRA_PROJECT_ACCESS", "false");
    expect(resolveSession(projectSession(), getAuthConfig(), now)).toBeNull();
  });

  it("allowlist sessions carry no account ID", () => {
    const token = createSessionToken({ provider: "atlassian", email: "listed@client.example", displayName: null }, SECRET, now, 600);
    const payload = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString());
    expect(payload.aid).toBeUndefined();
    expect(resolveSession(token, getAuthConfig(), now)).toMatchObject({ accessVia: "allowlist" });
  });

  it("getSession re-checks project access on each request (removal revokes access)", async () => {
    const token = projectSession();
    const member = vi.fn().mockResolvedValue(true);
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: token }) }) }));
    vi.doMock("@/lib/jira/project-access", () => ({ isProjectMember: member }));
    vi.resetModules();
    const { getSession } = await import("@/lib/auth/server");
    expect(await getSession()).toMatchObject({ accessVia: "jira_project" });
    expect(member).toHaveBeenCalledWith(MEMBER);
    member.mockResolvedValue(false);
    expect(await getSession()).toBeNull();
    member.mockRejectedValue(new Error("jira down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await getSession()).toBeNull();
    vi.doUnmock("next/headers");
    vi.doUnmock("@/lib/jira/project-access");
    vi.resetModules();
  });
});

describe("configuration and readiness", () => {
  it("Atlassian + project access works without any allowlist or password users", () => {
    vi.stubEnv("DASHBOARD_ALLOWED_EMAILS", "");
    expect(getAuthConfig()).toMatchObject({ status: "enabled", projectAccess: true });
  });

  it("invalid flag value is reported by name", () => {
    vi.stubEnv("DASHBOARD_JIRA_PROJECT_ACCESS", "yes");
    expect(getAuthConfig()).toMatchObject({ status: "misconfigured", problems: ["DASHBOARD_JIRA_PROJECT_ACCESS"] });
  });

  it("project access needs Atlassian sign-in to have any effect", () => {
    vi.stubEnv("ATLASSIAN_CLIENT_ID", "");
    vi.stubEnv("ATLASSIAN_CLIENT_SECRET", "");
    vi.stubEnv("ATLASSIAN_CALLBACK_URL", "");
    vi.stubEnv("DASHBOARD_USERS", "ops@x.example:scrypt.16384.8.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(getAuthConfig()).toMatchObject({ status: "enabled", projectAccess: false });
  });

  const ctx = (projectAccess: ReadinessContext["config"]["projectAccess"]) =>
    ({ config: { projectAccess } }) as unknown as ReadinessContext;

  it("readiness warns while the project is open to every Jira user on the site", () => {
    expect(projectAccessCheck(ctx({ memberCount: 1, openToSite: true }))).toMatchObject({
      status: "warning",
      message: "Anyone with Jira access on this site can sign in, because the project is open to all site users (1 person has access to the Jira project).",
    });
    expect(projectAccessCheck(ctx({ memberCount: 4, openToSite: false }))).toMatchObject({
      status: "pass",
      message: "4 people have access to the Jira project and can sign in with Atlassian.",
    });
    expect(projectAccessCheck(ctx(undefined)).status).toBe("not_applicable");
    expect(projectAccessCheck(ctx(null)).status).toBe("warning");
  });

  it("the callback route is still public and the proxy accepts project-access sessions", async () => {
    const { proxy } = await import("@/proxy");
    const token = createSessionToken({ provider: "atlassian", email: "member@client.example", displayName: null, via: "jira_project", accountId: MEMBER }, SECRET, new Date(), 600);
    const headers = new Headers({ cookie: `__Host-jira_dashboard_session=${token}` });
    expect(proxy(new NextRequest(new URL("/", BASE), { headers })).status).toBe(200);
  });
});
