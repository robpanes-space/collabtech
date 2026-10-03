/** Report period ("completed this period"): last 7, 14 or 30 days; default 7. */
export const REPORT_PERIODS = [7, 14, 30] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export function parseReportPeriod(raw: unknown): ReportPeriod {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return (REPORT_PERIODS as readonly number[]).includes(value) ? (value as ReportPeriod) : 7;
}

/** Items completed within the last `days` days of `now` (input from HistoryDto.completions). */
export function completedWithin<T extends { completedAt: string }>(items: readonly T[], days: number, now: Date): T[] {
  const since = now.getTime() - days * 86_400_000;
  return items.filter((item) => Date.parse(item.completedAt) >= since && Date.parse(item.completedAt) <= now.getTime());
}
