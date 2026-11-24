// Date-only values follow the publisher's local calendar. Keep them separate from UTC instants.
export const US_ZONES = {
  Eastern: "America/New_York",
  Central: "America/Chicago",
  Mountain: "America/Denver",
  Pacific: "America/Los_Angeles",
  Arizona: "America/Phoenix",
  Alaska: "America/Anchorage",
  Aleutian: "America/Adak",
} as const;

const formatters = new Map<string, Intl.DateTimeFormat>();
export function localClock(now: Date, zone: string): { date: string; minute: number } {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    formatters.set(zone, formatter);
  }
  const [date, clock] = formatter.format(now).split(" ");
  const [hour, minute] = clock.split(":").map(Number);
  return { date, minute: hour * 60 + minute };
}

const MONTHS = "january february march april may june july august september october november december".split(" ");
const monthNumber = (month: string) => MONTHS.findIndex((name) =>
  month === name || month === name.slice(0, 3) || (name === "september" && month === "sept")) + 1;
export function isoDay(year: number, month: number, day: number): string | null {
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

/** US numeric, ISO, or month-name dates. A missing year requires an explicit default. */
export function parseUsDate(raw: string, defaultYear?: number): string | null {
  const value = raw.trim().replace(/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?[\s,]+/i, "");
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return isoDay(+iso[1], +iso[2], +iso[3]);
  const date = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/.exec(value);
  const named = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:[\s,]+(\d{4}))?$/i.exec(value);
  if (!date && !named) return null;
  const rawYear = (date ?? named)?.[3];
  const year = rawYear ? +rawYear + (rawYear.length === 2 ? 2000 : 0) : defaultYear;
  const month = date ? +date[1] : monthNumber(named?.[1].toLowerCase() ?? "");
  const day = (date ?? named)?.[2];
  return year && day ? isoDay(year, month, +day) : null;
}

/** Parse an ISO timestamp with an explicit offset and reject rollover dates. */
export function parseIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:[0-5]\d)$/.test(value) ||
    parseUsDate(value.slice(0, 10)) !== value.slice(0, 10)) return null;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? new Date(instant).toISOString() : null;
}

const WEEKDAYS = "sunday monday tuesday wednesday thursday friday saturday".split(" ");

/** Parse a date heading that must carry a matching weekday, such as a rolling daily forecast. */
export function parseWeekdayDate(raw: string, defaultYear?: number): string | null {
  const weekday = /^([a-z]+)\.?[\s,]+/i.exec(raw.trim())?.[1].toLowerCase();
  if (!weekday) return null;
  const day = parseUsDate(raw, defaultYear);
  if (!day) return null;
  const expected = WEEKDAYS[new Date(day).getUTCDay()];
  return weekday === expected || weekday === expected.slice(0, 3) ? day : null;
}

export function parseEndDate(raw: string, defaultYear?: number) {
  if (/^until\s+(?:further notice|rescinded|lifted)\b/i.test(raw.trim())) return { kind: "open-ended" } as const;
  const date = parseUsDate(raw, defaultYear);
  return date ? { kind: "date", date } as const : { kind: "unknown" } as const;
}

/** Interpret a local timestamp using the applicable DST offset. Ambiguous hours use the earlier instant. */
export function atLocalTime(day: string, minute: number, zone: string): string | null {
  if (!Number.isInteger(minute) || minute < 0 || minute >= 1440 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const midnight = Date.parse(day + "T00:00:00Z");
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return null;
  const utc = midnight + minute * 60_000;
  const candidates: number[] = [];
  for (const probe of [utc - 12 * 3_600_000, utc + 12 * 3_600_000]) {
    const local = localClock(new Date(probe), zone);
    const offset = Date.parse(local.date + "T00:00:00Z") + local.minute * 60_000 - probe;
    const instant = utc - offset;
    const roundTrip = localClock(new Date(instant), zone);
    if (roundTrip.date === day && roundTrip.minute === minute) candidates.push(instant);
  }
  return candidates.length ? new Date(Math.min(...candidates)).toISOString() : null;
}

export function parseLocalDateTime(raw: string, zone: string, defaultYear?: number): string | null {
  const clock = /^(.*?)(?:,|\s+at)?[ T]+(\d{1,2})(?::(\d{2})(?::(\d{2}))?)?\s*([ap]\.?m\.?)?$/i.exec(raw.trim());
  if (!clock || (!clock[3] && !clock[5])) return null;
  const day = parseUsDate(clock[1], defaultYear);
  const hour = +clock[2];
  const minute = +(clock[3] ?? 0);
  const seconds = +(clock[4] ?? 0);
  if (!day || minute > 59 || seconds > 59 || (clock[5] ? hour < 1 || hour > 12 : hour > 23)) return null;
  const hour24 = clock[5] ? hour % 12 + (clock[5].toLowerCase().startsWith("p") ? 12 : 0) : hour;
  const instant = atLocalTime(day, hour24 * 60 + minute, zone);
  return instant ? new Date(Date.parse(instant) + seconds * 1000).toISOString() : null;
}

export function shiftDay(date: string, days: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
}

/** Resolve a named weekday within a publisher's short forecast horizon, in local dates. */
export function weekdayOnOrAfter(date: string, weekday: string, maxDaysAhead: number): string | null {
  const day = WEEKDAYS.indexOf(weekday.trim().toLowerCase());
  if (day < 0 || parseUsDate(date) !== date) return null;
  const ahead = (day - new Date(date).getUTCDay() + 7) % 7;
  return ahead <= maxDaysAhead ? shiftDay(date, ahead) : null;
}

/** UTC instants bounding one publisher-local date, including 23- and 25-hour days. */
export function localDayWindow(date: string, zone: string) {
  const validFrom = atLocalTime(date, 0, zone);
  const validUntil = validFrom && atLocalTime(shiftDay(date, 1), 0, zone);
  if (!validFrom || !validUntil || validFrom >= validUntil) throw new Error(`Invalid local day ${date} in ${zone}`);
  return { validFrom, validUntil };
}

/** Expire a report from its publisher timestamp, independently of when it was fetched. */
export function reportWindow(sourceUpdated: string | null, now: Date, maxAgeMs: number) {
  if (!sourceUpdated) return;
  const updated = Date.parse(sourceUpdated);
  const deadline = new Date(updated + maxAgeMs);
  const checked = now.getTime();
  if (!Number.isFinite(deadline.getTime()) || updated > checked || deadline.getTime() <= checked) return;
  return { sourceUpdated, validUntil: deadline.toISOString() };
}
