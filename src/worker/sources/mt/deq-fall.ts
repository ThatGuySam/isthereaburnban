import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { arcgisRows, arcgisUrl, msToIso } from "../lib/arcgis";
import { localClock, localDayWindow, weekdayOnOrAfter, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const LAYER = "https://gis.mtdeq.us/hosting/rest/services/Hosted/Montana_Open_Burning_Restrictions/FeatureServer/0";
const MAP = "https://gis.mtdeq.us/portal/apps/instant/sidebar/index.html?appid=f6169ce9ad4a43098e1c89a909ea07e4";
const META = {
  id: "mt-deq-fall-open-burning", state: "MT", scope: "part", stack: "ArcGIS Enterprise FeatureServer",
  sourceName: "Montana Department of Environmental Quality",
  sourceUrl: arcgisUrl(LAYER, ["objectid", "area_name", "restrictions", "area_notes", "last_edited_date"]),
  officialUrl: MAP,
} as const;

const ZONE = US_ZONES.Mountain;
const DECISION = z.object({
  objectid: z.number().int().positive(),
  area_name: z.string().min(1),
  restrictions: z.number().int().nullable(),
  area_notes: z.string().nullable(),
  last_edited_date: z.number().nullable(),
});

function inFallSeason(day: string) {
  return day.slice(5) >= "09-01" && day.slice(5) <= "11-30";
}

// Codes from the layer's restrictions domain. Code 100 is a free-text
// weekend schedule and needs a dated per-day sample before it can be decoded.
const LIMITS = new Map([
  [1, "Open burning fully restricted"],
  [3, "Open burning only from 10 a.m. to 4 p.m."],
  [4, "Open burning only from 11 a.m. to 4 p.m."],
  [5, "Open burning only from noon to 4 p.m."],
  [6, "Open burning only after 10 a.m."],
  [7, "Open burning only after 11 a.m."],
  [8, "Open burning only after noon"],
  [9, "Open burning only before 4 p.m."],
  ...["2,500", "3,000", "3,500", "4,000", "4,500", "5,000", "5,500", "6,000", "6,500"]
    .map((feet, index): [number, string] => [index + 10, `Open burning restricted below ${feet} feet`]),
]);

function scopeNote(countyFips: string) {
  if (countyFips === "30067") return "DEQ-regulated fall open burning south of I-90 in Park County";
  if (countyFips === "30053") return "DEQ-regulated fall open burning in Lincoln County outside the Libby Impact Zone";
  return "DEQ-regulated fall open burning";
}

export function parseDeqFall(data: unknown, now: Date): CountyStatus[] {
  const { date: today } = localClock(now, ZONE);
  if (!inFallSeason(today)) return [];

  const window = localDayWindow(today, ZONE);
  const checked = now.toISOString();
  const seen = new Set<number>();
  const rows: CountyStatus[] = [];
  let currentDecisions = 0;
  for (const feature of arcgisRows(data, { requireComplete: true })) {
    const decision = DECISION.parse(feature);
    if (seen.has(decision.objectid)) throw new Error("Montana DEQ: duplicate burn decision");
    seen.add(decision.objectid);
    const label = LIMITS.get(decision.restrictions ?? -1);
    if (!label && decision.restrictions !== 0) continue;
    const county = countyByName(META.state, decision.area_name);
    const sourceUpdated = msToIso(decision.last_edited_date);
    const weekday = /^(?:On|For) ([a-z]+)\b/i.exec(decision.area_notes?.trim() ?? "")?.[1];
    if (!county || !sourceUpdated || sourceUpdated > checked || !weekday) continue;
    const editedDay = localClock(new Date(sourceUpdated), ZONE).date;
    if (weekdayOnOrAfter(editedDay, weekday, 3) !== today) continue;
    currentDecisions++;
    // An explicit DEQ all-clear is limited to air quality. Other authorities
    // can impose restrictions on the same activity in the same area.
    if (!label) continue;
    rows.push({
      ...window, fips: county.fips, county: county.name, state: META.state, sourceId: META.id,
      scope: META.scope, scopeNote: scopeNote(county.fips), status: "restricted", label,
      note: "Montana DEQ’s daily air-quality decision applies to minor open burning. Check local permits and fire-safety restrictions separately.",
      checked, sourceUpdated, since: null, expires: today,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    });
  }
  if (!currentDecisions) throw new Error("Montana DEQ: no dated fall open-burning decisions for today");
  return rows;
}

export const mtDeqFall: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  // DEQ posts the next day's decisions around 4 p.m. local time.
  cadence: { kind: "daily", zone: ZONE, hours: [0, 9, 13] },
  staleMs: 24 * 3_600_000,
  async fetch({ now }) {
    if (!inFallSeason(localClock(now, ZONE).date)) return { rows: [] };
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "application/json" }, maxBytes: 100_000 });
    if (reply.notModified) throw new Error("Unexpected Montana DEQ 304");
    return { rows: parseDeqFall(await reply.response.json(), now) };
  },
};
