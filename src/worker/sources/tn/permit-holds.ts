import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName, type County } from "../../counties";
import { localClock, parseLocalIsoTimestamp, US_ZONES } from "../lib/dates";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";
import { tennesseeZone } from "./zones";

const API = "https://tn.firesponse.com/burn-permit/api/burnrestriction";
const META = {
  id: "tn-forestry-permit-holds", state: "TN", scope: "part", stack: "fiResponse / Nuxt public JSON",
  sourceName: "Tennessee Division of Forestry",
  sourceUrl: `${API}/all/public`,
  officialUrl: "https://tn.firesponse.com/burn-permit/public-restrictions/",
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

const COUNTY_TYPE = "d1fcfac5-93c1-41b8-946a-c1cc1976ac97";
const PERMIT_RESTRICTION = "400a8031-fb0f-41aa-8384-17df772b219b";
const PUBLIC_LEVELS = ["PUBLIC", "PRIVATE_PUBLIC"] as const;
// The public app resolves these IDs through /burn-permit/api/master/denialreason.
const FIRE_WEATHER = "33540ce2-a887-49cb-afb1-3a98a663bb8c";
const SMOKE_DISPERSION = "2315c677-c34e-440a-b6f1-2e18cb8a2780";
const OTHER = "25a8fcc2-45da-49c1-996b-a05b74c42af8";
const MUNICIPALITY = "f5595a71-6d7b-482a-a046-9cb423140cb0";

const DIVISION = z.object({ Id: z.uuid(), Name: z.string().min(1), TypeId: z.uuid() });
const ROSTER = z.array(DIVISION.extend({ hasExemption: z.boolean() }));
const DETAILS = z.array(z.object({
  Id: z.uuid(),
  Admindivision: DIVISION.extend({ Type: z.literal("COUNTY"), TypeId: z.literal(COUNTY_TYPE) }),
  RestrictionType: z.object({ Id: z.literal(PERMIT_RESTRICTION) }),
  Reason_for_denial: z.object({ Id: z.enum([FIRE_WEATHER, SMOKE_DISPERSION, OTHER, MUNICIPALITY]) }),
  Start_Timestamp: z.string(),
  End_Timestamp: z.string().nullish(),
  Permanent: z.boolean(),
  All_day: z.boolean(),
  Not_applicable: z.boolean(),
  Level: z.enum(PUBLIC_LEVELS),
}));

type CountyDivision = { county: County; hasExemption: boolean };

export function parseTennesseePermitRoster(text: string): Map<string, CountyDivision> {
  const divisions = new Map<string, CountyDivision>();
  const seen = new Set<string>();
  for (const row of ROSTER.parse(JSON.parse(text))) {
    if (row.TypeId !== COUNTY_TYPE) continue;
    const county = countyByName(META.state, row.Name);
    if (!county || divisions.has(row.Id) || seen.has(county.fips)) {
      throw new Error("Tennessee fiResponse: unrecognized or duplicate county division");
    }
    divisions.set(row.Id, { county, hasExemption: row.hasExemption });
    seen.add(county.fips);
  }
  return divisions;
}

export function parseTennesseePermitHolds(text: string, divisions: ReadonlyMap<string, CountyDivision>, now: Date): CountyStatus[] {
  const checked = now.toISOString();
  const rows: CountyStatus[] = [];
  const seen = new Set<string>();
  for (const detail of DETAILS.parse(JSON.parse(text))) {
    const division = divisions.get(detail.Admindivision.Id);
    const county = division?.county;
    if (!county || countyByName(META.state, detail.Admindivision.Name)?.fips !== county.fips || seen.has(detail.Id)) {
      throw new Error("Tennessee fiResponse: unexpected county or duplicate restriction");
    }
    seen.add(detail.Id);
    const reason = detail.Reason_for_denial.Id;
    if (detail.Not_applicable || detail.Permanent || reason === OTHER || reason === MUNICIPALITY) continue;

    const zone = tennesseeZone(county);
    const start = detail.Start_Timestamp;
    const end = detail.End_Timestamp;
    const validFrom = parseLocalIsoTimestamp(start, zone);
    // Range probes show an all-day record includes its end date through 23:59:00.
    const validUntil = parseLocalIsoTimestamp(detail.All_day && end?.endsWith("T00:00:00")
      ? end.replace(/T00:00:00$/, "T23:59:00.001") : end, zone);
    if (!validFrom || !validUntil || validUntil <= validFrom) {
      throw new Error("Tennessee fiResponse: invalid permit restriction dates");
    }
    const { date } = localClock(now, zone);
    if (validUntil <= checked || start.slice(0, 10) > date) continue;

    rows.push({
      fips: county.fips, county: county.name, state: META.state, sourceId: META.id,
      status: "restricted", scope: META.scope, label: "State burn permits temporarily restricted",
      scopeNote: `Division of Forestry permit area in ${county.name}`,
      note: `The Division of Forestry lists ${reason === FIRE_WEATHER ? "hazardous fire weather" : "poor smoke dispersion"} for this permit restriction.`
        + (division.hasExemption ? " The map shows an exemption." : "")
        + " Check the state map for your location and permit type. Local rules may also apply.",
      checked, sourceUpdated: null, validFrom, validUntil, since: start.slice(0, 10), expires: end?.slice(0, 10) ?? null,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    });
  }
  return rows;
}

function queryFor(now: Date) {
  // The app sends wall times without offsets. Around midnight Tennessee has two local dates.
  const central = localClock(now, US_ZONES.Central).date;
  const eastern = localClock(now, US_ZONES.Eastern).date;
  const query = new URLSearchParams({
    restrictionTypes: PERMIT_RESTRICTION, from: `${central}T00:00:00`, to: `${eastern}T23:59:59`,
  });
  for (const level of PUBLIC_LEVELS) query.append("levels", level);
  return query;
}

export const tnForestryPermitHolds: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "hourly" }, staleMs: 3 * 3_600_000,
  async fetch({ now }) {
    const read = pacedTextReader({ headers: { accept: "application/json" }, maxBytes: 512_000 });
    const query = queryFor(now);
    const divisions = parseTennesseePermitRoster(await read(`${META.sourceUrl}?${query}`));
    if (!divisions.size) return { rows: [] };
    for (const id of [...divisions.keys()].sort()) query.append("ids", id);
    return { rows: parseTennesseePermitHolds(await read(`${API}/byAdminDivisions?${query}`), divisions, now) };
  },
};
