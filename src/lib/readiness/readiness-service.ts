import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getAuthConfig } from "@/lib/auth/config";
import { isValidTimeZone } from "@/lib/format";
import { loadHistory } from "@/lib/history/history-service";
import { getJiraConfig } from "@/lib/jira/config";
import { toJiraApiError } from "@/lib/jira/errors";
import { getProjectStatuses } from "@/lib/jira/issues";
import { getProjectAccessSummary } from "@/lib/jira/project-access";
import { jiraBrowseBase, jiraIssueUrl } from "@/lib/jira/links";
import { loadNormalizedProjectData } from "@/lib/jira/project-data";
import { log } from "@/lib/log";
import { buildReadinessDto } from "./build-readiness";
import type { ProjectReadinessDto } from "./types";

export const READINESS_CACHE_SECONDS = 60;

/**
 * Read-only readiness report. Reuses the (cached) Jira loaders and the history service; computed
 * as one unit and cached for 60 s. History failure is tolerated (history checks degrade).
 */
const getCachedReadiness = unstable_cache(
  async (): Promise<ProjectReadinessDto> => {
    const now = new Date();
    const [data, history, projectStatuses] = await Promise.all([
      loadNormalizedProjectData(now),
      loadHistory(),
      getProjectStatuses().catch((error: unknown) => {
        log("warn", "readiness.statuses_unavailable", { code: toJiraApiError(error).code });
        return null;
      }),
    ]);
    const jira = getJiraConfig();
    const auth = getAuthConfig();
    const projectAccess =
      auth.status === "enabled" && auth.projectAccess
        ? await getProjectAccessSummary().catch((error: unknown) => {
            log("warn", "readiness.project_access_unavailable", { code: toJiraApiError(error).code });
            return null;
          })
        : undefined;
    const linksEnabled = process.env.DASHBOARD_JIRA_LINKS !== "false";
    const browse = linksEnabled ? jiraBrowseBase(jira.baseUrl) : null;
    const timeZone = process.env.DASHBOARD_TIME_ZONE?.trim() || null;
    return buildReadinessDto({
      data,
      history: history.ok ? history.data : null,
      projectStatuses,
      config: {
        blockedStatusNames: jira.blockedStatusNames,
        authStatus: auth.status,
        timeZone,
        timeZoneValid: timeZone !== null && isValidTimeZone(timeZone),
        jiraLinksEnabled: linksEnabled,
        projectAccess,
      },
      now,
      issueUrl: (key) => jiraIssueUrl(browse, key),
    });
  },
  ["jira-readiness-dto-v2"],
  { revalidate: READINESS_CACHE_SECONDS },
);

export const getReadinessData = cache((): Promise<ProjectReadinessDto> => getCachedReadiness());

export type ReadinessResult = { ok: true; data: ProjectReadinessDto } | { ok: false; error: { code: string; message: string } };

export const loadReadiness = cache(async (): Promise<ReadinessResult> => {
  try {
    return { ok: true, data: await getReadinessData() };
  } catch (error) {
    const jiraError = toJiraApiError(error);
    log("error", "readiness.failed", { code: jiraError.code, status: jiraError.status, path: jiraError.path });
    return { ok: false, error: { code: jiraError.code, message: jiraError.friendlyMessage } };
  }
});

/**
 * Client-safe projection for client pages: ONLY the data-confidence signal (never checks,
 * items or facts). Returns null when readiness cannot be computed — callers hide the signal.
 */
export async function loadDataConfidence() {
  const result = await loadReadiness();
  return result.ok ? result.data.dataConfidence : null;
}
