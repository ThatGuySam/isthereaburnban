import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { parseLocalDateTime, parseWeekdayDate, US_ZONES } from "../lib/dates";
import { blockAfterHeading, blocksBetweenMarkers, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://health.hawaii.gov/cab/";
const ZONE = US_ZONES.Hawaii;
const HOUR = 3_600_000;
const META = {
  id: "hi-cab-no-burn-periods", state: "HI", scope: "part",
  stack: "WordPress / HTML notice panel", sourceName: "Hawaiʻi Department of Health Clean Air Branch",
  sourceUrl: URL, officialUrl: URL,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

// The county zoning map identifies these Hawaiʻi Island districts.
// https://www.planning.hawaiicounty.gov/resources/zone-maps
const DISTRICTS = new Map([
  ["north kona", "North Kona"], ["south kona", "South Kona"], ["kau", "Kaʻū"],
  ["north hilo", "North Hilo"], ["south hilo", "South Hilo"], ["hamakua", "Hāmākua"],
  ["north kohala", "North Kohala"], ["south kohala", "South Kohala"], ["puna", "Puna"],
]);
const GROUPS = new Map([
  ["north and south kona", ["north kona", "south kona"]],
  ["north and south hilo", ["north hilo", "south hilo"]],
  ["north and south kohala", ["north kohala", "south kohala"]],
  ["hamakua, north and south hilo, and puna", ["hamakua", "north hilo", "south hilo", "puna"]],
]);
const AREA = /^HAWAI[ʻ‘’']?I ISLAND [–—-] (.+?) Districts?$/i;
const CURRENT = /^The [“"]NO BURN[”"] is currently in effect until (.+)\.$/i;
const DEADLINE = /^(12 noon|\d{1,2}(?::\d{2})? ?[ap]\.?m\.?), (.+, \d{4})$/i;
const TITLE = "NO BURN PERIODS:";
const INTRO = "The Clean Air Branch is issuing a mandatory No Burn Period for the following areas:";
const TERMS = "Agricultural and conditionally allowed open burning is prohibited while a No Burn Period is in effect unless a waiver is provided by the Director.";

function districtNames(text: string) {
  const name = AREA.exec(text)?.[1].normalize("NFD").replace(/[\p{M}ʻ‘’']/gu, "").toLowerCase();
  if (!name) throw new Error(`Hawaiʻi Clean Air Branch: unrecognized notice area "${text}"`);
  return (GROUPS.get(name) ?? [name]).map((key) => {
    const district = DISTRICTS.get(key);
    if (!district) throw new Error(`Hawaiʻi Clean Air Branch: unmapped district "${key}"`);
    return district;
  });
}

function expiration(text: string) {
  const end = CURRENT.exec(text)?.[1];
  if (end?.toLowerCase() === "further notice") return { expires: null };
  const match = end && DEADLINE.exec(end);
  if (match) {
    const [, clock, date] = match;
    const expires = parseWeekdayDate(date);
    const validUntil = expires && parseLocalDateTime(`${expires} ${clock.toLowerCase() === "12 noon" ? "12 p.m." : clock}`, ZONE);
    if (expires && validUntil) return { expires, validUntil };
  }
  throw new Error(`Hawaiʻi Clean Air Branch: unrecognized notice deadline "${text}"`);
}

export function parseHiNoBurnPeriods({ blocks }: HtmlParts, now: Date): CountyStatus[] {
  const home = blockAfterHeading(blocks, /^Clean Air Branch$/, { requireUnique: true, headingTag: "h2" });
  if (home[0]?.text !== "Mission Statement") throw new Error("Hawaiʻi Clean Air Branch: homepage changed or is missing");

  const panel = blocksBetweenMarkers(home, {
    start: ({ tag, text }) => tag === "p" && text === TITLE,
    end: ({ tag, text }) => tag === "p" && text === TERMS,
  });
  if (!panel) {
    if (home.some(({ text }) => text === INTRO || CURRENT.test(text))) {
      throw new Error("Hawaiʻi Clean Air Branch: incomplete no-burn panel");
    }
    return [];
  }

  const [intro, ...entries] = panel;
  if (intro?.tag !== "p" || intro.text !== INTRO || !entries.length || entries.length % 2) {
    throw new Error("Hawaiʻi Clean Air Branch: invalid no-burn panel");
  }

  const county = countyByName(META.state, "Hawaii");
  if (!county) throw new Error("Missing Hawaiʻi County");
  const checked = now.toISOString();
  const rows: CountyStatus[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < entries.length; i += 2) {
    const [area, notice] = entries.slice(i, i + 2);
    if (area.tag !== "p" || notice.tag !== "li") throw new Error("Hawaiʻi Clean Air Branch: invalid no-burn entry");
    const window = expiration(notice.text);
    for (const district of districtNames(area.text)) {
      if (seen.has(district)) throw new Error(`Hawaiʻi Clean Air Branch: duplicate notice for ${district}`);
      seen.add(district);
      if (window.validUntil && window.validUntil <= checked) continue;
      rows.push({
        ...window, fips: county.fips, county: county.name, state: META.state, sourceId: META.id,
        scope: META.scope, scopeNote: `${district} District, agricultural and conditionally approved burning`,
        status: "ban", label: "Clean Air Branch no-burn period",
        note: "The Clean Air Branch prohibits agricultural burning and conditionally allowed burning under HAR § 11-60.1-52(e) during this period unless the director grants a waiver.",
        checked, since: null, sourceUpdated: null,
        sourceName: META.sourceName, sourceUrl: URL, officialUrl: URL,
      });
    }
  }
  return rows;
}

export const hiCabNoBurnPeriods: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: ZONE, hours: [0, 7, 11, 15, 19] },
  staleMs: 10 * HOUR,
  async fetch({ now }) {
    const reply = await fetchSource(URL, {
      headers: { accept: "text/html" }, maxBytes: 180_000, maxResponseAgeMs: 2 * HOUR,
    });
    if (reply.notModified) throw new Error("Unexpected Hawaiʻi no-burn periods 304");
    return { rows: parseHiNoBurnPeriods(await extractHtml(reply.response), now) };
  },
};
