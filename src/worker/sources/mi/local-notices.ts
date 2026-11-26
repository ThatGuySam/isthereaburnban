import type { CountyStatus } from "../../../shared/types";
import { localClock, localDayWindow, parseUsDate, parseWeekdayDate, reportWindow, shiftDay, US_ZONES } from "../lib/dates";
import { getText } from "../lib/http";
import { latestWpNotice, wpRestUrl } from "../lib/wordpress";
import type { ActiveSource } from "../types";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const ZONE = US_ZONES.Eastern;
const LIMIT = 50;
const QUERY = { search: "burn", per_page: String(LIMIT), _fields: "id,date_gmt,title,link,content" };
const CADENCE = { kind: "daily", zone: ZONE, hours: [2, 8, 14, 20] } as const;
const SOLON_SITE = "https://solonfire.org/";
const LAKETOWN_SITE = "https://laketowntwp.org/";
const SOLON = {
  id: "mi-solon-fire-notices", state: "MI", scope: "part", stack: "WordPress / REST notices",
  sourceName: "Solon Township Fire Department", officialUrl: SOLON_SITE, sourceUrl: wpRestUrl(SOLON_SITE, "posts", QUERY),
} as const;
const LAKETOWN = {
  id: "mi-laketown-fire-notices", state: "MI", scope: "part", stack: "WordPress / REST notices",
  sourceName: "Laketown Township", officialUrl: new URL("?s=burn", LAKETOWN_SITE).href,
  sourceUrl: wpRestUrl(LAKETOWN_SITE, "posts", QUERY),
} as const;

const SOLON_LIFT = /^(?:\d{1,2}\/\d{1,2} )?(?:burn ban (?:lifted!?|off)|burning allowed)$/i;
const SOLON_ISSUE = /^(?:(?:red flag |\d{1,2}\/\d{1,2} )?burn ban(?: in effect| continues| on -\d{1,2}\/\d{1,2}\/\d{2,4})?|red flag day)$/i;
const LAKETOWN_LIFT = /^(?:update: )?burn ban (?:lifted|rescinded)[.!]?$/i;
const LAKETOWN_ISSUE = /^(?:no burn permits until rain arrives|(?:update: )?burn ban (?:continues through weekend|remains in effect, few chances of rain))$/i;

export function parseSolonNotices(data: unknown, now: Date): CountyStatus[] {
  const notice = latestWpNotice(data, {
    site: SOLON_SITE, now, limit: LIMIT, matches: (title) => SOLON_LIFT.test(title) || SOLON_ISSUE.test(title),
  });
  const window = notice && reportWindow(notice.published, now, 7 * DAY_MS);
  if (!notice || !window || SOLON_LIFT.test(notice.title)) return [];
  const { body } = notice;
  const prohibitsBurning = /\b(?:no (?:outdoor )?burning (?:is )?allowed\b|burning is not allowed today\b|no outdoor burning[.!]|no outdoor burning during this time\b)/i.test(body);
  const closure = /\b(?:burn ban (?:(?:is )?in effect|will last at least through)|no burn permits are being issued|burn permits (?:are not being issued|have also been turned off))\b/i.test(body);
  if (!prohibitsBurning && !closure) throw new Error("Solon: unrecognized fire department notice");
  const day = localClock(new Date(notice.published), ZONE).date;
  const daily = /\b(?:no (?:outdoor )?burning(?: (?:is )?allowed)?|burning is not allowed) today\b/i.test(body);
  const validUntil = daily ? localDayWindow(day, ZONE).validUntil : window.validUntil;
  if (validUntil <= now.toISOString()) return [];
  return [{
    ...SOLON, sourceId: SOLON.id, fips: "26081", county: "Kent County", officialUrl: notice.url,
    status: prohibitsBurning ? "ban" : "restricted",
    label: prohibitsBurning ? "Solon Township burn ban" : "Solon Township burn permit restriction",
    scopeNote: "Solon Township",
    note: "The township fire department posted a burning restriction. Check the department’s notice and permit page for the order’s activities, dates and exceptions.",
    checked: now.toISOString(), since: null, expires: daily ? day : null,
    sourceUpdated: notice.published, validUntil,
  }];
}

