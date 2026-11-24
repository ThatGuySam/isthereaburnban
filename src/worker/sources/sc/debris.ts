import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { localClock, localDayWindow, US_ZONES } from "../lib/dates";
import { pacedTextReader } from "../lib/http";
import { wpRestEndpoint } from "../lib/wordpress";
import type { ActiveSource } from "../types";

const SITE = "https://www.scfc.gov/";
const NAMESPACE = "scfcapi/v2";
const STATUS_URL = wpRestEndpoint(SITE, `${NAMESPACE}/burnstatusmessage`);
const META = {
  state: "SC", scope: "part", stack: "WordPress custom REST / JSON",
  sourceName: "South Carolina Forestry Commission",
  sourceUrl: wpRestEndpoint(SITE, NAMESPACE), officialUrl: `${SITE}notify/`,
} as const;

// The public notification form provides WordPress county IDs. SCFC's administrative
// regions bound the number of external requests and isolate failures by region.
const REGIONS = {
  coastal: {
    Aiken: 159, Allendale: 160, Bamberg: 162, Barnwell: 163, Beaufort: 164, Berkeley: 165,
    Calhoun: 166, Charleston: 167, Colleton: 172, Dorchester: 175, Hampton: 182, Jasper: 184, Orangeburg: 195,
  },
  "pee-dee": {
    Chesterfield: 170, Clarendon: 171, Darlington: 173, Dillon: 174, Florence: 178, Georgetown: 179,
    Horry: 183, Kershaw: 185, Lancaster: 186, Lee: 188, Marion: 190, Marlboro: 191, Sumter: 200, Williamsburg: 202,
  },
  piedmont: {
    Abbeville: 158, Anderson: 161, Cherokee: 168, Chester: 169, Edgefield: 176, Fairfield: 177, Greenville: 180,
    Greenwood: 181, Laurens: 187, Lexington: 189, McCormick: 192, Newberry: 193, Oconee: 194, Pickens: 196,
    Richland: 197, Saluda: 198, Spartanburg: 199, Union: 201, York: 203,
  },
};

const decision = z.object({
  county: z.string(),
  burn_ban: z.enum(["--yes", "--no"]),
  status: z.object({
    county: z.string(),
    post_type: z.literal("burn_status"),
    post_status: z.literal("publish"),
    post_date_gmt: z.string().transform((stamp) => stamp.replace(" ", "T") + "Z").pipe(z.iso.datetime({ precision: 0 })),
  }),
});

export function parseScfcDebris(data: unknown, now: Date, lookup: {
  name: string;
  wpId: number;
  sourceId: string;
}): CountyStatus[] {
  const result = decision.safeParse(data);
  const county = countyByName(META.state, lookup.name);
  if (!result.success || !county || result.data.status.county !== String(lookup.wpId) ||
      countyByName(META.state, result.data.county)?.fips !== county.fips) {
    throw new Error(`SCFC: invalid debris status for ${lookup.name}`);
  }
  if (result.data.burn_ban !== "--yes") return [];
  const sourceUpdated = new Date(result.data.status.post_date_gmt);
  const day = localClock(now, US_ZONES.Eastern).date;
  const window = localDayWindow(day, US_ZONES.Eastern);
  const updated = sourceUpdated.toISOString();
  // The site inserts today's date in the UI even when the underlying post is old.
  if (updated < window.validFrom || sourceUpdated > now) return [];
  return [{
    fips: county.fips, county: county.name, state: META.state, sourceId: lookup.sourceId,
    status: "ban", label: "Debris burning closed",
    scope: META.scope, scopeNote: "Residential yard-debris burning outside city and town limits",
    note: "The Forestry Commission’s county notification system reports a ban for this activity. Check the Commission’s notices and local fire authority for the full order, other activities and exemptions.",
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    sourceUpdated: updated, checked: now.toISOString(), since: null, expires: null,
    validFrom: updated, validUntil: window.validUntil,
  }];
}

export const scfcDebris: ActiveSource[] = Object.entries(REGIONS).map(([region, counties]) => {
  const id = `sc-scfc-debris-${region}`;
  return {
    ...META, id, coverage: "restrictions", mode: "positive-only",
    cadence: { kind: "daily", zone: US_ZONES.Eastern, hours: [10, 14, 18] },
    staleMs: 12 * 60 * 60 * 1000,
    async fetch({ now }) {
      // This is the read-only lookup called on county selection. The burn
      // notification form is a separate request and is never submitted here.
      const read = pacedTextReader({
        method: "POST", redirect: "manual", maxBytes: 12_000, timeoutMs: 4_000,
        headers: { "content-type": "application/json", accept: "application/json" },
      });
      const rows: CountyStatus[] = [];
      for (const [name, wpId] of Object.entries(counties)) {
        const body = await read(STATUS_URL, { body: JSON.stringify({ county: String(wpId) }) });
        rows.push(...parseScfcDebris(JSON.parse(body), now, { name, wpId, sourceId: id }));
      }
      return { rows };
    },
  };
});
