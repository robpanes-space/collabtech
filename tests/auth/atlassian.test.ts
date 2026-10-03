import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ATLASSIAN_ME_URL, ATLASSIAN_TOKEN_URL, buildAuthorizeUrl } from "@/lib/auth/atlassian";
import { getAuthConfig, isAdminEmail, parseAtlassianConfig } from "@/lib/auth/config";
import { loginErrorMessage } from "@/lib/auth/login-errors";
import { createOAuthState, verifyOAuthState } from "@/lib/auth/oauth-state";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken, resolveSession } from "@/lib/auth/session";
import { proxy } from "@/proxy";

const { GET: start } = await import("@/app/api/auth/atlassian/start/route");
const { GET: callback } = await import("@/app/api/auth/atlassian/callback/route");

const SECRET = "atlassian-test-secret-0123456789abcdef";
const CLIENT_SECRET = "atl-client-secret-value";
const ACCESS_TOKEN = "atl-access-token-SHOULD-NEVER-LEAK";
const BASE = "https://dashboard.example.com";
const CALLBACK = `${BASE}/api/auth/atlassian/callback`;
const SESSION_COOKIE = "__Host-jira_dashboard_session";
const STATE_COOKIE = "__Host-jira_dashboard_oauth";
let adminHash = "";

beforeAll(async () => {
  adminHash = await hashPassword("admin-password-123");
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DASHBOARD_SESSION_SECRET", SECRET);
  vi.stubEnv("DASHBOARD_USERS", `ops@company.example:${adminHash}`);
  vi.stubEnv("DASHBOARD_ALLOWED_EMAILS", "Client@Example.com, ops@company.example");
  vi.stubEnv("DASHBOARD_ADMIN_EMAILS", "ops@company.example");
  vi.stubEnv("ATLASSIAN_CLIENT_ID", "client-id-123");
  vi.stubEnv("ATLASSIAN_CLIENT_SECRET", CLIENT_SECRET);
  vi.stubEnv("ATLASSIAN_CALLBACK_URL", CALLBACK);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const req = (path: string, cookies: Record<string, string> = {}) => {
  const headers = new Headers();
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(new URL(path, BASE), { headers });
};

/** Mocks Atlassian: token endpoint and /me. */
function mockAtlassian(options: { token?: Response; me?: Response } = {}) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const href = String(url);
    if (href === ATLASSIAN_TOKEN_URL) {
      return options.token ?? Response.json({ access_token: ACCESS_TOKEN, expires_in: 3600, scope: "read:me" });
    }
    if (href === ATLASSIAN_ME_URL) {
      return options.me ?? Response.json({ account_type: "atlassian", account_status: "active", email: "CLIENT@example.com", name: "Casey Client", account_id: "557058:abc" });
    }
    throw new Error(`unexpected fetch ${href}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Runs /start, returns the state + cookie the browser would carry to the callback. */
async function beginFlow(next = "/sprints/1") {
  const response = start(req(`/api/auth/atlassian/start?next=${encodeURIComponent(next)}`));
  const authorize = new URL(response.headers.get("location")!);
  const cookie = response.cookies.get(STATE_COOKIE)!;
  return { response, authorize, state: authorize.searchParams.get("state")!, cookieValue: cookie.value, cookie };
}

/** Same-origin redirects use relative Location headers (resolved against the public URL). */
const location = (response: Response) => new URL(response.headers.get("location")!, BASE);

describe("authorization redirect", () => {
  it("redirects to Atlassian with identity-only scope, state and exact callback", async () => {
    const { response, authorize, state, cookie } = await beginFlow();
    expect(response.status).toBe(307);
    expect(`${authorize.origin}${authorize.pathname}`).toBe("https://auth.atlassian.com/authorize");
    expect(Object.fromEntries(authorize.searchParams)).toEqual({
      audience: "api.atlassian.com",
      client_id: "client-id-123",
      scope: "read:me",
      redirect_uri: CALLBACK,
      state,
      response_type: "code",
      prompt: "consent",
    });
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
    expect(response.headers.get("location")).not.toContain(CLIENT_SECRET);
  });

  it("generates a fresh state each time", async () => {
    const a = await beginFlow();
    const b = await beginFlow();
    expect(a.state).not.toBe(b.state);
  });

  it("is not configured → back to /login with a safe message", () => {
    vi.stubEnv("ATLASSIAN_CLIENT_ID", "");
    vi.stubEnv("ATLASSIAN_CLIENT_SECRET", "");
    vi.stubEnv("ATLASSIAN_CALLBACK_URL", "");
    const response = start(req("/api/auth/atlassian/start"));
    expect(location(response).pathname).toBe("/login");
    expect(location(response).searchParams.get("error")).toBe("atlassian_not_configured");
  });
});

describe("state", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  it("validates matching state and returns the safe next path", () => {
    const { state, cookieValue } = createOAuthState("/risks", SECRET, now);
    expect(verifyOAuthState(cookieValue, state, SECRET, now)).toEqual({ ok: true, next: "/risks" });
  });
  it("rejects wrong state, tampered/foreign cookie, and expiry", () => {
    const { state, cookieValue } = createOAuthState("/", SECRET, now);
    expect(verifyOAuthState(cookieValue, `${state}x`, SECRET, now).ok).toBe(false);
    expect(verifyOAuthState(cookieValue.replace(/.$/, "x"), state, SECRET, now).ok).toBe(false);
    expect(verifyOAuthState(cookieValue, state, "another-secret-0123456789abcdefghij", now).ok).toBe(false);
    expect(verifyOAuthState(undefined, state, SECRET, now).ok).toBe(false);
    expect(verifyOAuthState(cookieValue, state, SECRET, new Date(now.getTime() + 601_000)).ok).toBe(false);
    const sessionToken = createSessionToken({ provider: "atlassian", email: "a@b.co", displayName: null }, SECRET, now, 600);
    expect(verifyOAuthState(sessionToken, state, SECRET, now).ok).toBe(false);
  });
  it("never trusts an external next path", () => {
    const { state, cookieValue } = createOAuthState("https://evil.example", SECRET, now);
    expect(verifyOAuthState(cookieValue, state, SECRET, now)).toEqual({ ok: true, next: "/" });
  });
});

describe("callback", () => {
  it("redirects use relative same-origin Locations (correct behind reverse proxies)", async () => {
    mockAtlassian();
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { state, cookieValue } = await beginFlow("/risks");
    const ok = await callback(req(`/api/auth/atlassian/callback?code=abc&state=${state}`, { [STATE_COOKIE]: cookieValue }));
    expect(ok.headers.get("location")).toBe("/risks");
    const failed = await callback(req("/api/auth/atlassian/callback?error=access_denied"));
    expect(failed.headers.get("location")).toBe("/login?error=atlassian_cancelled");
  });

  it("valid callback → dashboard session (Atlassian provider), state cookie cleared, token discarded", async () => {
    const fetchMock = mockAtlassian();
    const logs = vi.spyOn(console, "info").mockImplementation(() => {});
    const { state, cookieValue } = await beginFlow("/sprints/1");
    const response = await callback(req(`/api/auth/atlassian/callback?code=abc&state=${state}`, { [STATE_COOKIE]: cookieValue }));

    expect(response.status).toBe(307);
    expect(location(response).pathname).toBe("/sprints/1");
    const session = response.cookies.get(SESSION_COOKIE)!;
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(response.cookies.get(STATE_COOKIE)?.value).toBe("");

    const resolved = resolveSession(session.value, getAuthConfig(), new Date());
    expect(resolved).toMatchObject({ email: "client@example.com", displayName: "Casey Client", authProvider: "atlassian" });

    // Token exchange used the secret server-side; /me used the bearer token.
    const [, tokenInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(tokenInit.body as string)).toMatchObject({ grant_type: "authorization_code", code: "abc", redirect_uri: CALLBACK });

    // The access token / account ID never reach the browser or logs.
    const visible = [response.headers.get("location"), ...response.headers.getSetCookie(), JSON.stringify(logs.mock.calls)].join("\n");
    expect(visible).not.toContain(ACCESS_TOKEN);
    expect(visible).not.toContain(CLIENT_SECRET);
    const payload = Buffer.from(session.value.split(".")[0]!, "base64url").toString();
    expect(payload).not.toMatch(/access|token|557058|account/i);
  });

  it("invalid state → no session", async () => {
    mockAtlassian();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cookieValue } = await beginFlow();
    const response = await callback(req("/api/auth/atlassian/callback?code=abc&state=forged", { [STATE_COOKIE]: cookieValue }));
    expect(location(response).searchParams.get("error")).toBe("atlassian_invalid_state");
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("missing state cookie (CSRF / login injection) → no session", async () => {
    mockAtlassian();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state } = await beginFlow();
    const response = await callback(req(`/api/auth/atlassian/callback?code=abc&state=${state}`));
    expect(location(response).searchParams.get("error")).toBe("atlassian_invalid_state");
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("missing code → failed", async () => {
    const { state, cookieValue } = await beginFlow();
    const response = await callback(req(`/api/auth/atlassian/callback?state=${state}`, { [STATE_COOKIE]: cookieValue }));
    expect(location(response).searchParams.get("error")).toBe("atlassian_failed");
  });

  it("user cancels → cancelled", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { state, cookieValue } = await beginFlow();
    const response = await callback(req(`/api/auth/atlassian/callback?error=access_denied&state=${state}`, { [STATE_COOKIE]: cookieValue }));
    expect(location(response).searchParams.get("error")).toBe("atlassian_cancelled");
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it.each([
    ["expired code", { token: Response.json({ error: "invalid_grant" }, { status: 403 }) }, "atlassian_expired"],
    // Atlassian's real response for a bad/expired code (verified against auth.atlassian.com).
    ["expired code (Atlassian form)", { token: Response.json({ error: "invalid_request", error_description: "authorization_code is invalid" }, { status: 400 }) }, "atlassian_expired"],
    ["other token error", { token: Response.json({ error: "invalid_request", error_description: "missing parameter" }, { status: 400 }) }, "atlassian_failed"],
    ["provider down", { token: new Response("", { status: 503 }) }, "atlassian_unavailable"],
    ["/me down", { me: new Response("", { status: 502 }) }, "atlassian_unavailable"],
    ["no email", { me: Response.json({ account_type: "atlassian", account_status: "active", name: "No Email" }) }, "atlassian_no_email"],
    ["inactive account", { me: Response.json({ account_type: "atlassian", account_status: "inactive", email: "client@example.com" }) }, "atlassian_failed"],
    ["unapproved email", { me: Response.json({ account_type: "atlassian", account_status: "active", email: "stranger@else.com" }) }, "atlassian_not_allowed"],
  ] as const)("%s → %s, no session, no payload echoed", async (_, mocks, error) => {
    mockAtlassian(mocks as never);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { state, cookieValue } = await beginFlow();
    const response = await callback(req(`/api/auth/atlassian/callback?code=abc&state=${state}`, { [STATE_COOKIE]: cookieValue }));
    expect(location(response).searchParams.get("error")).toBe(error);
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
    expect(response.headers.get("location")).not.toMatch(/stranger|invalid_grant|access_token/);
  });

  it("network failure to Atlassian → unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { state, cookieValue } = await beginFlow();
    const response = await callback(req(`/api/auth/atlassian/callback?code=abc&state=${state}`, { [STATE_COOKIE]: cookieValue }));
    expect(location(response).searchParams.get("error")).toBe("atlassian_unavailable");
  });

  it("not allowed message is client-safe", () => {
    expect(loginErrorMessage("atlassian_not_allowed")).toBe("You do not have access to this dashboard.");
    expect(loginErrorMessage("toString")).toBeNull();
    expect(loginErrorMessage("<script>")).toBeNull();
  });
});

describe("one identity across providers, admin, revocation", () => {
  it("same email via password and Atlassian is the same dashboard user; admin either way", () => {
    const config = getAuthConfig();
    const now = new Date();
    const viaPassword = resolveSession(createSessionToken({ provider: "password", email: "OPS@company.example", passwordHash: adminHash }, SECRET, now, 600), config, now);
    const viaAtlassian = resolveSession(createSessionToken({ provider: "atlassian", email: "ops@company.example", displayName: "Ops" }, SECRET, now, 600), config, now);
    expect(viaPassword?.email).toBe("ops@company.example");
    expect(viaAtlassian?.email).toBe("ops@company.example");
    expect(isAdminEmail(viaAtlassian!.email)).toBe(true);
    const client = resolveSession(createSessionToken({ provider: "atlassian", email: "client@example.com", displayName: null }, SECRET, now, 600), config, now);
    expect(isAdminEmail(client!.email)).toBe(false);
  });

  it("password users may also use Atlassian (allowlist = DASHBOARD_ALLOWED_EMAILS ∪ DASHBOARD_USERS)", () => {
    vi.stubEnv("DASHBOARD_ALLOWED_EMAILS", "client@example.com");
    const config = getAuthConfig();
    expect(config.status === "enabled" && [...config.allowedEmails].sort()).toEqual(["client@example.com", "ops@company.example"]);
  });

  it("removing an email from the allowlist revokes its Atlassian session", () => {
    const now = new Date();
    const token = createSessionToken({ provider: "atlassian", email: "client@example.com", displayName: null }, SECRET, now, 600);
    expect(resolveSession(token, getAuthConfig(), now)).not.toBeNull();
    vi.stubEnv("DASHBOARD_ALLOWED_EMAILS", "");
    expect(resolveSession(token, getAuthConfig(), now)).toBeNull();
  });

  it("an Atlassian session cannot impersonate a password session (no password fingerprint)", () => {
    const now = new Date();
    vi.stubEnv("DASHBOARD_ALLOWED_EMAILS", "");
    const token = createSessionToken({ provider: "atlassian", email: "ops@company.example", displayName: null }, SECRET, now, 600);
    // ops@ is a password user, therefore allowed — but the session stays an Atlassian session.
    expect(resolveSession(token, getAuthConfig(), now)?.authProvider).toBe("atlassian");
  });

  it("legacy v1 password sessions remain valid after the upgrade", async () => {
    const { createHmac } = await import("node:crypto");
    const { passwordVersion } = await import("@/lib/auth/config");
    const iat = Math.floor(Date.now() / 1000);
    const body = Buffer.from(JSON.stringify({ v: 1, sub: "ops@company.example", pv: passwordVersion(adminHash), iat, exp: iat + 600 })).toString("base64url");
    const token = `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`;
    expect(resolveSession(token, getAuthConfig(), new Date())).toMatchObject({ email: "ops@company.example", authProvider: "password" });
  });
});

describe("configuration", () => {
  const env = (o: Record<string, string>) => ({ NODE_ENV: "production", ...o }) as unknown as NodeJS.ProcessEnv;
  it("all three or none; reports names only", () => {
    expect(parseAtlassianConfig(env({}))).toEqual({ config: null, problems: [] });
    expect(parseAtlassianConfig(env({ ATLASSIAN_CLIENT_ID: "x" })).problems).toEqual(["ATLASSIAN_CLIENT_SECRET", "ATLASSIAN_CALLBACK_URL"]);
  });
  it("callback must be https and the exact callback path", () => {
    const base = { ATLASSIAN_CLIENT_ID: "x", ATLASSIAN_CLIENT_SECRET: "y" };
    expect(parseAtlassianConfig(env({ ...base, ATLASSIAN_CALLBACK_URL: "http://dashboard.example.com/api/auth/atlassian/callback" })).problems).toEqual(["ATLASSIAN_CALLBACK_URL"]);
    expect(parseAtlassianConfig(env({ ...base, ATLASSIAN_CALLBACK_URL: "https://dashboard.example.com/callback" })).problems).toEqual(["ATLASSIAN_CALLBACK_URL"]);
    expect(parseAtlassianConfig(env({ ...base, ATLASSIAN_CALLBACK_URL: CALLBACK })).config).not.toBeNull();
    const dev = { ...base, NODE_ENV: "development", ATLASSIAN_CALLBACK_URL: "http://localhost:3000/api/auth/atlassian/callback" };
    expect(parseAtlassianConfig(dev as unknown as NodeJS.ProcessEnv).config).not.toBeNull();
  });
  it("Atlassian-only deployments need an allowlist", () => {
    vi.stubEnv("DASHBOARD_USERS", "");
    vi.stubEnv("DASHBOARD_ALLOWED_EMAILS", "");
    expect(getAuthConfig()).toEqual({ status: "misconfigured", problems: ["DASHBOARD_ALLOWED_EMAILS"] });
    vi.stubEnv("DASHBOARD_ALLOWED_EMAILS", "client@example.com");
    expect(getAuthConfig().status).toBe("enabled");
  });
  it("invalid allowlist entries are reported", () => {
    vi.stubEnv("DASHBOARD_ALLOWED_EMAILS", "client@example.com, not-an-email");
    expect(getAuthConfig()).toMatchObject({ status: "misconfigured", problems: ["DASHBOARD_ALLOWED_EMAILS"] });
  });
});

describe("routes", () => {
  it("OAuth routes are public; dashboard and data APIs still require a session", () => {
    expect(proxy(req("/api/auth/atlassian/start")).status).toBe(200);
    expect(proxy(req("/api/auth/atlassian/callback?code=x&state=y")).status).toBe(200);
    expect(proxy(req("/")).status).toBe(307);
    expect(proxy(req("/api/jira/dashboard")).status).toBe(401);
  });

  it("an Atlassian session passes the proxy", () => {
    const token = createSessionToken({ provider: "atlassian", email: "client@example.com", displayName: "Casey" }, SECRET, new Date(), 600);
    expect(proxy(req("/", { [SESSION_COOKIE]: token })).status).toBe(200);
  });

  it("authorize URL contains no secret", () => {
    const config = getAuthConfig();
    if (config.status !== "enabled" || !config.atlassian) throw new Error("expected Atlassian config");
    expect(buildAuthorizeUrl(config.atlassian, "s")).not.toContain(CLIENT_SECRET);
  });
});
