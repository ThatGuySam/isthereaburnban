import type { CountyStatus } from "../../../shared/types";
import { countiesInState, COUNTY_BY_FIPS } from "../../counties";
import { arcgisLocalDate, arcgisRows, arcgisUrl } from "../lib/arcgis";
import { atLocalTime, localClock, shiftDay, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const LAYER = "https://gisp.mcgi.state.mi.us/arcgis/rest/services/DNR/Burn_Permits/MapServer/1";
const META = {
  id: "mi-dnr-burn-permits", state: "MI", stack: "ArcGIS MapServer",
  sourceName: "Michigan Department of Natural Resources",
  sourceUrl: arcgisUrl(LAYER, ["FIPS2", "STATUS", "PullStamp"]),
  officialUrl: "https://www2.dnr.state.mi.us/burnpermits/",
  scope: "county",
} as const;
const COUNTY_COUNT = countiesInState(META.state).length;
const ZONE = US_ZONES.Eastern;
const MAX_MAP_AGE_MS = 2 * 60 * 60 * 1000;
const TOWNSHIP_NOTE = "Use the county dropdown on the DNR map for township rules. Check local ordinances before burning.";

type PermitCondition = Required<Pick<CountyStatus, "scope" | "scopeNote" | "label" | "note">> & {
  status: "restricted" | "unknown";
};
// The ArcGIS renderer's numeric colors match the key on DNR's public permit map.
const CONDITIONS = new Map<number, PermitCondition>([
  [0, {
    status: "restricted", scope: "county", scopeNote: "Open debris burning",
    label: "DNR reports open debris burning is closed", note: TOWNSHIP_NOTE,
  }],
  [1, {
    status: "unknown", scope: "part", scopeNote: "DNR debris-burning permits",
    label: "DNR shows debris-burning permits available",
    note: `The DNR map shows debris-burning permits available with precautions. ${TOWNSHIP_NOTE}`,
  }],
  [2, {
    status: "restricted", scope: "part", scopeNote: "Township debris-burning permits",
    label: "Township debris-burning permits vary by location",
    note: `The DNR map shows permit restrictions or local issuance in at least one township. ${TOWNSHIP_NOTE}`,
  }],
  // Gray (3) refers residents to local issuers and carries no DNR decision.
]);

export function parseMichiganPermits(data: unknown, now: Date): CountyStatus[] {
  const features = arcgisRows(data, { requireComplete: true });
  if (features.length !== COUNTY_COUNT) throw new Error(`Michigan DNR: expected ${COUNTY_COUNT} counties`);

  const stamp = features[0].PullStamp;
  const sourceUpdated = arcgisLocalDate(stamp, ZONE);
  if (!sourceUpdated || features.some(({ PullStamp }) => PullStamp !== stamp)) {
    throw new Error("Michigan DNR: missing or inconsistent map PullStamp");
  }
  const updated = new Date(sourceUpdated);
  const maxValid = updated.getTime() + MAX_MAP_AGE_MS;
  const { date: day } = localClock(now, ZONE);
  const midnight = atLocalTime(shiftDay(day, 1), 0, ZONE);
  if (!midnight || localClock(updated, ZONE).date !== day || updated > now || now.getTime() >= maxValid) {
    throw new Error("Michigan DNR: no current permit map");
  }
  const checked = now.toISOString();
  const validUntil = new Date(Math.min(Date.parse(midnight), maxValid)).toISOString();
  const seen = new Set<string>();
  const rows: CountyStatus[] = [];

  for (const { FIPS2, STATUS } of features) {
    const county = typeof FIPS2 === "string" && /^\d{3}$/.test(FIPS2) ? COUNTY_BY_FIPS.get(`26${FIPS2}`) : undefined;
    if (!county || county.state !== META.state || seen.has(county.fips)) {
      throw new Error("Michigan DNR: invalid or repeated county FIPS");
    }
    seen.add(county.fips);
    const condition = typeof STATUS === "number" ? CONDITIONS.get(STATUS) : undefined;
    if (!condition) continue;
    rows.push({
      ...condition, fips: county.fips, county: county.name, state: META.state, sourceId: META.id,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      checked, sourceUpdated, since: null, expires: null, validUntil,
    });
  }
  return rows;
}

export const miPermits: ActiveSource = {
  ...META,
  coverage: "restrictions",
  mode: "positive-only",
  // The map is refreshed throughout the day and can change between daily permit reviews.
  cadence: { kind: "hourly" },
  staleMs: MAX_MAP_AGE_MS,
  async fetch({ now }) {
    // Recheck the mapped day and PullStamp on every poll.
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "application/json" }, maxBytes: 100_000 });
    if (reply.notModified) throw new Error("Unexpected Michigan DNR 304");
    return { rows: parseMichiganPermits(await reply.response.json(), now) };
  },
};
