import "server-only";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { jiraFetch } from "./client";
import { getJiraConfig } from "./config";

/**
 * Who has access to the Jira project (Browse Projects), read with the dashboard's Jira SERVICE
 * ACCOUNT — never with a signed-in user's token. Matching is by Atlassian account ID (the same ID
 * Atlassian sign-in returns), because Jira hides most users' emails.
 *
 * Jira ignores an accountId filter on this endpoint, so the whole list is fetched (paginated),
 * cached as one unit for 5 minutes, and re-fetched on demand at sign-in.
 * Only active human accounts count (app/bot accounts are excluded).
 */
export const PROJECT_ACCESS_CACHE_SECONDS = 300;
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

const usersSchema = z.array(
  z.object({ accountId: z.string(), accountType: z.string().nullish(), active: z.boolean().nullish() }),
);

async function fetchProjectMemberIds(revalidate: number | false): Promise<string[]> {
  const { projectKey } = getJiraConfig();
  const ids: string[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const users = await jiraFetch("/rest/api/3/user/permission/search", {
      schema: usersSchema,
      query: { projectKey, permissions: "BROWSE_PROJECTS", startAt: page * PAGE_SIZE, maxResults: PAGE_SIZE },
      revalidate,
    });
    for (const user of users) {
      if (user.accountType === "atlassian" && user.active !== false) ids.push(user.accountId);
    }
    if (users.length < PAGE_SIZE) break;
  }
  return [...new Set(ids)];
}

const getCachedProjectMemberIds = unstable_cache(() => fetchProjectMemberIds(PROJECT_ACCESS_CACHE_SECONDS), ["jira-project-members-v1"], {
  revalidate: PROJECT_ACCESS_CACHE_SECONDS,
});

/** Does this Atlassian account have access to the Jira project? `fresh` bypasses the cache. */
export async function isProjectMember(accountId: string, options: { fresh?: boolean } = {}): Promise<boolean> {
  const ids = options.fresh ? await fetchProjectMemberIds(false) : await getCachedProjectMemberIds();
  return ids.includes(accountId);
}

const schemeSchema = z.object({ id: z.number() });
const grantsSchema = z.object({
  permissions: z.array(z.object({ permission: z.string(), holder: z.object({ type: z.string(), parameter: z.string().nullish() }) })),
});

export type ProjectAccessSummary = {
  /** Active human accounts with Browse Projects. */
  memberCount: number;
  /**
   * true when Browse Projects is granted to every Jira user on the site (an application-role
   * grant without a specific role, "anyone", or a logged-in-users grant); null if unknown.
   */
  openToSite: boolean | null;
};

/** For readiness: member count and whether the project is open to the whole site. */
export async function getProjectAccessSummary(): Promise<ProjectAccessSummary> {
  const ids = await getCachedProjectMemberIds();
  let openToSite: boolean | null = null;
  try {
    const { projectKey } = getJiraConfig();
    const scheme = await jiraFetch(`/rest/api/3/project/${encodeURIComponent(projectKey)}/permissionscheme`, { schema: schemeSchema, revalidate: 3600 });
    const grants = await jiraFetch(`/rest/api/3/permissionscheme/${scheme.id}/permission`, { schema: grantsSchema, revalidate: 3600 });
    openToSite = grants.permissions.some(
      (g) =>
        g.permission === "BROWSE_PROJECTS" &&
        (g.holder.type === "anyone" || g.holder.type === "applicationRole" || g.holder.type === "loggedInUser"),
    );
  } catch {
    openToSite = null; // permission schemes may need Jira admin rights; report "unknown"
  }
  return { memberCount: ids.length, openToSite };
}
