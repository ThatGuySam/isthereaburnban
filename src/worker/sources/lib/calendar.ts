import { localClock, US_ZONES } from "./dates";

// Inventory: NY DEC Open Burning, GA EPD Summer Open Burning Ban, OH DNR Open Burning Regulations,
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

export function activeRule(rule: CalendarRule, now: Date, county?: string) {
  if (rule.counties && (!county || !rule.counties.has(county.replace(/\s+County$/i, "").toLowerCase()))) return undefined;
  const { date, minute } = localClock(now, rule.zone);
  const day = date.slice(5);
  if (rule.seasons && !rule.seasons.some(([start, end]) =>
    start <= end ? day >= start && day <= end : day >= start || day <= end)) return undefined;
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
  OH: {
    state: "OH", zone: US_ZONES.Eastern, status: "restricted", scope: "part", scopeNote: "Unincorporated areas outside railroad-controlled land",
    officialUrl: "https://ohiodnr.gov/discover-and-learn/safety-conservation/about-odnr/forestry/fire-management-program/open-burn-laws",
    label: "Daytime burning restriction in unincorporated areas", seasons: [["03-01", "05-31"], ["10-01", "11-30"]], hours: [360, 1080],
    note: "Ohio restricts most open burning in unincorporated areas from 6 a.m. to 6 p.m. in March–May and October–November. See Ohio law for exceptions.",
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
