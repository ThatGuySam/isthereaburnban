import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { localClock, localDayWindow, parseLocalIsoTimestamp, US_ZONES } from "../lib/dates";
import { parseJson } from "../lib/feeds";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Eastern;
const MAP = "https://mainefireweather.org/";
const URL = `${MAP}admin/php/get-content.php?content=class-days&which=map`;
const REPORT = "https://www11.maine.gov/dacf/mfs/wildfire_danger_report/index.html";
const META = {
  id: "me-town-permit-holds", state: "ME", scope: "part",
  stack: "PHP / dated JSON", sourceName: "Maine Forest Service",
  sourceUrl: URL, officialUrl: REPORT, keepRowLinks: true,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl" | "keepRowLinks">;

const weatherZone = z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
// index.js uses these values as legend indexes. Codes 0 and 1 mean unknown and
// snow cover. Codes 2–6 represent the published fire danger classes 1–5.
const legendCode = z.enum(["0", "1", "2", "3", "4", "5", "6"]);
const classDays = z.object({
  result: z.literal("success"), timestamp: z.string(),
  classdays: z.record(weatherZone, legendCode),
});

// Municipal rules and modern zone assignments were checked against the sources in fixtures/README.md.
const TOWNS: ReadonlyArray<{
  name: string;
  county: string;
  zone: z.infer<typeof weatherZone>;
  officialUrl: string;
  holds: readonly number[];
  wardenOnly?: number;
}> = [
  {
    name: "Union", county: "Knox", zone: "11", holds: [3, 4, 5],
    officialUrl: "https://www.union.maine.gov/index.asp?SEC=D6088068-A449-4DE3-A1FF-04F8CA04755C",
  },
  {
    name: "South Thomaston", county: "Knox", zone: "11", holds: [4, 5], wardenOnly: 3,
    officialUrl: "https://souththomaston.me/town-departments/fire-department/",
  },
  {
    name: "Cumberland", county: "Cumberland", zone: "10", holds: [3, 4, 5],
    officialUrl: "https://www.townofcumberlandmaine.gov/469/Burn-Permits",
  },
  {
    name: "Windham", county: "Cumberland", zone: "9", holds: [3],
    officialUrl: "https://www.windhammaine.us/193/Open-BurningBurnFireworks-Permits",
  },
];

export function parseMaineTownPermits(raw: string, now: Date): CountyStatus[] {
  const data = parseJson(raw, (value): value is z.infer<typeof classDays> => classDays.safeParse(value).success);
  const { date } = localClock(now, ZONE);
  const checked = now.toISOString();
  const sourceUpdated = parseLocalIsoTimestamp(data.timestamp, ZONE);
  if (!sourceUpdated || data.timestamp.slice(0, 10) !== date || sourceUpdated > checked) {
    throw new Error("Maine Forest Service: expected a current Eastern class-day timestamp");
  }
  const { validUntil } = localDayWindow(date, ZONE);
  const rows: CountyStatus[] = [];
  for (const town of TOWNS) {
    const fireClass = Number(data.classdays[town.zone]) - 1;
    const wardenOnly = fireClass === town.wardenOnly;
    if (!wardenOnly && !town.holds.includes(fireClass)) continue;
    const county = countyByName(META.state, town.county);
    if (!county) throw new Error(`Unmapped Maine permit-rule county: ${town.county}`);
    const label = wardenOnly ? "Burn permits from fire wardens only" : "Open burning permits suspended";
    const action = wardenOnly ? "limits burn permit issuance to fire wardens" : "withholds open burning permits";
    rows.push({
      fips: county.fips, county: county.name, state: META.state, sourceId: META.id, status: "restricted",
      scope: META.scope, scopeNote: `Town of ${town.name}, permitted open burning`, label,
      note: `The Maine Forest Service reports Class ${fireClass} for Zone ${town.zone}. ${town.name} ${action} on Class ${fireClass} days. Ask the town fire warden about other burning rules.`,
      sourceName: `Town of ${town.name} and Maine Forest Service`, sourceUrl: URL, officialUrl: town.officialUrl,
      checked, sourceUpdated, since: null, expires: date, validFrom: sourceUpdated, validUntil,
    });
  }
  return rows;
}

export const meTownPermitHolds: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: ZONE, hours: [9, 12, 16] }, staleMs: 24 * 3_600_000,
  async fetch({ now }) {
    const reply = await fetchSource(URL, { headers: { accept: "application/json" }, maxBytes: 8_000 });
    if (reply.notModified) throw new Error("Unexpected Maine class-day 304");
    return { rows: parseMaineTownPermits(await reply.response.text(), now) };
  },
};
