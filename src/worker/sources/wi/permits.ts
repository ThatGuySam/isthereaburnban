import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { atLocalTime, localClock, shiftDay, US_ZONES } from "../lib/dates";
import { parseDotNetJsonDate, parseJson } from "../lib/feeds";
import { htmlText } from "../lib/html";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const OFFICIAL_URL = "https://apps.dnr.wi.gov/forestryapps/burnrestriction";
const META = {
  id: "wi-dnr-burn-permits", state: "WI", scope: "part",
  stack: "ASP.NET MVC / JSON", sourceName: "Wisconsin Department of Natural Resources",
  sourceUrl: `${OFFICIAL_URL}/json/`, officialUrl: OFFICIAL_URL,
} as const;
const ZONE = US_ZONES.Central;
const FIRST_CHECK_HOUR = 9;
const DNR_SCOPE = "DNR fire protection areas outside incorporated cities and villages";
const PARTIAL = "Parts of this county are not regulated by the DNR";
const LOCAL_REFERRAL = /^DNR burning permits are not required in this county\. Please contact your fire department\b/i;
const ANNUAL = /^burning is allowed today with a DNR annual burning permit\b/i;
const SUSPENDED = /^(?:(?:due to fire weather conditions, )?burning is not allowed today\b|(?:all )?DNR(?:-issued)? burning permits (?:are|have been) suspended\b)/i;
const SEASONAL = /^A DNR annual burning permit is not required from June 1st to December 31st except when emergency burning restrictions are in effect\./i;
const NORTH_OCONTO = /^For northern Oconto County, including the Townships of Brazeau, Bagley, Breed or any Townships to the north, /i;
const VILAS_SNOW = /^For areas with partial or no snow cover, the restrictions are as follows: /i;

const feed = z.array(z.object({
  COUNTY_NAME: z.string(),
  PART_NOTREG_DNR: z.string().nullable(),
  LAST_UPDATE_DATE: z.string().nullable(),
  PERMIT_RESTRICTIONS: z.string().nullable(),
  ADDITIONAL_COMMENTS: z.string().nullish(),
})).min(1);

function condition(county: string, text: string, day: string): Pick<CountyStatus, "status" | "scopeNote" | "label"> | undefined {
  if (LOCAL_REFERRAL.test(text)) return;
  const north = county === "Oconto" ? NORTH_OCONTO.exec(text)?.[0] : undefined;
  const snow = county === "Vilas" ? VILAS_SNOW.exec(text)?.[0] : undefined;
  const decision = text.slice((north ?? snow)?.length ?? 0);
  const scopeNote = north ? "Northern Oconto County in DNR fire protection areas"
    : snow ? "DNR fire protection areas with partial or no snow cover" : DNR_SCOPE;

  if (SUSPENDED.test(decision)) return { status: "ban", scopeNote, label: "DNR debris burning suspended" };
  if (ANNUAL.test(decision)) return { status: "restricted", scopeNote, label: "DNR debris-burning permit limits" };
  if (SEASONAL.test(text) && day.slice(5) >= "06-01") {
    return { status: "unknown", scopeNote, label: "DNR seasonal permit exception" };
  }
}

export function parseWisconsinPermits(text: string, now: Date): CountyStatus[] {
  const records = parseJson(text, (value): value is z.infer<typeof feed> => feed.safeParse(value).success);
  const { date: day, minute } = localClock(now, ZONE);
  const midnight = atLocalTime(day, 0, ZONE);
  const validUntil = atLocalTime(shiftDay(day, 1), 0, ZONE);
  if (!midnight || !validUntil || minute < FIRST_CHECK_HOUR * 60) {
    throw new Error("Wisconsin DNR: daily permit check starts at 9 a.m. Central");
  }

  const start = Date.parse(midnight);
  const time = now.getTime();
  const checked = now.toISOString();
  const seen = new Set<string>();
  const rows: CountyStatus[] = [];
  let fresh = false;

  for (const { COUNTY_NAME: name, LAST_UPDATE_DATE, PART_NOTREG_DNR, PERMIT_RESTRICTIONS, ADDITIONAL_COMMENTS } of records) {
    const county = countyByName(META.state, name === "Saint Croix" ? "St. Croix" : name);
    if (!county || seen.has(county.fips)) throw new Error("Wisconsin DNR: unknown or repeated county");
    seen.add(county.fips);
    const stamp = parseDotNetJsonDate(LAST_UPDATE_DATE ?? "");
    if (!stamp || stamp.getTime() < start || stamp.getTime() > time) continue;
    fresh = true;
    if (PART_NOTREG_DNR !== "N" && PART_NOTREG_DNR !== PARTIAL) continue;

    const text = htmlText(PERMIT_RESTRICTIONS ?? "");
    const report = condition(name, text, day);
    if (!report) continue;
    const note = [
      report.status === "unknown"
        ? "The DNR's annual permit is generally unnecessary here from June through December unless emergency restrictions are in effect."
        : text,
      PART_NOTREG_DNR === PARTIAL ? `${PARTIAL}.` : "",
      htmlText(ADDITIONAL_COMMENTS ?? ""),
      "Check WisBURN for your location and follow local rules.",
    ].filter(Boolean).join(" ");
    rows.push({
      ...report, fips: county.fips, county: county.name, state: META.state, scope: META.scope, sourceId: META.id,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      checked, sourceUpdated: stamp.toISOString(), since: null, expires: null, validUntil, note,
    });
  }
  if (!fresh) throw new Error("Wisconsin DNR: no county records dated today in Central time");
  return rows;
}

export const wiPermits: ActiveSource = {
  ...META,
  coverage: "restrictions",
  mode: "positive-only",
  cadence: { kind: "daily", zone: ZONE, hours: [FIRST_CHECK_HOUR, 12, 16] },
  async fetch({ now }) {
    const body = await getText(META.sourceUrl, { headers: { accept: "application/json" }, maxBytes: 150_000 });
    return { rows: parseWisconsinPermits(body, now) };
  },
};
