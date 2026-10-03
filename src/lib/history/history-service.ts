import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { fetchChangelogs, getStatusCatalog } from "@/lib/jira/changelog";
import { getJiraConfig } from "@/lib/jira/config";
import { toJiraApiError } from "@/lib/jira/errors";
import { jiraBrowseBase } from "@/lib/jira/links";
import { loadNormalizedProjectData } from "@/lib/jira/project-data";
import { dashboardTimeZone } from "@/lib/format";
import { log } from "@/lib/log";
import { buildHistoryDto, historyScope } from "./build-history";
import type { HistoryDto } from "./types";

/** Historical changelog changes slowly; the whole history dataset is cached as ONE unit. */
export const HISTORY_CACHE_SECONDS = 300;

/** System fields whose history matters; custom fields come from discovery (never hard-coded). */
const SYSTEM_HISTORY_FIELDS = ["status", "assignee", "priority", "labels", "resolution"];

const getCachedHistory = unstable_cache(
  async (): Promise<HistoryDto> => {
    const started = Date.now();
    const now = new Date();
    const data = await loadNormalizedProjectData(now);
    const tracked = historyScope(data);
    const fieldIds = [...SYSTEM_HISTORY_FIELDS, data.metadata.sprintField, data.metadata.storyPointsField].filter(
      (id): id is string => Boolean(id),
    );
    const [{ changelogs, requestCount }, statusCatalog] = await Promise.all([
      fetchChangelogs(
        tracked.map((issue) => issue.id),
        fieldIds,
      ),
      getStatusCatalog(),
    ]);
    const browse = process.env.DASHBOARD_JIRA_LINKS === "false" ? null : jiraBrowseBase(getJiraConfig().baseUrl);
    const dto = buildHistoryDto({
      data,
      changelogs,
      statusCatalog,
      now,
      timeZone: dashboardTimeZone(),
      cacheSeconds: HISTORY_CACHE_SECONDS,
      jiraBrowseBaseUrl: browse,
    });
    log("info", "history.refreshed", {
      durationMs: Date.now() - started,
      issues: tracked.length,
      changelogRequests: requestCount,
      histories: changelogs.reduce((n, l) => n + l.changeHistories.length, 0),
    });
    return dto;
  },
  ["jira-history-dto-v3"],
  { revalidate: HISTORY_CACHE_SECONDS },
);

export const getHistoryData = cache((): Promise<HistoryDto> => getCachedHistory());

export type HistoryResult = { ok: true; data: HistoryDto } | { ok: false; error: { code: string; message: string } };

/** Never throws: a history failure must not break the current-state dashboard. */
export const loadHistory = cache(async (): Promise<HistoryResult> => {
  try {
    return { ok: true, data: await getHistoryData() };
  } catch (error) {
    const jiraError = toJiraApiError(error);
    log("error", "history.refresh_failed", { code: jiraError.code, status: jiraError.status, path: jiraError.path });
    return { ok: false, error: { code: jiraError.code, message: "Historical analytics are temporarily unavailable." } };
  }
});
