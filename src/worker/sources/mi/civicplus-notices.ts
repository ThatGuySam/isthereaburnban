import type { CountyStatus } from "../../../shared/types";
import { civicPlusNewsFlashArticle, latestCivicPlusNewsFlashNotice } from "../lib/civicplus";
import { localClock, reportWindow, US_ZONES } from "../lib/dates";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";

const HOUR_MS = 3_600_000;
const ZONE = US_ZONES.Eastern;
const LIFT = /^(?:Public Notice: )?(?:Open )?Burn Ban (?:Lifted|Rescinded)[.!]?$/i;

type NoticeCity = {
  id: string;
  site: string;
  feedCategory: string;
  channelTitle: string;
  articleCategory: string;
  sourceName: string;
  areas: readonly { fips: string; county: string }[];
  scopeNote: string;
  issue: RegExp;
};

const cities: readonly NoticeCity[] = [
  {
    id: "mi-battle-creek-fire-notices", site: "https://www.battlecreekmi.gov", feedCategory: "Fire-Department-13",
    channelTitle: "Battle Creek, MI - News Flash - Fire Department News", articleCategory: "Fire Department News",
    sourceName: "Battle Creek Fire Department", areas: [{ fips: "26025", county: "Calhoun County" }],
    scopeNote: "City of Battle Creek",
    issue: /\bThe City of Battle Creek has entered an open burn ban status\b|^Guidance for using fireworks at home is the same this year, but the city’s open burn ban continues\./i,
  },
  {
    id: "mi-grand-ledge-fire-notices", site: "https://www.cityofgrandledge.com", feedCategory: "Public-Notices-7",
    channelTitle: "Grand Ledge, MI - News Flash - *Public Notices", articleCategory: "*Public Notices",
    sourceName: "City of Grand Ledge and Grand Ledge Area Fire Department",
    areas: [{ fips: "26045", county: "Eaton County" }, { fips: "26037", county: "Clinton County" }],
    scopeNote: "City of Grand Ledge",
    issue: /\bThe Grand Ledge Area Fire Dept\. will not issue burn permits to City of Grand Ledge residents\b/i,
  },
];

export const miCivicPlusNotices = cities.map(({ id, site, feedCategory, channelTitle, articleCategory, sourceName, areas, scopeNote, issue }) => {
  const publisher = {
    id, sourceName, state: "MI", scope: "part", stack: "CivicPlus / News Flash RSS",
    officialUrl: new URL("/CivicAlerts.aspx", site).href,
    sourceUrl: new URL(`/RSSFeed.aspx?CID=${feedCategory}&ModID=1`, site).href,
  } as const;
  async function parse(xml: string, now: Date, readArticle: (url: string) => Promise<string | Response>): Promise<CountyStatus[]> {
    const notice = latestCivicPlusNewsFlashNotice(xml, {
      origin: site, channelTitle, now, matches: (title) => /\b(?:burn(?:ing)? ban|no burn permits)\b/i.test(title),
    });
    const window = notice && reportWindow(notice.published, now, 14 * 24 * HOUR_MS);
    if (!notice || !window) return [];
    const article = await civicPlusNewsFlashArticle(await readArticle(notice.url));
    const posted = localClock(new Date(notice.published), ZONE).date;
    if (article.title !== notice.title || article.category !== articleCategory || article.posted !== posted) {
      throw new Error(`${id}: active article does not match the notice feed`);
    }
    if (LIFT.test(article.title)) return [];
    if (!issue.test(article.body)) throw new Error(`${id}: unrecognized fire department restriction`);
    return areas.map(({ fips, county }) => ({
      ...publisher, ...window, sourceId: id, fips, county, officialUrl: notice.url,
      status: "restricted", scopeNote, label: "City fire department reports open-burning restrictions",
      note: "The city reports a local burning restriction. Read the active city notice for the order’s activities and exceptions.",
      checked: now.toISOString(), since: null, expires: null,
    }));
  }
  const source: ActiveSource = {
    ...publisher, mode: "positive-only", coverage: "restrictions", reportingFips: areas.map(({ fips }) => fips),
    keepRowLinks: true, cadence: { kind: "daily", zone: ZONE, hours: [3, 9, 15, 21] }, staleMs: 9 * HOUR_MS,
    async fetch({ now }) {
      const read = pacedTextReader({ maxBytes: 550_000, maxResponseAgeMs: 2 * HOUR_MS });
      return { rows: await parse(await read(publisher.sourceUrl), now, read) };
    },
  };
  return { source, parse };
});
