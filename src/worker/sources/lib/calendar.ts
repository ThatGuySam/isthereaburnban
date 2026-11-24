import { atLocalTime, localClock, localDayWindow, shiftDay, US_ZONES } from "./dates";

// Inventory: AZ Area A, NY DEC Open Burning, GA EPD Summer Open Burning Ban, KY fire hazard seasons, OH DNR Open Burning Regulations,
// VA DOF 4 PM Burning Law, WV Forestry Fire Burning Guidelines, and MD DNR Burning Guidance.
export type CalendarRule = {
  state: string;
  officialUrl: string;
  label: string;
  note: string;
  status: "restricted" | "ban";
  scope: "state" | "county" | "part";
  scopeNote: string;
  zone: string;
  seasons?: readonly (readonly [start: string, end: string])[]; // inclusive MM-DD
  hours?: readonly [start: number, end: number]; // local minutes, end exclusive
  counties?: ReadonlySet<string>; // publisher county names without "County"
};

function inSeason(rule: CalendarRule, date: string): boolean {
  const day = date.slice(5);
  return !rule.seasons || rule.seasons.some(([start, end]) =>
    start <= end ? day >= start && day <= end : day >= start || day <= end);
}

/** UTC validity windows within the rule's current local date. Geography is applied by the caller. */
export function calendarDayWindows(rule: CalendarRule, now: Date) {
  const { date } = localClock(now, rule.zone);
  if (!inSeason(rule, date)) return [];
  if (!rule.hours) return [localDayWindow(date, rule.zone)];
  const [start, end] = rule.hours;
  const periods: [number, number][] = start <= end ? [[start, end]] : [[0, end], [start, 1440]];
  const instant = (minute: number) => minute === 1440
    ? atLocalTime(shiftDay(date, 1), 0, rule.zone)
    : atLocalTime(date, minute, rule.zone);
  return periods.filter(([from, until]) => from < until).map(([from, until]) => {
    const validFrom = instant(from);
    const validUntil = instant(until);
    if (!validFrom || !validUntil || validFrom >= validUntil) throw new Error(`${rule.state}: invalid calendar window for ${date}`);
    return { validFrom, validUntil };
  });
}

export function activeRule(rule: CalendarRule, now: Date, county?: string) {
  if (rule.counties && (!county || !rule.counties.has(county.replace(/\s+County$/i, "").toLowerCase()))) return undefined;
  const { date, minute } = localClock(now, rule.zone);
  if (!inSeason(rule, date)) return undefined;
  if (rule.hours) {
    const [start, end] = rule.hours;
    if (!(start <= end ? minute >= start && minute < end : minute >= start || minute < end)) return undefined;
  }
  return { status: rule.status, label: rule.label, note: rule.note, scope: rule.scope, scopeNote: rule.scopeNote, officialUrl: rule.officialUrl };
}

const GA_COUNTIES = new Set((
  "Carroll,Clayton,Coweta,DeKalb,Douglas,Fayette,Fulton,Gwinnett,Heard,Henry,Rockdale,Spalding," +
  "Banks,Barrow,Butts,Clarke,Hall,Jackson,Jasper,Madison,Morgan,Newton,Oconee,Putnam,Walton," +
  "Columbia,Richmond,Bibb,Crawford,Houston,Jones,Lamar,Monroe,Peach,Pike,Twiggs,Upson,Meriwether,Troup," +
  "Bartow,Catoosa,Chattooga,Cherokee,Cobb,Dawson,Floyd,Forsyth,Gordon,Haralson,Lumpkin,Paulding,Pickens,Polk,Walker"
).toLowerCase().split(","));

