import type { CountyStatus } from "../../../shared/types";
import { localClock, parseIsoTimestamp, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import { parseWpItems, wpRestUrl } from "../lib/wordpress";
import type { ActiveSource } from "../types";

const STATION = "https://www.wtyefm.com";
const SHERIFF = "https://crawfordcounty.illinois.gov/department/sheriff/";
const ZONE = US_ZONES.Central;
const CONFIRMATION_MS = 7 * 24 * 3_600_000;
const PER_PAGE = 100;
const SEARCH = {
  categories: "25", search: "burn ban", per_page: String(PER_PAGE),
  _fields: "id,date_gmt,modified_gmt,link,title,content",
};
const META = {
  id: "il-crawford-county-orders", state: "IL", scope: "county",
  sourceName: "Crawford County Sheriff and local fire officials via WTYE",
  sourceUrl: wpRestUrl(STATION, "posts", SEARCH), officialUrl: SHERIFF,
  stack: "WordPress / REST notices", keepRowLinks: true,
} as const;

const BAN_TITLE = /\b(?:burn ban|fire ban|(?:outdoor|open) burning ban)\b/i;
const COUNTY = /\bCrawford County\b/i;
const AUTHORITY = /\bCrawford County Sheriff(?:['’]s (?:Office|Department)|,?\s+(?:Bill|William) Rutan)\b/i;
const LIFT_TITLE = /^(?:Authorities Lift Countywide Burn Ban|Countywide Burn Ban (?:Has Been )?Lifted)$/i;
const LIFT_BODY = /\bCrawford County authorities have lifted the (?:recent |county[- ]?wide )?burn ban\b/i;
const ISSUE_TITLE = /^(?:Countywide Burn Ban Now in Effect(?: Until Further Notice)?|Burn Ban Now in Effect Countywide|Crawford County (?:Once Again )?Under a Burn Ban)$/i;
const ISSUE_BODY = /\b(?:have issued a countywide burn ban|(?:officially institut(?:ed|ing)|decided to reinstate) (?:a|the) county[- ]?wide burn ban)\b/i;
const CONTINUED_TITLE = /^Burn Ban (?:Continues Countywide|Continues Despite Rain Forecast|Remains in Effect for the County)$/i;
const CONTINUED_BODY = /\bcounty[- ]?wide burn ban (?:continues|remains) (?:in effect|until further notice)\b/i;
const COUNTY_CONFIRMATION = /\bCrawford County authorities remind the public that a countywide burn ban continues until further notice\b/i;
const COOKING_EXCEPTION = /\b(?:ban does not include enclosed fires for (?:the )?cooking such as grills|(?:with the exception of|except) (?:small )?contained fires for cooking purposes)\b/i;

export function parseCrawfordCountyOrders(input: unknown, now: Date): CountyStatus[] {
  const items = parseWpItems(input);
  if (items.length >= PER_PAGE || new Set(items.map(({ id }) => id)).size !== items.length) {
    throw new Error("WTYE: incomplete or duplicate Crawford County search results");
  }
  const recent = items.flatMap(({ title, body, published, url }) => {
    if (!BAN_TITLE.test(title)) return [];
    if (!body) throw new Error("WTYE: missing burn-ban notice body");
    if (!COUNTY.test(`${title} ${body}`)) return [];
    const date = parseIsoTimestamp(published);
    if (!date || Date.parse(date) > now.getTime()) throw new Error("WTYE: invalid Crawford County publication date");
    if (now.getTime() - Date.parse(date) >= CONFIRMATION_MS) return [];
    const link = new URL(url);
    const localDay = localClock(new Date(date), ZONE).date;
    if (link.origin !== STATION || !link.pathname.startsWith(`/${localDay.replaceAll("-", "/")}/`)) {
      throw new Error("WTYE: Crawford County publication link does not match the station and date");
    }
    return [{ title, body, date, url }];
  }).sort((a, b) => b.date.localeCompare(a.date));
  const [current, previous] = recent;
  if (!current) return [];
  if (current.date === previous?.date) throw new Error("WTYE: conflicting Crawford County notice timestamps");
  const { title, body, date, url } = current;
  const attributed = AUTHORITY.test(body);
  const lifted = LIFT_BODY.test(body);
  if (attributed && LIFT_TITLE.test(title) && lifted) return [];
  const issued = attributed && ISSUE_TITLE.test(title) && ISSUE_BODY.test(body);
  const continued = (attributed || COUNTY_CONFIRMATION.test(body)) && CONTINUED_TITLE.test(title) && CONTINUED_BODY.test(body);
  if ((!issued && !continued) || lifted || !COOKING_EXCEPTION.test(body)) {
    throw new Error("WTYE: unrecognized Crawford County burn-ban notice");
  }

  return [{
    fips: "17033", county: "Crawford", state: META.state, sourceId: META.id, status: "ban", scope: META.scope,
    label: "Crawford County burn ban",
    scopeNote: "Outdoor burning covered by the countywide order",
    note: "The sheriff and local fire officials announced a countywide ban. Enclosed cooking fires such as grills are exempt. Check the sheriff's latest update before burning.",
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: url,
    checked: now.toISOString(), sourceUpdated: date, since: null, expires: null,
    validUntil: new Date(Date.parse(date) + CONFIRMATION_MS).toISOString(),
  }];
}

export const ilCrawfordCountyOrders: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: ZONE, hours: [0, 4, 8, 12, 16, 20] },
  staleMs: 6 * 3_600_000,
  async fetch({ now }) {
    const { date } = localClock(new Date(now.getTime() - CONFIRMATION_MS), ZONE);
    const after = date + "T00:00:00";
    const url = wpRestUrl(STATION, "posts", { ...SEARCH, after });
    const reply = await fetchSource(url, {
      headers: { accept: "application/json" }, maxBytes: 200_000, maxResponseAgeMs: 2 * 3_600_000,
    });
    if (reply.notModified) throw new Error("WTYE: unexpected 304");
    return { rows: parseCrawfordCountyOrders(await reply.response.json<unknown>(), now) };
  },
};
