/**
 * Client-safe Jira deep links: "https://<site>/browse/<KEY>". Built only from the configured
 * site origin (never REST paths, credentials or query strings) and validated issue keys.
 */

const ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,19}-[1-9]\d{0,8}$/;

export function isValidIssueKey(key: string): boolean {
  return ISSUE_KEY.test(key);
}

/** "https://site.atlassian.net/browse/" from JIRA_BASE_URL, or null if it is not a safe https origin. */
export function jiraBrowseBase(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return `${url.origin}/browse/`;
  } catch {
    return null;
  }
}

export function jiraIssueUrl(browseBase: string | null, key: string): string | null {
  if (!browseBase || !isValidIssueKey(key)) return null;
  return `${browseBase}${encodeURIComponent(key)}`;
}
