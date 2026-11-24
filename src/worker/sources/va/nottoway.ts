import type { CountyStatus } from "../../../shared/types";
import { localClock, parseUsDate, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://nottoway.org/";
const SIX_HOURS = 6 * 60 * 60 * 1000;
const META = {
  id: "va-nottoway-burn-ban", state: "VA", scope: "part", stack: "Revize / county news cards",
  sourceName: "Nottoway County", sourceUrl: URL, officialUrl: URL,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

const ISSUE = /^(?:County-?wide )?Burn Ban (?:Is )?In Effect Until Further Notice[.!]?$/i;
const LIFT = /^(?:County-?wide )?Burn Ban (?:Has Been |Is )?(?:Lifted|Rescinded|Cancelled|Canceled)[.!]?$/i;

export async function parseNottowayNews(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const [heading, ...cards] = await extractHtmlGrid(input, {
    row: "#news-heading, #news-tiny-carousel > ul > li",
    cell: "#news-heading h2, #news-tiny-carousel .news-date, #news-tiny-carousel .news-text",
  });
  if (heading?.length !== 1 || heading[0].text !== "COUNTY NEWS" || !cards.length) {
    throw new Error("Nottoway County: expected the county news carousel");
  }
  const today = localClock(now, US_ZONES.Eastern).date;
  const news = cards.map(([stamp, headline, ...extra]) => {
    const day = stamp && parseUsDate(stamp.text);
    if (!day || day > today || !headline?.text || extra.length) throw new Error("Nottoway County: malformed news card");
    return { day, title: headline.text };
  });
  const [latest, ...other] = news.filter(({ title }) => /\bburn ban\b/i.test(title))
    .sort((left, right) => right.day.localeCompare(left.day));
  if (!latest || LIFT.test(latest.title) || other.some(({ day, title }) => day === latest.day && LIFT.test(title))) return [];
  if (!ISSUE.test(latest.title) || other.some(({ day, title }) => day === latest.day && title !== latest.title)) {
    throw new Error("Nottoway County: unrecognized burn ban headline");
  }
  return [{
    fips: "51135", county: "Nottoway County", state: META.state, status: "ban", scope: META.scope,
    scopeNote: "Area covered by the Nottoway County burn ban",
    label: "Burn ban in effect until further notice",
    note: "Nottoway County lists an active burn ban in its county news. Ask the county for the order's exact boundaries and exceptions, including coverage in incorporated towns.",
    sourceId: META.id, sourceName: META.sourceName, sourceUrl: URL, officialUrl: URL,
    checked: now.toISOString(), sourceUpdated: latest.day, since: null, expires: null,
  }];
}

export const vaNottowayBurnBan: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", cadence: { kind: "hourly" }, staleMs: SIX_HOURS,
  async fetch({ now }) {
    const reply = await fetchSource(URL, {
      headers: { accept: "text/html" }, maxBytes: 256_000, maxResponseAgeMs: SIX_HOURS,
    });
    if (reply.notModified) throw new Error("Unexpected Nottoway news 304");
    return { rows: await parseNottowayNews(reply.response, now) };
  },
};
