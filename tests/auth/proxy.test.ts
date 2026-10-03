import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session";
import { proxy } from "@/proxy";

const SECRET = "proxy-test-secret-0123456789abcdefgh";
const COOKIE = "__Host-jira_dashboard_session";
let hash = "";

beforeAll(async () => {
  hash = await hashPassword("client-password-123");
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DASHBOARD_USERS", `client@example.com:${hash}`);
  vi.stubEnv("DASHBOARD_SESSION_SECRET", SECRET);
});

afterEach(() => vi.unstubAllEnvs());

function request(path: string, token?: string) {
  const headers = new Headers();
  if (token) headers.set("cookie", `${COOKIE}=${token}`);
  return new NextRequest(new URL(path, "https://dashboard.example.com"), { headers });
}

const validToken = () => createSessionToken({ provider: "password", email: "client@example.com", passwordHash: hash }, SECRET, new Date(), 3600);

describe("proxy access control", () => {
  it.each(["/", "/sprints", "/sprints/1", "/risks"])("redirects unauthenticated %s to /login with next", (path) => {
    const response = proxy(request(path));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!, "https://dashboard.example.com");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(path);
  });

  it.each(["/api/jira/dashboard", "/api/jira/health"])("returns 401 JSON for unauthenticated %s", async (path) => {
    const response = proxy(request(path));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Sign in to access project data." } });
  });

  it("lets authenticated users through with a nonce CSP", () => {
    const response = proxy(request("/sprints/1", validToken()));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    const csp = response.headers.get("content-security-policy")!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("treats a user removed from the allowlist as unauthenticated", () => {
    const token = validToken();
    vi.stubEnv("DASHBOARD_USERS", `someone-else@example.com:${hash}`);
    expect(proxy(request("/", token)).status).toBe(307);
    expect(proxy(request("/api/jira/dashboard", token)).status).toBe(401);
  });

  it("keeps /login and /api/health public", () => {
    expect(proxy(request("/login")).status).toBe(200);
    expect(proxy(request("/api/health")).status).toBe(200);
  });

  it("sends signed-in users away from /login", () => {
    const response = proxy(request("/login", validToken()));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!, "https://dashboard.example.com").pathname).toBe("/");
  });

  it("fails closed when authentication is misconfigured", () => {
    vi.stubEnv("DASHBOARD_SESSION_SECRET", "");
    expect(proxy(request("/", validToken())).status).toBe(307);
    expect(proxy(request("/api/jira/dashboard", validToken())).status).toBe(401);
  });

  it("ignores DASHBOARD_AUTH_DISABLED in production", () => {
    vi.stubEnv("DASHBOARD_AUTH_DISABLED", "true");
    expect(proxy(request("/")).status).toBe(307);
  });
});