export function parseLaketownNotices(data: unknown, now: Date): CountyStatus[] {
  const notice = latestWpNotice(data, {
    site: LAKETOWN_SITE, now, limit: LIMIT, matches: (title) => LAKETOWN_LIFT.test(title) || LAKETOWN_ISSUE.test(title),
  });
  const window = notice && reportWindow(notice.published, now, 7 * DAY_MS);
  if (!notice || !window || LAKETOWN_LIFT.test(notice.title)) return [];
  const { body, title, published } = notice;
  const day = localClock(new Date(published), ZONE).date;
  let lastDay: string | undefined;
  let scopeNote = "Laketown Township";
  if (/^no burn permits until rain arrives$/i.test(title)) {
    const limit = /^No burn permits will be issued today, ([^,]+, [^,]+, \d{4}), or ([^,]+, [^,]+), in Laketown Township until the township receives rain\./i.exec(body);
    const startDay = limit && parseWeekdayDate(limit[1]);
    const endDay = limit && parseWeekdayDate(limit[2], Number(day.slice(0, 4)));
    if (startDay !== day || !endDay || endDay !== shiftDay(day, 1)) throw new Error("Laketown: unrecognized permit hold dates");
    lastDay = endDay;
  } else {
    const bothAreas = /\bA burn ban remains in effect for Laketown Township and the area of Fillmore Township covered by the Graafschap Fire Department\b/i.test(body) ||
      /^The burn ban in Laketown Township remains in effect\b.+?\bThe ban also includes the area of Fillmore Township covered by the Graafschap Fire Department\./i.test(body);
    if (!bothAreas) throw new Error("Laketown: unrecognized fire department scope");
    scopeNote = "Laketown Township and the part of Fillmore Township served by Graafschap Fire Department";
    const weekend = /\bthrough the weekend \(([A-Za-z]+) (\d{1,2})-(\d{1,2})\)/i.exec(body);
    if (weekend) {
      // Use the announced weekend to bound the observation. A continuation may follow.
      const start = parseUsDate(`${weekend[1]} ${weekend[2]}`, Number(day.slice(0, 4)));
      const end = parseUsDate(`${weekend[1]} ${weekend[3]}`, Number(day.slice(0, 4)));
      if (!start || !end || start < day || end !== shiftDay(start, 1) || end > shiftDay(day, 3)) {
        throw new Error("Laketown: unrecognized weekend dates");
      }
      lastDay = end;
    }
  }
  const validUntil = lastDay ? localDayWindow(lastDay, ZONE).validUntil : window.validUntil;
  if (validUntil <= now.toISOString()) return [];
  return [{
    ...LAKETOWN, sourceId: LAKETOWN.id, fips: "26005", county: "Allegan County", officialUrl: notice.url,
    status: "restricted", label: "Local open-burning permits suspended", scopeNote,
    note: "Laketown Township reports an open-burning permit suspension for the listed area. Check the township or Graafschap Fire Department for the latest conditions and exceptions.",
    checked: now.toISOString(), since: title === "No burn permits until rain arrives" ? day : null,
    expires: null, sourceUpdated: published, validUntil,
  }];
}

export const miLocalNotices: readonly ActiveSource[] = [
  { publisher: SOLON, fips: "26081", parse: parseSolonNotices },
  { publisher: LAKETOWN, fips: "26005", parse: parseLaketownNotices },
].map(({ publisher, fips, parse }) => ({
  ...publisher, mode: "positive-only", coverage: "restrictions", cadence: CADENCE, reportingFips: [fips],
  keepRowLinks: true, staleMs: 9 * HOUR_MS,
  async fetch({ now }) {
    const json = await getText(publisher.sourceUrl, {
      headers: { accept: "application/json" }, maxBytes: 400_000, maxResponseAgeMs: 2 * HOUR_MS,
    });
    return { rows: parse(JSON.parse(json), now) };
  },
}));
