import type { CountyStatus } from "../../../shared/types";
import { COUNTY_BY_FIPS } from "../../counties";
import { parseAirNowReportingAreas } from "../lib/airnow";
import { localClock, localDayWindow, shiftDay, US_ZONES } from "../lib/dates";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const META = {
  id: "de-dnrec-action-days", state: "DE", scope: "part",
  stack: "EPA AirNow / delimited reporting-area forecasts",
  sourceName: "Delaware DNREC via EPA AirNow",
  sourceUrl: "https://files.airnowtech.org/airnow/today/reportingarea.dat",
  officialUrl: "https://dnrec.delaware.gov/air/quality/forecast/",
} as const;
const PUBLISHER = "Delaware Dept. of Natural Resources and Environment";
const AREA_COUNTIES = new Map([
  ["Greater New Castle County", "10003"],
  ["Wilmington Area", "10003"],
  ["Kent County", "10001"],
  ["Sussex County", "10005"],
]);
const ACTION_LEVELS = new Map([
  ["Unhealthy for Sensitive Groups", "Code Orange"],
  ["Unhealthy", "Code Red"],
  ["Very Unhealthy", "Code Purple"],
  ["Hazardous", "Code Maroon"],
]);
const ZONE = US_ZONES.Eastern;

export function parseDeActionDays(text: string, now: Date): CountyStatus[] {
  const { date: today } = localClock(now, ZONE);
  const checked = now.toISOString();
  const yesterday = shiftDay(today, -1);
  const tomorrow = shiftDay(today, 1);
  const records = parseAirNowReportingAreas(text, META.state)
    .filter(({ publisher, issued }) => publisher === PUBLISHER && issued >= yesterday && issued <= today);
  if (!records.length) throw new Error("AirNow has no recent Delaware DNREC records");

  const forecasts = new Map<string, { issued: string; rows: CountyStatus[] }>();
  for (const { issued, date, kind, area, category, actionDay } of records) {
    const fips = AREA_COUNTIES.get(area);
    if (!fips || kind !== "F" || (date !== today && date !== tomorrow) || (date === tomorrow && issued < today)) continue;
    const county = COUNTY_BY_FIPS.get(fips);
    if (!county) throw new Error(`Unknown Delaware county for AirNow reporting area: ${area}`);
    const key = `${area}|${date}`;
    let forecast = forecasts.get(key);
    if (!forecast || issued > forecast.issued) {
      forecast = { issued, rows: [] };
      forecasts.set(key, forecast);
    }
    if (issued < forecast.issued || !actionDay) continue;
    const level = ACTION_LEVELS.get(category);
    if (!level) throw new Error(`AirNow action day has an unrecognized Delaware category: ${category}`);
    const label = `${level} Air Quality Action Day`;
    if (forecast.rows.some((row) => row.label === label)) continue;
    forecast.rows.push({
      ...localDayWindow(date, ZONE),
      fips, county: county.name, state: META.state, sourceId: META.id,
      status: "ban", scope: META.scope, scopeNote: `AirNow reporting area: ${area}`,
      label, note: "DNREC prohibits all open burning in the affected area on an Air Quality Action Day, including previously approved burns.",
      checked, sourceUpdated: issued, since: date, expires: date,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    });
  }
  return [...forecasts.values()].flatMap(({ rows }) => rows);
}

export const deActionDays: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: ZONE, hours: [0, 8, 14, 17, 20] },
  staleMs: 18 * 3_600_000,
  async fetch({ now }) {
    const text = await getText(META.sourceUrl, {
      headers: { accept: "text/plain, application/octet-stream" }, maxBytes: 4_000_000,
      maxResponseAgeMs: 60 * 60 * 1000,
    });
    return { rows: parseDeActionDays(text, now) };
  },
};
