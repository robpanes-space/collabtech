import "server-only";

/**
 * The single place dashboard dates are formatted (server-side only).
 *
 * - Real timestamps (ISO with time) → shown in DASHBOARD_TIME_ZONE (default UTC) via
 *   Intl.DateTimeFormat. No manual offsets.
 * - Jira date-only values ("YYYY-MM-DD") → calendar dates, formatted in UTC from their
 *   components so they never shift a day because of time-zone conversion.
 */

export const DEFAULT_TIME_ZONE = "UTC";
export const SCHEDULE_NOT_SET = "Schedule not set";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Configured zone, or UTC when unset/invalid (env validation reports invalid values). */
export function dashboardTimeZone(raw: string | undefined = process.env.DASHBOARD_TIME_ZONE): string {
  const value = raw?.trim();
  return value && isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(kind: "date" | "short" | "dateTime", timeZone: string): Intl.DateTimeFormat {
  const key = `${kind}|${timeZone}`;
  let f = formatters.get(key);
  if (!f) {
    const options: Intl.DateTimeFormatOptions =
      kind === "date"
        ? { year: "numeric", month: "short", day: "numeric" }
        : kind === "short"
          ? { month: "short", day: "numeric" }
          : { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" };
    f = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    formatters.set(key, f);
  }
  return f;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a timestamp; date-only strings are NOT timestamps and return null here. */
function parseTimestamp(iso: string | null | undefined): Date | null {
  if (!iso || DATE_ONLY.test(iso)) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Oct 5, 2026" in the dashboard time zone; null for missing/invalid (never "Invalid Date"). */
export function formatDashboardDate(iso: string | null | undefined, timeZone = dashboardTimeZone()): string | null {
  const date = parseTimestamp(iso);
  return date ? formatter("date", timeZone).format(date) : null;
}

/** "Oct 3, 2026, 5:31 PM GMT+8" — includes the zone so readers know which clock it is. */
export function formatDashboardDateTime(iso: string | null | undefined, timeZone = dashboardTimeZone()): string | null {
  const date = parseTimestamp(iso);
  return date ? formatter("dateTime", timeZone).format(date) : null;
}

/** Jira calendar date ("2026-10-10") → "Oct 10, 2026" with no day shift in any zone. */
export function formatCalendarDate(value: string | null | undefined): string | null {
  const match = value ? DATE_ONLY.exec(value) : null;
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return formatter("date", "UTC").format(date);
}

/** "Oct 5 – Oct 19, 2026"; a single known end; or "Schedule not set". */
export function formatDashboardDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  timeZone = dashboardTimeZone(),
): string {
  const startDate = parseTimestamp(start);
  const endDate = parseTimestamp(end);
  if (startDate && endDate) return `${formatter("short", timeZone).format(startDate)} – ${formatter("date", timeZone).format(endDate)}`;
  if (startDate) return `Starts ${formatter("date", timeZone).format(startDate)}`;
  if (endDate) return `Ends ${formatter("date", timeZone).format(endDate)}`;
  return SCHEDULE_NOT_SET;
}

/** "just now", "2 minutes ago", "3 hours ago", else an absolute date in the dashboard zone. */
export function formatRelativeTime(iso: string | null | undefined, now: Date, timeZone = dashboardTimeZone()): string | null {
  const date = parseTimestamp(iso);
  if (!date) return null;
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return formatter("date", timeZone).format(date);
}

/** Jira/history calendar day ("2026-10-05") → "Oct 5" (no zone conversion, never shifts). */
export function formatShortCalendarDate(value: string | null | undefined): string | null {
  const match = value ? DATE_ONLY.exec(value) : null;
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  return formatter("short", "UTC").format(new Date(Date.UTC(y, m - 1, d)));
}