export const CALENDAR_RULES: Record<string, CalendarRule> = {
  AZ: {
    state: "AZ", zone: US_ZONES.Arizona, status: "restricted", scope: "part",
    scopeNote: "Area A within the county, as defined in A.R.S. § 49-541",
    officialUrl: "https://www.azleg.gov/ars/49/00501.htm",
    label: "Area A summer open-burning restriction", seasons: [["05-01", "09-30"]],
    counties: new Set(["maricopa", "pinal", "yavapai"]),
    note: "Arizona limits open outdoor fires in Area A from May 1 through September 30. The law lists exceptions, including cooking, and local air quality rules may impose stricter limits.",
  },
  NY: {
    state: "NY", zone: US_ZONES.Eastern, status: "restricted", scope: "state", scopeNote: "Statewide brush-burning rule",
    officialUrl: "https://dec.ny.gov/environmental-protection/air-quality/open-burning",
    label: "Spring brush-burning ban", seasons: [["03-16", "05-14"]],
    note: "March 16 through May 14, New York prohibits burning brush. See DEC for agricultural and other exceptions and check local rules.",
  },
  GA: {
    state: "GA", zone: US_ZONES.Eastern, status: "restricted", scope: "county", scopeNote: "Georgia EPD's 54 covered counties",
    officialUrl: "https://epd.georgia.gov/air-protection-branch/open-burning-rules-georgia/summer-open-burning-ban",
    label: "Summer yard and land-clearing debris ban", seasons: [["05-01", "09-30"]], counties: GA_COUNTIES,
    note: "May 1 through September 30, Georgia EPD prohibits burning yard and land-clearing debris here. Check the rule for activity-specific exceptions.",
  },
  KY: {
    state: "KY", zone: US_ZONES.Eastern, status: "restricted", scope: "part",
    scopeNote: "In or within 150 feet of woodland or brushland",
    officialUrl: "https://eec.ky.gov/natural-resources/forestry/wildland-fire-management/pages/outdoor-burning-laws.aspx",
    label: "Seasonal daytime burning restriction", seasons: [["02-15", "04-30"], ["10-01", "12-15"]], hours: [360, 1080],
    note: "Kentucky limits burning materials that can spread fire from 6 a.m. to 6 p.m. local time during February 15 through April 30 and October 1 through December 15. The law makes exceptions for snow-covered ground and certain activities. Check local orders and air-quality rules before burning.",
  },
  OH: {
    state: "OH", zone: US_ZONES.Eastern, status: "restricted", scope: "part", scopeNote: "Unincorporated areas outside railroad-controlled land",
    officialUrl: "https://codes.ohio.gov/ohio-revised-code/section-1503.18",
    label: "Seasonal daytime burning restriction", seasons: [["03-01", "05-31"], ["10-01", "11-30"]], hours: [360, 1080],
    note: "The rule covers outdoor burning of wood, brush, weeds, grass or rubbish from 6 a.m. to 6 p.m. Eastern in March–May and October–November. Ohio law excepts fires in plowed fields, gardens or on public roads at least 200 feet from woods, brush or fields with dry grass or other flammable material. Check with your local fire department about other rules.",
  },
  VA: {
    state: "VA", zone: US_ZONES.Eastern, status: "restricted", scope: "part", scopeNote: "Within 300 feet of woods or vegetation that could carry fire to woods",
    officialUrl: "https://www.dof.virginia.gov/wildland-prescribed-fire/fire-laws/4-pm-burning-law/",
    label: "Virginia 4 p.m. burning restriction", seasons: [["02-15", "04-30"]], hours: [0, 960],
    note: "February 15 through April 30, Virginia restricts open-air burning before 4 p.m. near woods or dry vegetation that could carry fire to woods. Exceptions and local rules apply.",
  },
  WV: {
    state: "WV", zone: US_ZONES.Eastern, status: "restricted", scope: "state", scopeNote: "West Virginia fire seasons",
    officialUrl: "https://wvforestry.com/fire-laws/",
    label: "Daytime fire-season burning restriction", seasons: [["03-01", "05-31"], ["10-01", "12-31"]], hours: [420, 1020],
    note: "West Virginia restricts outdoor burning from 7 a.m. to 5 p.m. during March–May and October–December. See the state rules for small fires, snow cover and commercial permits.",
  },
  MD: {
    state: "MD", zone: US_ZONES.Eastern, status: "restricted", scope: "part", scopeNote: "Woodland and areas within 200 feet, outside incorporated towns",
    officialUrl: "https://dnr.maryland.gov/forests/Pages/fire/prevention-burning-guidance.aspx",
    label: "Maryland woodland open-air burning limits",
    note: "Maryland limits open-air burning in or near woodland outside incorporated towns to 4 p.m.–midnight and requires a firebreak, equipment and attendance. Small recreational fires are exempt. Snow cover may change the hours.",
  },
};
