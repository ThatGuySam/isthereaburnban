import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { civicPlusNewsFlash } from "../lib/civicplus";
import { atLocalTime, localClock, shiftDay, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Eastern;
const URL = "https://www.carrollvalley.gov/m/newsflash?cat=5";
const META = {
  id: "pa-carroll-valley-burning", state: "PA", scope: "part", stack: "CivicPlus / HTML",
  sourceName: "Carroll Valley Borough", sourceUrl: URL, officialUrl: URL,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

const BURNING_NOTICE = /\b(?:burn(?:ing)? bans?|ban on (?:outdoor |open )*burning|open burning (?:is |now )?(?:banned|prohibited)|burn(?:ing)? restrictions?)\b/i;
const ACTIVE_TITLE = /^Ban on Open Burning now in Effect$/i;
const ACTIVE_PREVIEW = /^An outdoor open burning ban is now in effect\b.*\buntil further notice\b/i;
const LIFT_TITLE = /^(?:Outdoor |Open )?Burn(?:ing)? Ban (?:Has Been )?(?:Lifted|Rescinded)$|^Ban on (?:Outdoor |Open )?Burning (?:Has Been )?(?:Lifted|Rescinded)$/i;
const LIFT_PREVIEW = /\b(?:has been|is now|is) (?:lifted|rescinded)\b/i;
// An undated end requires new borough confirmation after two weeks.
const MAX_NOTICE_DAYS = 14;

export async function parseCarrollValley(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const items = await civicPlusNewsFlash(input, { id: 5, name: "Borough News & Announcement" });
  const [latest, previous] = items.filter(({ title }) => BURNING_NOTICE.test(title))
    .sort((a, b) => b.posted.localeCompare(a.posted));
  if (!latest) return [];

  const { date: today } = localClock(now, ZONE);
  if (latest.updated > today || latest.posted === previous?.posted) {
    throw new Error("Carroll Valley: burn notice publication dates are ambiguous");
  }
  const reviewDay = shiftDay(latest.posted, MAX_NOTICE_DAYS);
  if (today >= reviewDay) return [];
  if (LIFT_TITLE.test(latest.title) && LIFT_PREVIEW.test(latest.preview)) return [];
  if (!ACTIVE_TITLE.test(latest.title) || !ACTIVE_PREVIEW.test(latest.preview)) {
    throw new Error("Carroll Valley: unrecognized burn notice");
  }

  const county = countyByName(META.state, "Adams");
  const validUntil = atLocalTime(reviewDay, 0, ZONE);
  if (!county || !validUntil) throw new Error("Carroll Valley: missing county or invalid review date");
  return [{
    fips: county.fips, county: county.name, state: META.state, sourceId: META.id, status: "ban",
    scope: META.scope, scopeNote: "Carroll Valley Borough, outdoor open burning",
    label: "Carroll Valley outdoor open-burning ban",
    note: "Carroll Valley Borough announced an outdoor open-burning ban due to drought. The borough says it will remain in effect until further notice. Check the borough's latest notice before burning.",
    checked: now.toISOString(), sourceUpdated: null, since: latest.posted, expires: null, validUntil,
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
  }];
}

export const paCarrollValley: ActiveSource = {
  ...META,
  coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: ZONE, hours: [3, 9, 15, 21] },
  staleMs: 8 * 60 * 60 * 1000,
  async fetch({ now }) {
    const reply = await fetchSource(URL, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected Carroll Valley News Flash 304");
    return { rows: await parseCarrollValley(reply.response, now) };
  },
};
