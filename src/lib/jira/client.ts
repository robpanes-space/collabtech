import "server-only";
import type { z } from "zod";
import { getJiraConfig, type JiraConfig } from "./config";
import { log } from "@/lib/log";
import { codeForStatus, JiraApiError } from "./errors";

export const JIRA_REVALIDATE_SECONDS = 60;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 10_000;

type QueryValue = string | number | boolean | undefined | null;

export type JiraFetchOptions<T> = {
  /** Zod schema used to validate the response. Strongly recommended. */
  schema?: z.ZodType<T>;
  query?: Record<string, QueryValue>;
  timeoutMs?: number;
  /** Retries for 429 / 5xx only. */
  maxRetries?: number;
  /** Next.js data-cache revalidation. `false` disables caching (e.g. health checks). */
  revalidate?: number | false;
  config?: JiraConfig;
  /** POST is only for read-style endpoints that take a JSON body (e.g. changelog bulk fetch). */
  method?: "GET" | "POST";
  /** JSON request body (POST only). Never logged. */
  body?: unknown;
};

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, baseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function authHeader(config: JiraConfig): string {
  return `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Server-only typed request to Jira Cloud.
 * Never logs or returns credentials; errors are normalized to JiraApiError.
 */
export async function jiraFetch<T>(path: string, options: JiraFetchOptions<T> = {}): Promise<T> {
  const config = options.config ?? getJiraConfig();
  const url = buildUrl(config.baseUrl, path, options.query);
  const safePath = path.split("?")[0] ?? path;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const revalidate = options.revalidate ?? JIRA_REVALIDATE_SECONDS;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      const isPost = options.method === "POST";
      response = await fetch(url, {
        method: isPost ? "POST" : "GET",
        headers: {
          Accept: "application/json",
          Authorization: authHeader(config),
          ...(isPost ? { "Content-Type": "application/json" } : {}),
        },
        ...(isPost ? { body: JSON.stringify(options.body ?? {}) } : {}),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        // POST responses are never data-cached; callers cache their own derived results.
        ...(isPost || revalidate === false ? { cache: "no-store" as const } : { next: { revalidate } }),
      });
    } catch (error) {
      const isTimeout =
        error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new JiraApiError(isTimeout ? "TIMEOUT" : "NETWORK_ERROR", { path: safePath, cause: error });
    }

    if (!response.ok) {
      const code = codeForStatus(response.status);
      const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
      const retryable = code === "RATE_LIMITED" || code === "JIRA_UNAVAILABLE";

      if (code === "RATE_LIMITED") {
        log("warn", "jira.rate_limited", { path: safePath, retryAfterSeconds, attempt });
      }
      if (retryable && attempt < maxRetries) {
        const waitMs = Math.min(
          retryAfterSeconds !== null ? retryAfterSeconds * 1000 : 500 * 2 ** attempt,
          MAX_RETRY_WAIT_MS,
        );
        await sleep(waitMs);
        continue;
      }
      // Body intentionally not included: it can echo request details.
      throw new JiraApiError(code, { status: response.status, path: safePath, retryAfterSeconds });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new JiraApiError("INVALID_RESPONSE", { status: response.status, path: safePath, cause: error });
    }

    if (!options.schema) return body as T;
    const parsed = options.schema.safeParse(body);
    if (!parsed.success) {
      throw new JiraApiError("INVALID_RESPONSE", {
        status: response.status,
        path: safePath,
        cause: parsed.error,
      });
    }
    return parsed.data;
  }
}

/** Page shape shared by Agile `startAt`/`maxResults` endpoints. */
export type OffsetPage<TItem> = {
  startAt?: number;
  maxResults?: number;
  total?: number;
  isLast?: boolean;
  items: TItem[];
};

export type PaginateOptions<TPage> = Omit<JiraFetchOptions<TPage>, "query"> & {
  query?: Record<string, QueryValue>;
  pageSize?: number;
  maxPages?: number;
};

/**
 * Collects all items from a `startAt`/`maxResults` paginated Agile endpoint.
 * `toPage` adapts the endpoint's response (`values` or `issues`) to OffsetPage.
 */
export async function jiraPaginate<TPage, TItem>(
  path: string,
  toPage: (page: TPage) => OffsetPage<TItem>,
  options: PaginateOptions<TPage> = {},
): Promise<TItem[]> {
  const pageSize = options.pageSize ?? 50;
  const maxPages = options.maxPages ?? 100;
  const items: TItem[] = [];
  let startAt = 0;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const raw = await jiraFetch<TPage>(path, {
      ...options,
      query: { ...options.query, startAt, maxResults: pageSize },
    });
    const page = toPage(raw);
    items.push(...page.items);

    const fetched = page.items.length;
    const reachedTotal = page.total !== undefined && startAt + fetched >= page.total;
    if (page.isLast === true || fetched === 0 || reachedTotal) return items;
    startAt += fetched;
  }

  throw new JiraApiError("INVALID_RESPONSE", {
    path,
    detail: `Pagination exceeded ${maxPages} pages`,
  });
}

/** Collects all items from a `nextPageToken` paginated endpoint (e.g. /rest/api/3/search/jql). */
export async function jiraPaginateToken<TPage extends { nextPageToken?: string | null }, TItem>(
  path: string,
  getItems: (page: TPage) => TItem[],
  options: PaginateOptions<TPage> = {},
): Promise<TItem[]> {
  const maxPages = options.maxPages ?? 100;
  const items: TItem[] = [];
  let nextPageToken: string | undefined;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const page = await jiraFetch<TPage>(path, {
      ...options,
      query: { ...options.query, maxResults: options.pageSize ?? 100, nextPageToken },
    });
    items.push(...getItems(page));
    if (!page.nextPageToken) return items;
    nextPageToken = page.nextPageToken;
  }

  throw new JiraApiError("INVALID_RESPONSE", {
    path,
    detail: `Pagination exceeded ${maxPages} pages`,
  });
}
