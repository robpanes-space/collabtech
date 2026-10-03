import { beforeAll, describe, expect, it } from "vitest";
import { authenticate } from "@/lib/auth/authenticate";
import { getAuthConfig, parseUsers, passwordVersion } from "@/lib/auth/config";
import { hashPassword, parsePasswordHash, verifyPassword } from "@/lib/auth/password";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import {
  createSessionToken,
  resolveSession,
  safeNextPath,
  sessionCookieName,
  verifySessionToken,
} from "@/lib/auth/session";

const SECRET = "test-session-secret-0123456789abcdef";
const NOW = new Date("2026-10-03T12:00:00.000Z");
let aliceHash = "";
let bobHash = "";

beforeAll(async () => {
  aliceHash = await hashPassword("alice-correct-password");
  bobHash = await hashPassword("bob-correct-password");
});

const env = (overrides: Record<string, string | undefined> = {}) =>
  ({
    NODE_ENV: "production",
    DASHBOARD_USERS: `Alice@Client.com:${aliceHash}, bob@client.com:${bobHash}`,
    DASHBOARD_SESSION_SECRET: SECRET,
    ...overrides,
  }) as NodeJS.ProcessEnv;

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    expect(await verifyPassword("alice-correct-password", aliceHash)).toBe(true);
    expect(await verifyPassword("wrong", aliceHash)).toBe(false);
    expect(aliceHash).toMatch(/^scrypt\.16384\.8\.1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(aliceHash).not.toContain("$");
  });

  it("never verifies malformed hashes", async () => {
    expect(parsePasswordHash("plaintext")).toBeNull();
    expect(parsePasswordHash("scrypt.1000.8.1.abc.def")).toBeNull();
    expect(await verifyPassword("x", "scrypt.oops")).toBe(false);
  });
});

describe("user allowlist configuration", () => {
  it("parses, trims and lowercases emails; never exposes hashes beyond the server", () => {
    const { users, malformed } = parseUsers(`  Alice@Client.com : ${aliceHash} ,\n bob@client.com:${bobHash}`);
    expect([...users.keys()]).toEqual(["alice@client.com", "bob@client.com"]);
    expect(malformed).toBe(0);
  });

  it("counts malformed entries", () => {
    expect(parseUsers("not-an-email:x, carol@client.com:plain").malformed).toBe(2);
  });

  it("is enabled with valid config", () => {
    expect(getAuthConfig(env()).status).toBe("enabled");
  });

  it("reports missing/invalid variables by name only", () => {
    const config = getAuthConfig(env({ DASHBOARD_USERS: "", DASHBOARD_SESSION_SECRET: "short" }));
    expect(config).toEqual({ status: "misconfigured", problems: ["DASHBOARD_USERS", "DASHBOARD_SESSION_SECRET"] });
    expect(JSON.stringify(config)).not.toContain("short");
    expect(getAuthConfig(env({ DASHBOARD_USERS: `ok@client.com:${aliceHash}, broken` })).status).toBe("misconfigured");
  });

  it("allows disabling auth only outside production", () => {
    expect(getAuthConfig(env({ NODE_ENV: "development", DASHBOARD_AUTH_DISABLED: "true" })).status).toBe("disabled");
    expect(getAuthConfig(env({ DASHBOARD_AUTH_DISABLED: "true" })).status).toBe("enabled");
  });
});

describe("authenticate", () => {
  it("accepts an allowed user (email case-insensitive)", async () => {
    const result = await authenticate(" ALICE@client.com ", "alice-correct-password", getAuthConfig(env()));
    expect(result).toMatchObject({ ok: true, email: "alice@client.com" });
  });

  it("rejects a wrong password", async () => {
    expect(await authenticate("alice@client.com", "nope", getAuthConfig(env()))).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
  });

  it("rejects a user not on the allowlist with the same generic reason", async () => {
    expect(await authenticate("mallory@evil.com", "alice-correct-password", getAuthConfig(env()))).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
  });

  it("refuses when auth is not configured", async () => {
    expect(await authenticate("alice@client.com", "x", getAuthConfig(env({ DASHBOARD_USERS: "" })))).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });
});

describe("session tokens", () => {
  const config = () => getAuthConfig(env());
  const token = () => createSessionToken({ provider: "password", email: "Alice@client.com", passwordHash: aliceHash }, SECRET, NOW, 3600);

  it("contains only email, password version and timestamps (no Jira data or secrets)", () => {
    const payload = JSON.parse(Buffer.from(token().split(".")[0]!, "base64url").toString("utf8"));
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "name", "prv", "pv", "sub", "v"]);
    expect(payload.prv).toBe("password");
    expect(payload.sub).toBe("alice@client.com");
    expect(payload.pv).toBe(passwordVersion(aliceHash));
    const serialized = token();
    expect(serialized).not.toContain(aliceHash);
    expect(serialized).not.toContain(SECRET);
  });

  it("resolves a valid session for an allowed user", () => {
    expect(resolveSession(token(), config(), NOW)).toEqual({
      email: "alice@client.com",
      displayName: null,
      authProvider: "password",
      accessVia: "allowlist",
      expiresAt: "2026-10-03T13:00:00.000Z",
    });
  });

  it("rejects tampered, wrongly signed, malformed and expired tokens", () => {
    const [body, sig] = token().split(".");
    const forged = Buffer.from(JSON.stringify({ v: 1, sub: "bob@client.com", pv: "x", iat: 0, exp: 9e9 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
    expect(verifySessionToken(token(), "another-secret-0123456789abcdefgh", NOW)).toBeNull();
    expect(verifySessionToken(`${body}`, SECRET, NOW)).toBeNull();
    expect(verifySessionToken(`${body}.${sig}.extra`, SECRET, NOW)).toBeNull();
    expect(verifySessionToken(undefined, SECRET, NOW)).toBeNull();
    expect(verifySessionToken(token(), SECRET, new Date("2026-10-03T13:00:01.000Z"))).toBeNull();
  });

  it("revokes sessions when the user is removed or their password changes", async () => {
    const removed = getAuthConfig(env({ DASHBOARD_USERS: `bob@client.com:${bobHash}` }));
    expect(resolveSession(token(), removed, NOW)).toBeNull();
    const rotated = getAuthConfig(env({ DASHBOARD_USERS: `alice@client.com:${await hashPassword("new-password-123")}` }));
    expect(resolveSession(token(), rotated, NOW)).toBeNull();
  });

  it("uses a __Host- cookie in production", () => {
    expect(sessionCookieName(env())).toBe("__Host-jira_dashboard_session");
    expect(sessionCookieName(env({ NODE_ENV: "development" }))).toBe("jira_dashboard_session");
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/sprints/1", "/sprints/1"],
    ["/risks?filter=P0", "/risks?filter=P0"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/login", "/"],
    ["/api/jira/dashboard", "/"],
    [undefined, "/"],
    [["/a"], "/"],
  ] as const)("%j → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("login rate limiter", () => {
  it("blocks after the limit within the window and resets after it", () => {
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.attempt("k", 0)).toBe(true);
    expect(limiter.attempt("k", 1)).toBe(true);
    expect(limiter.attempt("k", 2)).toBe(false);
    expect(limiter.attempt("k", 1001)).toBe(true);
  });
});
