/**
 * Calendar-day arithmetic in DASHBOARD_TIME_ZONE (computation, not display — labels come from
 * src/lib/format.ts). Days are "YYYY-MM-DD" keys; boundaries are local midnights resolved with
 * Intl, so DST and non-UTC zones are exact.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function parts(instant: Date, timeZone: string) {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, f);
  }
  const map: Record<string, string> = {};
  for (const part of f.formatToParts(instant)) map[part.type] = part.value;
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    h: Number(map.hour),
    min: Number(map.minute),
    s: Number(map.second),
  };
}

/** Local calendar day of an instant in `timeZone`. */
export function zonedDateKey(instant: Date, timeZone: string): string {
  const p = parts(instant, timeZone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** UTC offset (ms) of `timeZone` at `instant`. */
function offsetAt(instant: Date, timeZone: string): number {
  const p = parts(instant, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant local midnight starts on `dateKey` in `timeZone`. */
export function dayStartInstant(dateKey: string, timeZone: string): Date {
  const match = DATE_ONLY.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);
  const guess = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  let instant = guess - offsetAt(new Date(guess), timeZone);
  instant = guess - offsetAt(new Date(instant), timeZone); // DST correction
  return new Date(instant);
}

/** Last millisecond of `dateKey` in `timeZone`. */
export function dayEndInstant(dateKey: string, timeZone: string): Date {
  return new Date(dayStartInstant(addDays(dateKey, 1), timeZone).getTime() - 1);
}

export function addDays(dateKey: string, days: number): string {
  const match = DATE_ONLY.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

/** Inclusive list of day keys. Empty when end < start. */
export function dayKeysBetween(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  for (let key = startKey; key <= endKey; key = addDays(key, 1)) keys.push(key);
  return keys;
}

/** Monday of the ISO week containing `dateKey`. */
export function weekStartKey(dateKey: string): string {
  const match = DATE_ONLY.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);
  const weekday = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  return addDays(dateKey, -((weekday + 6) % 7));
}

/**
 * Calendar day for a sprint/date value: a Jira date-only "YYYY-MM-DD" is already a calendar
 * day (never shifted); a timestamp is converted to the local day in `timeZone`.
 */
export function calendarDayOf(value: string, timeZone: string): string | null {
  if (DATE_ONLY.test(value)) return value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : zonedDateKey(new Date(ms), timeZone);
}

/** Instant for a sprint boundary value: date-only → local midnight in `timeZone`. */
export function boundaryInstant(value: string, timeZone: string): Date | null {
  if (DATE_ONLY.test(value)) return dayStartInstant(value, timeZone);
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}
