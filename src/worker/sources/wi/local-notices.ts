import type { CountyStatus } from "../../../shared/types";
import { civicPlusNewsFlashArticle } from "../lib/civicplus";
import { localClock, parseIsoTimestamp, parseUsDate, reportWindow, shiftDay, US_ZONES } from "../lib/dates";
import { parseFeed } from "../lib/feeds";
import { getText, pacedTextReader } from "../lib/http";
import { parseWpItems, wpRestUrl } from "../lib/wordpress";
import type { ActiveSource } from "../types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ZONE = US_ZONES.Central;
const CADENCE = { kind: "daily", zone: ZONE, hours: [3, 9, 15, 21] } as const;
const CLINTON = "https://tn.clinton.wi.gov/";
const VERNON = {
  id: "wi-vernon-county-orders", state: "WI", scope: "county", stack: "WordPress / REST",
  sourceName: "Vernon County Emergency Management via the Town of Clinton",
  sourceUrl: wpRestUrl(CLINTON, "posts", {
    search: "burn ban", per_page: "100", _fields: "id,date_gmt,title,link,content",
  }),
  officialUrl: new URL("?s=burn+ban", CLINTON).href,
} as const;
const FALLS = "https://www.menomoneefalls.gov/";
const MENOMONEE = {
  id: "wi-menomonee-falls-orders", state: "WI", scope: "part", stack: "CivicPlus / RSS and News Flash",
  sourceName: "Village of Menomonee Falls Fire Department",
  sourceUrl: new URL("RSSFeed.aspx?ModID=1&CID=Safety-Strategies-16", FALLS).href,
  officialUrl: new URL("CivicAlerts.aspx", FALLS).href,
} as const;
const VERNON_ISSUE = /^Current Notice (\d{1,2}\.\d{1,2}\.\d{4}): Town of Clinton Immediate Burn Ban$/i;
const VERNON_LIFT = /^Current Notice (\d{1,2}\.\d{1,2}\.\d{4}): Town of Clinton Burning Ban Current Notice (\d{1,2}\.\d{1,2}\.\d{4}) CANCELLED$/i;
const BURN_BAN = /\bburn(?:ing)? ban\b/i;

const dottedDate = (value: string) => parseUsDate(value.replaceAll(".", "/"));
const sameSite = (url: string, origin: string) => new URL(url).origin === new URL(origin).origin;

export function parseVernonNotices(input: string, now: Date): CountyStatus[] {
  const items = parseWpItems(JSON.parse(input));
  const recent = items.flatMap((item) => {
    if (!BURN_BAN.test(item.title)) return [];
    const published = parseIsoTimestamp(item.published);
    if (!published || published > now.toISOString() || !sameSite(item.url, CLINTON)) {
      throw new Error("Vernon: invalid burn-ban notice date or link");
    }
    const window = reportWindow(published, now, 30 * DAY);
    return window ? [{ ...item, published, window }] : [];
  });
  if (recent.length >= 100) throw new Error("Vernon: burn-ban notice results may be incomplete");

  const issueDays = new Set<string>();
  const lifted = new Set<string>();
  const issues = [];
  for (const entry of recent) {
    const { title, body, published } = entry;
    const issue = VERNON_ISSUE.exec(title);
    const lift = VERNON_LIFT.exec(title);
    const posted = localClock(new Date(published), ZONE).date;
    const date = dottedDate((issue ?? lift)?.[1] ?? "");
    if (!date || date > posted || date < shiftDay(posted, -1)) {
      throw new Error("Vernon: unrecognized notice or invalid effective date");
    }
    if (lift) {
      const liftedDay = dottedDate(lift[2]);
      if (!liftedDay || liftedDay > date || !/^Click here for the full CANCELLATION \(pdf\)$/i.test(body)) {
        throw new Error("Vernon: changed cancellation notice");
      }
      lifted.add(liftedDay);
    } else {
      if (!/\bPress Release Information From Vernon County County Wide Burn Ban for Vernon County, effective immediately\b/i.test(body) ||
          !/\bDirector Vernon County Emergency Management\b/i.test(body) || issueDays.has(date)) {
        throw new Error("Vernon: missing or ambiguous countywide issuing authority");
      }
      issueDays.add(date);
      issues.push({ ...entry, date });
    }
  }
  const latest = issues.sort((left, right) => right.date.localeCompare(left.date))[0];
  if (!latest || lifted.has(latest.date)) return [];
  return [{
    ...latest.window, sourceId: VERNON.id, state: VERNON.state, scope: VERNON.scope, fips: "55123", county: "Vernon County",
    status: "ban", label: "Vernon County outdoor burning ban",
    note: "Vernon County Emergency Management issued a countywide burn ban. See the county notice for the order and its terms.",
    checked: now.toISOString(), since: latest.date, expires: null, officialUrl: latest.url,
    sourceName: VERNON.sourceName, sourceUrl: VERNON.sourceUrl,
  }];
}

