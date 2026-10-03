import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getJiraConfig } from "@/lib/jira/config";
import { toJiraApiError } from "@/lib/jira/errors";
import { jiraBrowseBase } from "@/lib/jira/links";
import { loadNormalizedProjectData } from "@/lib/jira/project-data";
import { log } from "@/lib/log";
import { buildDashboardDto } from "./dashboard";
import type { DashboardDto } from "./types";

export const DASHBOARD_REVALIDATE_SECONDS = 60;

/** Jira links are on unless DASHBOARD_JIRA_LINKS=false (e.g. the client has no Jira access). */
function browseBaseUrl(): string | null {
  if (process.env.DASHBOARD_JIRA_LINKS === "false") return null;
  return jiraBrowseBase(getJiraConfig().baseUrl);
}

/**
 * Fetch + normalize + metric engine, cached as ONE unit for 60s (stale-while-revalidate), so
 * `sync.timestamp` is the real time the Jira data was read. Errors are never cached.
 */
const getCachedDashboard = unstable_cache(
  async (): Promise<DashboardDto> => {
    const now = new Date();
    const started = Date.now();
    const data = await loadNormalizedProjectData(now);
    let dto: DashboardDto;
    try {
      dto = buildDashboardDto(data, now, {
        jiraBrowseBaseUrl: browseBaseUrl(),
        refreshIntervalSeconds: DASHBOARD_REVALIDATE_SECONDS,
      });
    } catch (error) {
      log("error", "dashboard.dto_build_failed", { error });
      throw error;
    }
    log("info", "dashboard.refreshed", { durationMs: Date.now() - started, issues: data.issues.length });
    return dto;
  },
  ["jira-dashboard-dto-v2"],
  { revalidate: DASHBOARD_REVALIDATE_SECONDS },
);

/** One dashboard payload per request, shared by every component that needs it. */
export const getDashboardData = cache((): Promise<DashboardDto> => getCachedDashboard());

export type DashboardResult =
  | { ok: true; data: DashboardDto }
  | { ok: false; error: { code: string; message: string } };

/** Client-safe wrapper for pages: never throws, never exposes internals. */
export const loadDashboard = cache(async (): Promise<DashboardResult> => {
  try {
    return { ok: true, data: await getDashboardData() };
  } catch (error) {
    const jiraError = toJiraApiError(error);
    log("error", "dashboard.refresh_failed", { code: jiraError.code, status: jiraError.status, path: jiraError.path });
    return { ok: false, error: { code: jiraError.code, message: jiraError.friendlyMessage } };
  }
});
