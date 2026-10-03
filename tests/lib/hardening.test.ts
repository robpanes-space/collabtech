import { afterEach, describe, expect, it, vi } from "vitest";
import { validateEnvironment } from "@/lib/env";
import {
  dashboardTimeZone,
  formatCalendarDate,
  formatDashboardDate,
  formatDashboardDateRange,
  formatDashboardDateTime,
  formatRelativeTime,
  isValidTimeZone,
} from "@/lib/format";
import { isValidIssueKey, jiraBrowseBase, jiraIssueUrl } from "@/lib/jira/links";
import { log, redact } from "@/lib/log";
import { buildContentSecurityPolicy } from "@/lib/security/csp";
import { appVersion } from "@/lib/version";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("time zone formatting", () => {
  // 2026-10-03T16:30Z = Oct 4, 00:30 in Manila (UTC+8) = Oct 3, 12:30 PM in New York (UTC-4).
  const ts = "2026-10-03T16:30:00.000Z";

  it("formats timestamps in the configured zone with Intl (no manual offsets)", () => {
    expect(formatDashboardDate(ts, "UTC")).toBe("Oct 3, 2026");
    expect(formatDashboardDate(ts, "Asia/Manila")).toBe("Oct 4, 2026");
    expect(formatDashboardDate(ts, "America/New_York")).toBe("Oct 3, 2026");
    expect(formatDashboardDateTime(ts, "Asia/Manila")).toBe("Oct 4, 2026, 12:30 AM GMT+8");
    expect(formatDashboardDateTime(ts, "America/Chicago")).toBe("Oct 3, 2026, 11:30 AM CDT");
  });

  it("uses DASHBOARD_TIME_ZONE by default", () => {
    vi.stubEnv("DASHBOARD_TIME_ZONE", "Asia/Manila");
    expect(dashboardTimeZone()).toBe("Asia/Manila");
    expect(formatDashboardDate(ts)).toBe("Oct 4, 2026");
  });

  it("falls back to UTC for invalid or missing zones", () => {
    vi.stubEnv("DASHBOARD_TIME_ZONE", "");
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(dashboardTimeZone("Mars/Olympus")).toBe("UTC");
    expect(dashboardTimeZone("")).toBe("UTC");
    expect(dashboardTimeZone(undefined)).toBe("UTC");
  });

  it("date ranges use the zone and never print invalid values", () => {
    expect(formatDashboardDateRange("2026-10-05T07:28:00.000Z", "2026-10-19T07:28:00.000Z", "Asia/Manila")).toBe(
      "Oct 5 – Oct 19, 2026",
    );
    expect(formatDashboardDateRange(null, null)).toBe("Schedule not set");
    expect(formatDashboardDateRange("garbage", undefined)).toBe("Schedule not set");
    expect(formatDashboardDate("not-a-date")).toBeNull();
  });

  it("relative times", () => {
    const now = new Date("2026-10-03T12:00:00.000Z");
    expect(formatRelativeTime("2026-10-03T11:59:40.000Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-10-03T11:58:00.000Z", now)).toBe("2 minutes ago");
    expect(formatRelativeTime("2026-10-03T09:00:00.000Z", now)).toBe("3 hours ago");
    expect(formatRelativeTime("2026-09-01T09:00:00.000Z", now, "UTC")).toBe("Sep 1, 2026");
  });
});