export const wiVernonNotices: ActiveSource = {
  ...VERNON, mode: "positive-only", coverage: "restrictions", reportingFips: ["55123"],
  keepRowLinks: true, cadence: CADENCE, staleMs: 9 * HOUR,
  async fetch({ now }) {
    const json = await getText(VERNON.sourceUrl, { headers: { accept: "application/json" }, maxBytes: 500_000 });
    return { rows: parseVernonNotices(json, now) };
  },
};

const FALLS_CATEGORY = "Safety Strategies";
const FALLS_CHANNEL = "<title>Village of Menomonee Falls - News Flash - Safety Strategies</title>";

export async function parseMenomoneeNotices(
  xml: string, now: Date, readArticle: (url: string) => Promise<Response | string>,
): Promise<CountyStatus[]> {
  const channel = /<channel>\s*(<title>[^<]+<\/title>)/.exec(xml)?.[1];
  if (channel !== FALLS_CHANNEL || !/<\/channel>\s*<\/rss>\s*$/.test(xml)) {
    throw new Error("Menomonee Falls: missing or changed Safety Strategies feed");
  }
  const entries = parseFeed(xml, { includeText: () => false });
  const itemCount = [...xml.matchAll(/<item\b/g)].length;
  if (entries.length !== itemCount) throw new Error("Menomonee Falls: incomplete RSS item list");

  const notices = entries.filter(({ title }) => BURN_BAN.test(title)).map((entry) => {
    const url = new URL(entry.url);
    if (!entry.published || entry.published > now.toISOString() || !sameSite(entry.url, FALLS) ||
        !/^\/CivicAlerts\.aspx$/i.test(url.pathname) || !/^\d+$/.test(url.searchParams.get("aid") ?? "")) {
      throw new Error("Menomonee Falls: invalid burn-ban notice date or link");
    }
    return { ...entry, published: entry.published };
  }).sort((a, b) => b.published.localeCompare(a.published));
  const [latest, other] = notices;
  if (!latest) return [];
  if (other?.published === latest.published) throw new Error("Menomonee Falls: ambiguous latest burn-ban notice");
  const window = reportWindow(latest.published, now, 14 * DAY);
  if (!window) return [];

  const article = await civicPlusNewsFlashArticle(await readArticle(latest.url));
  const posted = localClock(new Date(latest.published), ZONE).date;
  if (article.title !== latest.title || article.category !== FALLS_CATEGORY || article.posted !== posted) {
    throw new Error("Menomonee Falls: article does not match the active RSS item");
  }
  if (/^Burn Ban (?:Lifted|Rescinded)$/i.test(article.title) &&
      /\bburn ban (?:for the Village of Menomonee Falls )?has been (?:lifted|rescinded)\b/i.test(article.body)) return [];
  if (!/^Burn Ban(?: in Effect)?$/i.test(article.title) ||
      !/\bA burn ban is in place for the Village of Menomonee Falls\b/i.test(article.body) ||
      !/\bFire Chief has instituted a burn ban for the Village (?:of )?Menomonee Falls\b/i.test(article.body) ||
      !/\buntil further notice\b/i.test(article.body)) {
    throw new Error("Menomonee Falls: unrecognized village burn-ban notice");
  }
  return [{
    ...window, sourceId: MENOMONEE.id, state: MENOMONEE.state, scope: MENOMONEE.scope, fips: "55133", county: "Waukesha County",
    status: "ban", label: "Village burn ban in effect", scopeNote: "Village of Menomonee Falls",
    note: "The village Fire Chief has issued a burn ban. Check the village notice for its terms.",
    checked: now.toISOString(), since: posted, expires: null, officialUrl: latest.url,
    sourceName: MENOMONEE.sourceName, sourceUrl: MENOMONEE.sourceUrl,
  }];
}

export const wiMenomoneeNotices: ActiveSource = {
  ...MENOMONEE, mode: "positive-only", coverage: "restrictions", reportingFips: ["55133"],
  keepRowLinks: true, cadence: CADENCE, staleMs: 9 * HOUR,
  async fetch({ now }) {
    const read = pacedTextReader({ maxBytes: 550_000, maxResponseAgeMs: 2 * HOUR });
    const xml = await read(MENOMONEE.sourceUrl);
    return { rows: await parseMenomoneeNotices(xml, now, read) };
  },
};
