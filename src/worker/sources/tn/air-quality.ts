import type { CountyStatus } from "../../../shared/types";
import { parseAirNowReportingAreas } from "../lib/airnow";
import { localClock, localDayWindow, shiftDay, US_ZONES } from "../lib/dates";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const META = {
  id: "tn-air-quality-permit-holds", state: "TN", scope: "part",
  stack: "EPA AirNow / delimited reporting-area forecasts",
  sourceName: "AirNow forecasts for Memphis and Knoxville",
  sourceUrl: "https://files.airnowtech.org/airnow/today/reportingarea.dat",
  officialUrl: "https://www.airnow.gov/",
} as const;

const AREAS = [
  {
    area: "Memphis", publisher: "Shelby County Health Department", zone: US_ZONES.Central,
    fips: "47157", county: "Shelby County", scopeNote: "Permitted open burning in Shelby County",
    officialUrl: "https://www.shelbytnhealth.com/176/Open-Burning-Land-Clearing-Contractors",
  },
  {
    area: "Knoxville", publisher: "Tennessee Air Pollution Control Div.", zone: US_ZONES.Eastern,
    fips: "47093", county: "Knox County", scopeNote: "Permitted open burning in Knox County",
    officialUrl: "https://www.knoxcounty.org/airquality/open_burning.php",
  },
] as const;
const CATEGORIES = [
  "Good", "Moderate", "Unhealthy for Sensitive Groups", "Unhealthy", "Very Unhealthy", "Hazardous",
];
const CODES = ["", "", "Code Orange", "Code Red", "Code Purple", "Code Maroon"];

export function parseTennesseeAirQuality(text: string, now: Date): CountyStatus[] {
  const records = parseAirNowReportingAreas(text, META.state);
  if (!records.length) throw new Error("AirNow has no Tennessee reporting areas");
  const checked = now.toISOString();
  return AREAS.flatMap(({ area, publisher, zone, fips, county, scopeNote, officialUrl }) => {
    const { date: today } = localClock(now, zone);
    const yesterday = shiftDay(today, -1);
    const tomorrow = shiftDay(today, 1);
    const forecasts = new Map<string, { issued: string; worst: number; actionDay: boolean }>();
    for (const { area: name, publisher: agency, issued, date, kind, category, actionDay } of records) {
      if (name !== area || agency !== publisher || kind !== "F" || issued < yesterday || issued > today) continue;
      if (date !== today && (date !== tomorrow || issued !== today)) continue;
      const previous = forecasts.get(date);
      if (previous && issued < previous.issued) continue;
      const level = CATEGORIES.indexOf(category);
      if (level < 0) throw new Error(`AirNow: unexpected forecast category for ${area}`);
      const sameIssue = previous?.issued === issued;
      forecasts.set(date, {
        issued, worst: Math.max(level, sameIssue ? previous.worst : 0),
        actionDay: actionDay || (sameIssue && previous.actionDay),
      });
    }
    const rows: CountyStatus[] = [];
    for (const [date, { issued, worst, actionDay }] of forecasts) {
      const code = CODES[worst];
      if (area === "Memphis" ? !code : !actionDay) continue;
      const label = area === "Memphis" ? `${code} forecast suspends permitted burning` : "Air Pollution Action Day suspends permitted burning";
      const note = area === "Memphis"
        ? "Shelby County Health Department suspends permitted open burning when the Memphis/Shelby forecast reaches Code Orange or higher."
        : "Knox County Air Quality Management invalidates open-burning permits on Air Pollution Action Days.";
      rows.push({
        ...localDayWindow(date, zone), checked, sourceUpdated: issued, since: date, expires: date,
        state: META.state, fips, county, scope: META.scope, status: "restricted", scopeNote, label, note,
        sourceId: META.id, sourceName: `${publisher} via EPA AirNow`, sourceUrl: META.sourceUrl, officialUrl,
      });
    }
    return rows;
  });
}

export const tnAirQualityPermitHolds: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", keepRowLinks: true,
  cadence: { kind: "daily", zone: US_ZONES.Central, hours: [0, 7, 12, 16, 19] },
  staleMs: 18 * 3_600_000,
  async fetch({ now }) {
    const body = await getText(META.sourceUrl, {
      headers: { accept: "text/plain, application/octet-stream" }, maxBytes: 4_000_000, maxResponseAgeMs: 3_600_000,
    });
    return { rows: parseTennesseeAirQuality(body, now) };
  },
};
