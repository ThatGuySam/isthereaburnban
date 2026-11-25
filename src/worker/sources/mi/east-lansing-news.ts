import type { CountyStatus } from "../../../shared/types";
import { civicPlusNewsFlashArticle } from "../lib/civicplus";
import { localClock, US_ZONES } from "../lib/dates";
import { parseFeed } from "../lib/feeds";
import { pacedSourceReader } from "../lib/http";
import type { ActiveSource } from "../types";

const ORIGIN = "https://www.cityofeastlansing.com";
const ZONE = US_ZONES.Eastern;
const CATEGORY = "News Releases";
const STALE_MS = 8 * 3_600_000;
const META = {
  id: "mi-east-lansing-fire-notices", state: "MI", scope: "part", stack: "CivicPlus / News Flash RSS",
  sourceName: "East Lansing Fire Department",
  officialUrl: `${ORIGIN}/m/newsflash`,
  sourceUrl: `${ORIGIN}/RSSFeed.aspx?ModID=1&CID=News-Releases-7`,
} as const;
const AREAS = [
  { fips: "26037", county: "Clinton County" },
  { fips: "26065", county: "Ingham County" },
];
const ISSUE = /^(?:(?:ELFD|East Lansing Fire Department) Issues? (?:an? )?(?:Open )?Burn(?:ing)? Ban\b|Permits for Open Burning, Recreational Fires Suspended$)/i;
const LIFT = /^(?:(?:ELFD|East Lansing Fire Department) Lifts? (?:the )?(?:Open )?Burn(?:ing)? Ban\b|(?:Open )?Burn(?:ing)? Ban Lifted in East Lansing\b)/i;

export async function parseEastLansingFireNotices(xml: string, now: Date, readArticle: (url: string) => Promise<Response | string>): Promise<CountyStatus[]> {
  const channel = /<channel>\s*<title>([^<]+)<\/title>/.exec(xml)?.[1];
  if (channel !== "East Lansing, MI - News Flash -  News Releases" || !/<\/channel>\s*<\/rss>\s*$/.test(xml)) {
    throw new Error("East Lansing: expected the current News Releases RSS channel");
  }
  const items = parseFeed(xml, { includeText: () => false });
  if (items.length !== [...xml.matchAll(/<item\b/g)].length) throw new Error("East Lansing: incomplete News Flash feed");
  const notices = items.filter(({ title }) => ISSUE.test(title) || LIFT.test(title)).map((item) => {
    const link = new URL(item.url);
    const id = link.searchParams.get("aid");
    if (!item.published || Date.parse(item.published) > +now || link.origin !== ORIGIN ||
        link.pathname !== "/CivicAlerts.aspx" || !id || !/^\d+$/.test(id)) {
      throw new Error("East Lansing: unexpected feed date or article link");
    }
    return { title: item.title, published: item.published, url: `${ORIGIN}/m/newsflash/Home/Detail/${id}` };
  }).sort((a, b) => b.published.localeCompare(a.published));
  const [latest, next] = notices;
  if (!latest) return [];
  if (latest.published === next?.published) throw new Error("East Lansing: ambiguous latest fire notice");

  const { title, category, posted, body } = await civicPlusNewsFlashArticle(await readArticle(latest.url));
  if (title !== latest.title || category !== CATEGORY || posted !== localClock(new Date(latest.published), ZONE).date) {
    throw new Error("East Lansing: article does not match the current feed item");
  }
  if (LIFT.test(title)) return [];
  if (!/Fire (?:Prevention Bureau|Department)/i.test(body) || !/\b(?:issued a ban on open burning|permits for open burning.*(?:suspend|denied))/i.test(body) ||
      !/\b(?:ban is in effect|no new outdoor burn permits will be issued) until further notice\b/i.test(body) ||
      !/\b(?:all property within|within the limits of) the City of East Lansing\b/i.test(body) ||
      !/\brecreational fires\b/i.test(body) || /\bban (?:is|was|has been) lifted\b/i.test(body)) {
    throw new Error("East Lansing: unrecognized fire order scope or duration");
  }
  return AREAS.map(({ fips, county }) => ({
    ...META, sourceId: META.id, fips, county, officialUrl: latest.url, status: "ban",
    label: "Fire department reports an open burning ban", scopeNote: "Within the City of East Lansing",
    note: "The fire department reports an open burning ban that includes recreational fires and bonfires. Check the city notice for the full scope.",
    checked: now.toISOString(), sourceUpdated: latest.published, since: null, expires: null,
  }));
}

export const miEastLansingFireNotices: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", keepRowLinks: true, staleMs: STALE_MS,
  reportingFips: AREAS.map(({ fips }) => fips),
  cadence: { kind: "daily", zone: ZONE, hours: [2, 8, 14, 20] },
  async fetch({ now }) {
    const get = pacedSourceReader({ maxBytes: 300_000, maxResponseAgeMs: 6 * 3_600_000 });
    async function getResponse(url: string) {
      const reply = await get(url);
      if (reply.notModified) throw new Error("Unexpected East Lansing 304");
      return reply.response;
    }
    const feed = await getResponse(META.sourceUrl);
    return { rows: await parseEastLansingFireNotices(await feed.text(), now, getResponse) };
  },
};
