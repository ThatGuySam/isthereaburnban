import type { CountyStatus } from "../../../shared/types";
import { COUNTY_BY_FIPS } from "../../counties";
import { atLocalTime, localClock, parseUsDate, shiftDay, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const BASE = "https://wwwapps.emnrd.nm.gov/SPD/ParksReportingPublicDisplay";
const URL = `${BASE}/Restriction/Index`;
const META = {
  id: "nm-state-parks-fire", state: "NM", scope: "part", stack: "ASP.NET MVC / HTML",
  sourceName: "New Mexico State Parks Division", sourceUrl: URL, officialUrl: URL, keepRowLinks: true,
} as const;
const ZONE = US_ZONES.Mountain;

// Park IDs from the alerts portal, with county footprints from the State Parks GIS layer.
// Bluewater Lake (1) stays manual while the active listing conflicts with the division's lake update.
const PARKS: Readonly<Record<string, readonly [name: string, ...fips: string[]]>> = {
  "9": ["Coyote Creek", "35033"],
  "10": ["El Vado Lake", "35039"],
  "12": ["Fenton Lake", "35043"],
  "13": ["Heron Lake", "35039"],
  "14": ["Hyde Memorial", "35049"],
  "17": ["Manzano Mountains", "35057"],
  "18": ["Morphy Lake", "35033"],
  "19": ["Navajo Lake", "35039", "35045"],
  "20": ["Oasis", "35041"],
  "21": ["Oliver Lee", "35035"],
  "25": ["Rockhound", "35029"],
  "28": ["Santa Rosa Lake", "35019"],
  "29": ["Storrie Lake", "35047"],
  "30": ["Sugarite Canyon", "35007"],
  "33": ["Villanueva", "35047"],
  "38": ["Mesilla Valley Bosque", "35013"],
  "103": ["Pecos Canyon", "35047"],
};

const TITLE = "#page-title-container .PageTitle";
const PARK = "#mainContentContainer main td.bold";
const NOTICE = '#mainContentContainer main td[style="text-align:left;"]';
const DETAIL = /^\/SPD\/ParksReportingPublicDisplay\/WebDisplay\/Detail\/(\d+)$/;
const STAGE = /^Stage\s+(\w+)\s+Fire Restrictions?\b/i;
const LIFT = /^(?:No fire restrictions\b|(?:All )?fire restrictions (?:have been )?(?:lifted|rescinded)\b)/i;

export async function parseNmStateParks(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const [heading, ...entries] = await extractHtmlGrid(input, {
    row: `${TITLE}, ${PARK}, ${NOTICE}`,
    cell: `${TITLE} > span, ${PARK} > a, ${NOTICE} > span:nth-of-type(1), ${NOTICE} > span:nth-of-type(2)`,
  });
  if (heading?.length !== 1 || heading[0].text !== "State Park Restrictions" || !entries.length) {
    throw new Error("New Mexico State Parks: expected the active park restrictions listing");
  }

  type Park = { name: string; notices: { body: string; posting: string }[] };
  const groups = new Map<string, Park>();
  let park: Park | undefined;
  for (const cells of entries) {
    const [first, second] = cells;
    const id = DETAIL.exec(first?.href ?? "")?.[1];
    if (id && cells.length === 1 && !groups.has(id) && first.text) {
      park = { name: first.text, notices: [] };
      groups.set(id, park);
    } else if (park && cells.length === 2 && first.text && second.text) {
      park.notices.push({ body: first.text, posting: second.text });
    } else {
      throw new Error("New Mexico State Parks: unexpected restriction listing row");
    }
  }
  if ([...groups.values()].some(({ notices }) => !notices.length)) {
    throw new Error("New Mexico State Parks: expected notices for each listed park");
  }

  const checked = now.toISOString();
  const today = localClock(now, ZONE).date;
  const rows: CountyStatus[] = [];
  for (const [id, { name, notices }] of groups) {
    const mapping = PARKS[id];
    if (!mapping || mapping[0] !== name) continue;
    const active = notices.filter(({ body }) => STAGE.test(body) || LIFT.test(body)).flatMap(({ body, posting }) => {
      const dates = /^Posting Dates: (\d{1,2}\/\d{1,2}\/\d{4}) - (ongoing|\d{1,2}\/\d{1,2}\/\d{4})$/i.exec(posting);
      const start = dates && parseUsDate(dates[1]);
      const end = dates?.[2].toLowerCase() === "ongoing" ? null : parseUsDate(dates?.[2] ?? "");
      if (!start || (!end && dates?.[2].toLowerCase() !== "ongoing") || (end && end < start)) {
        throw new Error(`New Mexico State Parks: invalid posting dates for ${name}`);
      }
      if (today < start || (end && today > end)) return [];
      return [{ body, end, stage: STAGE.exec(body)?.[1].toUpperCase() }];
    });
    // Multiple contemporaneous notices can disagree about grills and portable fire pits.
    if (active.length !== 1) continue;
    const [{ body, end, stage }] = active;
    if ((stage !== "I" && stage !== "II") || !/\bcampfire\b/i.test(body) ||
        !/\b(?:prohibited|may not|except within|no ground or pit fires are allowed)\b/i.test(body)) continue;
    for (const fips of mapping.slice(1)) {
      const county = COUNTY_BY_FIPS.get(fips);
      if (!county || county.state !== META.state) throw new Error(`Invalid New Mexico park county: ${fips}`);
      rows.push({
        fips, county: county.name, state: META.state, sourceId: META.id, scope: META.scope,
        status: stage === "II" ? "ban" : "restricted", scopeNote: `${name} State Park, campfires and solid-fuel devices`,
        label: `Stage ${stage} park fire restrictions`, note: body,
        since: null, expires: end, sourceUpdated: null, checked,
        validUntil: end ? atLocalTime(shiftDay(end, 1), 0, ZONE) ?? undefined : undefined,
        sourceName: META.sourceName, sourceUrl: URL, officialUrl: `${BASE}/WebDisplay/Detail/${id}`,
      });
    }
  }
  return rows;
}

export const nmStateParks: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: ZONE, hours: [7, 15] }, staleMs: 24 * 3_600_000,
  async fetch({ now }) {
    const reply = await fetchSource(URL, {
      headers: { accept: "text/html" }, maxBytes: 150_000, maxResponseAgeMs: 12 * 3_600_000,
    });
    if (reply.notModified) throw new Error("Unexpected New Mexico State Parks 304");
    return { rows: await parseNmStateParks(reply.response, now) };
  },
};