describe("date-only (Jira calendar dates)", () => {
  it("never shifts the calendar day, whatever the zone", () => {
    for (const zone of ["UTC", "Asia/Manila", "America/New_York", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      vi.stubEnv("DASHBOARD_TIME_ZONE", zone);
      expect(formatCalendarDate("2026-10-10")).toBe("Oct 10, 2026");
      expect(formatCalendarDate("2026-01-01")).toBe("Jan 1, 2026");
    }
  });

  it("is not treated as a timestamp and rejects invalid dates", () => {
    expect(formatDashboardDate("2026-10-10", "Pacific/Pago_Pago")).toBeNull();
    expect(formatCalendarDate("2026-02-30")).toBeNull();
    expect(formatCalendarDate("2026-10-10T00:00:00Z")).toBeNull();
    expect(formatCalendarDate(null)).toBeNull();
  });
});

describe("Jira deep links", () => {
  const base = jiraBrowseBase("https://websprint.example.atlassian.net/");

  it("builds browse URLs from the site origin only", () => {
    expect(base).toBe("https://websprint.example.atlassian.net/browse/");
    expect(jiraBrowseBase("https://site.atlassian.net/rest/api/3?x=1")).toBe("https://site.atlassian.net/browse/");
    expect(jiraIssueUrl(base, "SCRUM-14")).toBe("https://websprint.example.atlassian.net/browse/SCRUM-14");
  });

  it("rejects unsafe bases", () => {
    expect(jiraBrowseBase("http://site.atlassian.net")).toBeNull();
    expect(jiraBrowseBase("https://user:pass@site.atlassian.net")).toBeNull();
    expect(jiraBrowseBase("javascript:alert(1)")).toBeNull();
    expect(jiraBrowseBase(undefined)).toBeNull();
  });

  it.each(["scrum-14", "SCRUM-0", "SCRUM14", "SCRUM-14/../x", "../SCRUM-1", "SCRUM-1?x", " SCRUM-1", "A-1-2", ""])(
    "rejects malformed key %j",
    (key) => {
      expect(isValidIssueKey(key)).toBe(false);
      expect(jiraIssueUrl(base, key)).toBeNull();
    },
  );

  it("returns null when links are disabled", () => {
    expect(jiraIssueUrl(null, "SCRUM-14")).toBeNull();
  });
});

describe("environment validation", () => {
  const complete = {
    NODE_ENV: "production",
    JIRA_BASE_URL: "https://site.atlassian.net",
    JIRA_EMAIL: "bot@site.example",
    JIRA_API_TOKEN: "super-secret-token-value",
    JIRA_PROJECT_KEY: "SCRUM",
    JIRA_BOARD_ID: "1",
    DASHBOARD_USERS: "client@example.com:scrypt.16384.8.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    DASHBOARD_SESSION_SECRET: "x".repeat(40),
    DASHBOARD_TIME_ZONE: "Asia/Manila",
  } as NodeJS.ProcessEnv;

  it("passes with complete production config", () => {
    expect(validateEnvironment(complete)).toEqual({ ok: true, problems: [], warnings: [] });
  });

  it("lists missing production variables by name, never values", () => {
    const report = validateEnvironment({ ...complete, JIRA_API_TOKEN: "", DASHBOARD_SESSION_SECRET: "", DASHBOARD_TIME_ZONE: "" });
    expect(report.ok).toBe(false);
    expect(report.problems.sort()).toEqual(["DASHBOARD_SESSION_SECRET", "DASHBOARD_TIME_ZONE", "JIRA_API_TOKEN"]);
    expect(JSON.stringify(report)).not.toMatch(/super-secret|bot@site|client@example/);
  });

  it("rejects invalid time zones, non-https Jira and bad link flags", () => {
    const report = validateEnvironment({
      ...complete,
      DASHBOARD_TIME_ZONE: "Mars/Olympus",
      JIRA_BASE_URL: "http://site.atlassian.net",
      DASHBOARD_JIRA_LINKS: "maybe",
    });
    expect(report.problems.sort()).toEqual(["DASHBOARD_JIRA_LINKS", "DASHBOARD_TIME_ZONE", "JIRA_BASE_URL"]);
  });

  it("treats a missing time zone and disabled auth as warnings in development", () => {
    const report = validateEnvironment({
      ...complete,
      NODE_ENV: "development",
      DASHBOARD_TIME_ZONE: "",
      DASHBOARD_AUTH_DISABLED: "true",
    });
    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual(["DASHBOARD_AUTH_DISABLED (development only)", "DASHBOARD_TIME_ZONE"]);
  });
});

describe("logging", () => {
  it("redacts sensitive keys and emits one JSON line", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    log("warn", "jira.rate_limited", { path: "/rest/x", apiToken: "abc", authorization: "Basic xyz", cookie: "s=1" });
    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ level: "warn", event: "jira.rate_limited", path: "/rest/x" });
    expect(line.apiToken).toBe("[redacted]");
    expect(line.authorization).toBe("[redacted]");
    expect(line.cookie).toBe("[redacted]");
    expect(redact({ password: "p", sessionSecret: "s" })).toEqual({ password: "[redacted]", sessionSecret: "[redacted]" });
  });
});

describe("security policy and version", () => {
  it("production CSP is strict; dev adds only what React dev tooling needs", () => {
    const prod = buildContentSecurityPolicy("abc", false);
    expect(prod).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("upgrade-insecure-requests");
    expect(prod).not.toContain("unsafe-eval");
    expect(buildContentSecurityPolicy("abc", true)).toContain("'unsafe-eval'");
  });

  it("version label uses package version and short commit only", () => {
    expect(appVersion({ NODE_ENV: "production", VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123" } as NodeJS.ProcessEnv).label).toMatch(/^v\d+\.\d+\.\d+ \(0123456\)$/);
    expect(appVersion({ NODE_ENV: "production", APP_COMMIT_SHA: "not a sha" } as NodeJS.ProcessEnv).commit).toBeNull();
  });
});
