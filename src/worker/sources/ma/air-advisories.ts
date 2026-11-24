import type { CountyStatus } from "../../../shared/types";
import { countiesInState, COUNTY_BY_FIPS } from "../../counties";
import { localClock, localDayWindow, parseWeekdayDate, US_ZONES } from "../lib/dates";
import { parseFeed } from "../lib/feeds";
import { extractHtml } from "../lib/html";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const META = {
  id: "ma-massdep-air-advisories", state: "MA", scope: "state",
  stack: "Mailchimp RSS / embedded HTML",
  sourceName: "MassDEP Open Burning Advisories",
  sourceUrl: "https://us2.campaign-archive.com/feed?u=9e5b5851d32503d96e163675f&id=9cd9c675f8",
  officialUrl: "https://us2.campaign-archive.com/home/?u=9e5b5851d32503d96e163675f&id=9cd9c675f8",
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;
const ZONE = US_ZONES.Eastern;
const COUNTIES = countiesInState(META.state);
// Town membership from the MassGIS DFS districts and municipalities layers.
const DISTRICT_COUNTIES: Readonly<Record<number, readonly string[]>> = {
  1: ["25001", "25007", "25019"],
  2: ["25021", "25023"],
  3: ["25005", "25021"],
  4: ["25005", "25021"],
  5: ["25009"],
  6: ["25009", "25017"],
  7: ["25027"],
  8: ["25017", "25027"],
  9: ["25011", "25027"],
  10: ["25015"],
  11: ["25013"],
  12: ["25003", "25013"],
  13: ["25009", "25017", "25021", "25025"],
  14: ["25017", "25027"],
  15: ["25009"],
};

const SUBJECT = /^Open Burning (?:Advisory|Message) from MassDEP - (.+)$/i;
const HEADING = /^Massachusetts Open Burning (?:Advisory|Message) for (.+)$/i;
const ORDER_INTRO = "In accordance with Massachusetts Air Pollution Regulations 310 CMR 7.07(3)(e) and 310 CMR 7.07(3)(g), " +
  "the Massachusetts Department of Environmental Protection is notifying local fire departments in ";
const ORDER = /^(.+?) that open burning permits are NOT TO BE ISSUED TODAY( STATEWIDE)?, ([a-z]+, [a-z]+ \d{1,2}, \d{4})\b/i;
const DISTRICTS = /^(ALL )?Massachusetts Fire and Incident Support Unit \(ISU\) Response Districts(?: (.+))?$/i;
const ACCEPTABLE = /^Massachusetts Department of Environmental Protection is notifying local fire departments .+ confirms that from an air quality standpoint, conditions for Open Burning are Acceptable statewide today\./i;

function districtNumbers(raw: string) {
  const districts = new Set<number>();
  for (const token of raw.split(/,?\s+and\s+|,\s*/i)) {
    const range = /^(\d{1,2})(?:\s*(?:through|[-–])\s*(\d{1,2}))?$/i.exec(token);
    const first = Number(range?.[1]);
    const last = Number(range?.[2] ?? first);
    if (!DISTRICT_COUNTIES[first] || !DISTRICT_COUNTIES[last] || first > last) {
      throw new Error(`MassDEP: unmapped fire district: ${token}`);
    }
    for (let district = first; district <= last; district++) districts.add(district);
  }
  return districts;
}

export async function parseMassDepAdvisories(xml: string, now: Date): Promise<CountyStatus[]> {
  if (!/<channel>\s*<title><!\[CDATA\[Open Burning Advisories Archive Feed\]\]><\/title>/i.test(xml)) {
    throw new Error("MassDEP: expected the open-burning advisory feed");
  }
  const checked = now.toISOString();
  const day = localClock(now, ZONE).date;
  const { validFrom, validUntil } = localDayWindow(day, ZONE);
  const isToday = ({ published }: { published: string | null }) =>
    published !== null && published >= validFrom && published < validUntil;
  const entries = parseFeed(xml, { includeText: isToday });
  if (!entries.length || entries.some(({ title, published }) => !title || !published)) {
    throw new Error("MassDEP: incomplete advisory feed");
  }
  const today = entries.filter(isToday).sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
  const [latest, previous] = today;
  if (!latest?.published) return [];
  const sourceUpdated = latest.published;
  const title = SUBJECT.exec(latest.title)?.[1] ?? "";
  if (sourceUpdated > checked || sourceUpdated === previous?.published || parseWeekdayDate(title) !== day) {
    throw new Error("MassDEP: invalid or ambiguous same-day advisory date");
  }
  const officialUrl = new URL(latest.url);
  if (officialUrl.origin !== "https://mailchi.mp") throw new Error("MassDEP: unrecognized advisory link");

  const { blocks, tables } = await extractHtml(latest.text);
  const headings = blocks.filter(({ tag, text }) => tag === "h1" && HEADING.test(text));
  const heading = headings[0]?.text ?? "";
  if (headings.length !== 1 || parseWeekdayDate(HEADING.exec(heading)?.[1] ?? "") !== day) {
    throw new Error("MassDEP: advisory body date does not match the feed");
  }
  const bodies = tables.flatMap(({ rows }) => rows.flat())
    .filter((text) => text.startsWith(heading + " "));
  if (bodies.length !== 1) throw new Error("MassDEP: missing or ambiguous advisory text");
  const body = bodies[0].slice(heading.length + 1);
  if (ACCEPTABLE.test(body)) return [];

  const order = body.startsWith(ORDER_INTRO) && ORDER.exec(body.slice(ORDER_INTRO.length));
  if (!order || parseWeekdayDate(order[3]) !== day) throw new Error("MassDEP: unrecognized permit decision");
  const area = DISTRICTS.exec(order[1]);
  if (!area || (area[2] && (area[1] || order[2])) || (!area[2] && !area[1] && !order[2])) {
    throw new Error("MassDEP: unrecognized advisory area");
  }
  const common = {
    state: META.state, status: "restricted", label: "MassDEP air-quality no-burn day",
    note: "MassDEP directed local fire departments to withhold permits for covered open burning today because of air pollution. Ask your local fire department about other burn activities and orders.",
    checked, sourceUpdated, since: day, expires: day, validFrom: sourceUpdated, validUntil,
    sourceId: META.id, sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: officialUrl.href,
  } satisfies Omit<CountyStatus, "fips" | "county">;
  if (!area[2]) return COUNTIES.map(({ fips, name }) => ({
    ...common, fips, county: name, scope: "state", scopeNote: "Statewide covered open-burning permits",
  }));
  return [...districtNumbers(area[2])].flatMap((district) => DISTRICT_COUNTIES[district].map((fips) => {
    const county = COUNTY_BY_FIPS.get(fips);
    if (!county || county.state !== META.state) throw new Error(`MassDEP: invalid county in Fire District ${district}`);
    return {
      ...common, fips, county: county.name, scope: "part",
      scopeNote: `Massachusetts Fire District ${district} in ${county.name}`,
    };
  }));
}

export const maAirAdvisories: ActiveSource = {
  ...META, keepRowLinks: true, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: ZONE, hours: [9, 13] },
  async fetch({ now }) {
    const xml = await getText(META.sourceUrl, {
      headers: { accept: "application/rss+xml" }, maxBytes: 750_000, maxResponseAgeMs: 6 * 3_600_000,
    });
    return { rows: await parseMassDepAdvisories(xml, now) };
  },
};
