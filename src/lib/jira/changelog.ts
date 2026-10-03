import "server-only";
import { jiraFetch } from "./client";
import { JiraApiError } from "./errors";
import {
  bulkChangelogPageSchema,
  statusCatalogSchema,
  type RawIssueChangelog,
  type RawStatusCatalog,
} from "./history-schemas";

const PLATFORM = "/rest/api/3";
/** Jira's documented maximum issues per bulk changelog request. */
export const CHANGELOG_BATCH_SIZE = 1000;
const MAX_PAGES_PER_BATCH = 200;

/**
 * Fetches changelogs for many issues with POST /rest/api/3/changelog/bulkfetch:
 * batches of ≤1000 issue IDs/keys, each paginated by nextPageToken, run SEQUENTIALLY (no
 * request fan-out; the shared client handles 429/Retry-After). Histories for an issue that
 * span pages are merged.
 */
export async function fetchChangelogs(
  issueIdsOrKeys: readonly string[],
  fieldIds: readonly string[] = [],
): Promise<{ changelogs: RawIssueChangelog[]; requestCount: number }> {
  const byIssue = new Map<string, RawIssueChangelog>();
  let requestCount = 0;
  for (let start = 0; start < issueIdsOrKeys.length; start += CHANGELOG_BATCH_SIZE) {
    const batch = issueIdsOrKeys.slice(start, start + CHANGELOG_BATCH_SIZE);
    let nextPageToken: string | undefined;
    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES_PER_BATCH) {
        throw new JiraApiError("INVALID_RESPONSE", { path: `${PLATFORM}/changelog/bulkfetch`, detail: "Changelog pagination exceeded limit" });
      }
      requestCount++;
      const response = await jiraFetch(`${PLATFORM}/changelog/bulkfetch`, {
        method: "POST",
        schema: bulkChangelogPageSchema,
        body: {
          issueIdsOrKeys: batch,
          maxResults: 1000,
          ...(fieldIds.length > 0 ? { fieldIds } : {}),
          ...(nextPageToken ? { nextPageToken } : {}),
        },
      });
      for (const log of response.issueChangeLogs) {
        const existing = byIssue.get(log.issueId);
        if (existing) existing.changeHistories.push(...log.changeHistories);
        else byIssue.set(log.issueId, { issueId: log.issueId, changeHistories: [...log.changeHistories] });
      }
      if (!response.nextPageToken) break;
      nextPageToken = response.nextPageToken;
    }
  }
  return { changelogs: [...byIssue.values()], requestCount };
}

/** All statuses with their categories — maps historical status IDs to todo/in_progress/done. */
export async function getStatusCatalog(): Promise<RawStatusCatalog> {
  return jiraFetch(`${PLATFORM}/status`, { schema: statusCatalogSchema, revalidate: 3600 });
}
