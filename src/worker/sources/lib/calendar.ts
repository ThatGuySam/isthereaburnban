import type { CountyStatus } from "../../../shared/types";
import { atLocalTime, localClock, localDayWindow, shiftDay, US_ZONES } from "./dates";

// Inventory: Alaska burn permits and winter air rules, AZ Area A, Idaho and Utah closed fire seasons, NY DEC Open Burning, GA EPD Summer Open Burning Ban, KY fire hazard seasons, OH DNR Open Burning Regulations,
// PA state forest fires, VA DOF 4 PM Burning Law, WV Forestry Fire Burning Guidelines, and MD DNR Burning Guidance.
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
  hoursByDay?: Readonly<Record<string, readonly [start: number, end: number]>>; // MM-DD override
  counties?: ReadonlySet<string>; // publisher county names without "County"
};

function inSeason(rule: CalendarRule, date: string): boolean {
  const day = date.slice(5);
  return !rule.seasons || rule.seasons.some(([start, end]) =>
    start <= end ? day >= start && day <= end : day >= start || day <= end);
}

function hoursOn(rule: CalendarRule, date: string) {
  return rule.hoursByDay?.[date.slice(5)] ?? rule.hours;
}

/** UTC validity windows within the rule's current local date. Geography is applied by the caller. */
export function calendarDayWindows(rule: CalendarRule, now: Date) {
  return windowsOn(rule, localClock(now, rule.zone).date);
}

function windowsOn(rule: CalendarRule, date: string) {
  if (!inSeason(rule, date)) return [];
  const hours = hoursOn(rule, date);
  if (!hours) return [localDayWindow(date, rule.zone)];
  const [start, end] = hours;
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

type CalendarPublisher = Pick<CountyStatus, "sourceName" | "sourceUrl"> & { id: string };

/** Emit effective windows for the mapped counties, optionally covering the next local day. */
export function calendarStatusRows(
  rule: CalendarRule,
  counties: ReadonlyArray<{ fips: string; name: string; scopeNote?: string }>,
  publisher: CalendarPublisher,
  now: Date,
  { includeTomorrow = false } = {},
): CountyStatus[] {
  const checked = now.toISOString();
  const covered = rule.counties ? counties.filter(({ name }) => ruleCoversCounty(rule, name)) : counties;
  const { state, status, label, note, scope, scopeNote, officialUrl } = rule;
  const { id: sourceId, sourceName, sourceUrl } = publisher;
  const { date } = localClock(now, rule.zone);
  const dates = includeTomorrow ? [date, shiftDay(date, 1)] : [date];
  const windows: ReturnType<typeof windowsOn> = [];
  for (const window of dates.flatMap((day) => windowsOn(rule, day))) {
    const previous = windows.at(-1);
    if (previous?.validUntil === window.validFrom) previous.validUntil = window.validUntil;
    else if (window.validUntil > checked) windows.push(window);
  }
  return windows.flatMap((window) => covered.map(({ fips, name, scopeNote: localScope }) => ({
    ...window, fips, county: name, state, status, label, note, scope, scopeNote: localScope ?? scopeNote,
    sourceId, sourceName, sourceUrl, officialUrl, checked, sourceUpdated: null, since: null, expires: null,
  })));
}

function ruleCoversCounty(rule: CalendarRule, county?: string) {
  return !rule.counties || (county !== undefined && rule.counties.has(county.replace(/\s+County$/i, "").toLowerCase()));
}

export function activeRule(rule: CalendarRule, now: Date, county?: string) {
  if (!ruleCoversCounty(rule, county)) return undefined;
  const { date, minute } = localClock(now, rule.zone);
  if (!inSeason(rule, date)) return undefined;
  const hours = hoursOn(rule, date);
  if (hours) {
    const [start, end] = hours;
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
  AK: {
    state: "AK", zone: US_ZONES.Alaska, status: "restricted", scope: "part",
    scopeNote: "Outdoor burning covered by Alaska’s state fire-season permit rule",
    officialUrl: "https://dnr.alaska.gov/burn/index",
    label: "Fire-season burn permits required", seasons: [["04-01", "08-31"]],
    note: "Alaska generally requires a permit for outdoor burning from April 1 through August 31. Certain small campfires and approved burning devices are exempt. Check your local permit issuer and land manager. The state can extend the permit season.",
  },
  AK_WINTER: {
    state: "AK", zone: US_ZONES.Alaska, status: "ban", scope: "part",
    scopeNote: "Designated wood smoke control or PM2.5 nonattainment area",
    officialUrl: "https://dec.alaska.gov/air/burnwise/open-burn-prohibition",
    label: "Winter open-burning prohibition", seasons: [["11-01", "03-31"]],
    note: "Alaska DEC prohibits open burning in this designated area from November 1 through March 31. Check DEC’s boundary maps and any separate local rules or air-quality alerts.",
  },
  AZ: {
    state: "AZ", zone: US_ZONES.Arizona, status: "restricted", scope: "part",
    scopeNote: "Area A within the county, as defined in A.R.S. § 49-541",
    officialUrl: "https://www.azleg.gov/ars/49/00501.htm",
    label: "Area A summer open-burning restriction", seasons: [["05-01", "09-30"]],
    counties: new Set(["maricopa", "pinal", "yavapai"]),
    note: "Arizona limits open outdoor fires in Area A from May 1 through September 30. The law lists exceptions, including cooking, and local air quality rules may impose stricter limits.",
  },
  NY: {
    state: "NY", zone: US_ZONES.Eastern, status: "restricted", scope: "state", scopeNote: "Statewide residential brush-burning rule",
    officialUrl: "https://dec.ny.gov/environmental-protection/air-quality/open-burning",
    label: "Spring brush-burning ban", seasons: [["03-16", "05-14"]],
    note: "New York prohibits residential brush burning from March 16 through May 14. DEC lists separate rules for small campfires, cooking fires, agricultural burning and prescribed burns. Check local rules before burning.",
  },
  NY_FIRE_TOWNS: {
    state: "NY", zone: US_ZONES.Eastern, status: "restricted", scope: "part", scopeNote: "DEC-designated Fire Towns",
    officialUrl: "https://dec.ny.gov/environmental-protection/air-quality/open-burning#Adirondack",
    label: "DEC brush-burning permit required", seasons: [["05-15", "03-15"]],
    note: "In designated Fire Towns, get a written DEC permit before burning eligible brush. The state brush-burning exception applies on-site in towns under 20,000 outside incorporated villages and has size limits. Check DEC and your local fire department.",
  },
  NY_NYC_BARBECUES: {
    state: "NY", zone: US_ZONES.Eastern, status: "restricted", scope: "part", scopeNote: "New York City outdoor barbecuing",
    officialUrl: "https://portal.311.nyc.gov/article/?kanumber=KA-02228",
    label: "Outdoor barbecue limits",
    note: "NYC allows barbecuing only in designated areas of certain city parks. Residential barbecues have Fire Code limits on fuel, location and clearance. Check NYC 311 for the rules at your location.",
  },
  GA: {
    state: "GA", zone: US_ZONES.Eastern, status: "restricted", scope: "county", scopeNote: "Georgia EPD's 54 covered counties",
    officialUrl: "https://epd.georgia.gov/air-protection-branch/open-burning-rules-georgia/summer-open-burning-ban",
    label: "Summer yard and land-clearing debris ban", seasons: [["05-01", "09-30"]], counties: GA_COUNTIES,
    note: "May 1 through September 30, Georgia EPD prohibits burning yard and land-clearing debris here. Check the rule for activity-specific exceptions.",
  },
  ID: {
    state: "ID", zone: US_ZONES.Mountain, status: "restricted", scope: "part",
    scopeNote: "Burning covered by Idaho's fire-safety permit rule outside city limits",
    officialUrl: "https://legislature.idaho.gov/statutesrules/idstat/Title38/T38CH1/SECT38-115/",
    label: "Closed fire season permit requirement", seasons: [["05-10", "10-20"]],
    note: "Idaho generally requires a fire-safety permit for outdoor burning outside city limits from May 10 through October 20. Campfires are generally exempt from the permit requirement. Districts can extend the season or suspend permits and campfires. Check local and air-quality rules as well.",
  },
  KY: {
    state: "KY", zone: US_ZONES.Eastern, status: "restricted", scope: "part",
    scopeNote: "In or within 150 feet of woodland or brushland",
    officialUrl: "https://eec.ky.gov/natural-resources/forestry/wildland-fire-management/pages/outdoor-burning-laws.aspx",
    label: "Seasonal daytime burning restriction", seasons: [["02-15", "04-30"], ["10-01", "12-15"]], hours: [360, 1080],
    note: "Kentucky limits burning materials that can spread fire from 6 a.m. to 6 p.m. local time during February 15 through April 30 and October 1 through December 15. The law makes exceptions for snow-covered ground and certain activities. Check local orders and air-quality rules before burning.",
  },
  NC_HIGH_HAZARD: {
    state: "NC", zone: US_ZONES.Eastern, status: "restricted", scope: "part",
    officialUrl: "https://www.ncagr.gov/divisions/nc-forest-service/open-burning-permits",
    scopeNote: "Open burning in or within 500 feet of woodland protected by the N.C. Forest Service",
    label: "Woodland burn permit required all day",
    note: "In high-hazard counties, North Carolina requires a permit for covered fires in or within 500 feet of protected woodland at any hour. Separate rules apply to large land-clearing burns. Check the Forest Service for exemptions and your fire marshal for local orders.",
  },
  NC_WOODLAND: {
    state: "NC", zone: US_ZONES.Eastern, status: "restricted", scope: "part",
    officialUrl: "https://www.ncagr.gov/divisions/nc-forest-service/open-burning-permits",
    scopeNote: "Open burning in or within 500 feet of woodland protected by the N.C. Forest Service",
    label: "Woodland burn permit required before 4 p.m.", hours: [0, 16 * 60],
    note: "North Carolina requires a permit to start covered fires in or within 500 feet of protected woodland from midnight to 4 p.m. Eastern. Check the Forest Service for exemptions and your fire marshal for local orders.",
  },
  NC_HIGH_HAZARD_CLEARING: {
    state: "NC", zone: US_ZONES.Eastern, status: "restricted", scope: "part",
    officialUrl: "https://www.ncagr.gov/divisions/nc-forest-service/open-burning-permits",
    scopeNote: "Land-clearing burns requiring a special permit in a high-hazard county",
    label: "Special-permit land-clearing burn hours", hours: [16 * 60, 8 * 60],
    note: "In high-hazard counties, covered land-clearing burns that require a special permit may start or take more fuel from 8 a.m. to 4 p.m. Eastern. A forest ranger can approve a written exception when weather conditions are favorable.",
  },
  NC_AIR_BURN_HOURS: {
    state: "NC", zone: US_ZONES.Eastern, status: "restricted", scope: "part",
    officialUrl: "https://www.deq.nc.gov/about/divisions/air-quality/air-quality-compliance/open-burning",
    scopeNote: "Residential yard waste and land-clearing or right-of-way burning covered by the state air-quality rule",
    label: "Air-quality open-burning hours", hours: [18 * 60, 8 * 60],
    note: "State air-quality rules limit when covered land-clearing and right-of-way burns can start and when those fires and residential yard-waste fires can take more fuel. Check the rule for the conditions on each activity and any Air Quality Action Day for your county.",
  },
  MT_MISSOULA_GENERAL: {
    state: "MT", zone: US_ZONES.Mountain, status: "restricted", scope: "part",
    officialUrl: "https://www.missoulacounty.gov/9652", counties: new Set(["missoula"]),
    scopeNote: "General outdoor burning under Missoula County’s permit program",
    label: "General outdoor burning season closed", seasons: [["09-01", "02-29"]],
    note: "Missoula Public Health’s regular season for burning yard debris and untreated vegetation generated on site is March 1 through August 31. The county lists separate permits and seasons for other activities.",
  },
  MT_MISSOULA_AGRICULTURE: {
    state: "MT", zone: US_ZONES.Mountain, status: "restricted", scope: "part",
    officialUrl: "https://www.missoulacounty.gov/9652", counties: new Set(["missoula"]),
    scopeNote: "Essential agricultural burning under Missoula County’s permit program",
    label: "Essential agricultural burning season closed", seasons: [["11-01", "02-29"]],
    note: "Missoula Public Health’s regular essential agricultural burning season is March 1 through October 31. Check the permit system for daily decisions for other types of burning.",
  },
  OH: {
    state: "OH", zone: US_ZONES.Eastern, status: "restricted", scope: "part", scopeNote: "Unincorporated areas outside railroad-controlled land",
    officialUrl: "https://codes.ohio.gov/ohio-revised-code/section-1503.18",
    label: "Seasonal daytime burning restriction", seasons: [["03-01", "05-31"], ["10-01", "11-30"]], hours: [360, 1080],
    note: "The rule covers outdoor burning of wood, brush, weeds, grass or rubbish from 6 a.m. to 6 p.m. Eastern in March–May and October–November. Ohio law excepts fires in plowed fields, gardens or on public roads at least 200 feet from woods, brush or fields with dry grass or other flammable material. Check with your local fire department about other rules.",
  },
  TN: {
    state: "TN", zone: US_ZONES.Central, status: "restricted", scope: "part",
    officialUrl: "https://www.tn.gov/tnwildlandfire/prevention/safe-debris-burning/permits.html",
    scopeNote: "Debris and prescribed fires near forests, grasslands or woodlands where the state permit program applies",
    label: "Seasonal burn permit required",
    seasons: [["10-15", "05-15"]], hoursByDay: { "10-15": [8 * 60, 1440] },
    note: "Tennessee generally requires a Division of Forestry permit for covered fires within 500 feet of a forest, grassland or woodland from 8 a.m. local time on October 15 through May 15. Local burning ordinances and permit programs may apply.",
  },
  MO_ST_LOUIS_YARD_WASTE_CLOSED: {
    state: "MO", zone: US_ZONES.Central, status: "restricted", scope: "part",
    officialUrl: "https://www.epa.gov/sites/default/files/2017-09/documents/10-6045.pdf",
    scopeNote: "Yard-waste burning in the St. Louis metro area",
    label: "Yard-waste burning season closed", seasons: [["04-15", "09-15"]],
    note: "The EPA-approved Missouri air-quality rule closes the yard-waste burning season April 15 through September 15 in the St. Louis metro area. Separate rules apply to activities such as recreational fires and agricultural burning.",
  },
  MO_ST_LOUIS_YARD_WASTE_LIMITED: {
    state: "MO", zone: US_ZONES.Central, status: "restricted", scope: "part",
    officialUrl: "https://www.epa.gov/sites/default/files/2017-09/documents/10-6045.pdf",
    scopeNote: "Yard-waste burning in the St. Louis metro area",
    label: "Yard-waste burning limits", seasons: [["09-16", "04-14"]],
    note: "From September 16 through April 14, the EPA-approved Missouri air-quality rule limits yard-waste burning to unincorporated areas, from 10 a.m. to 4 p.m. Central, with a maximum total base area of 16 square feet. Check local rules for your address.",
  },
  PA: {
    state: "PA", zone: US_ZONES.Eastern, status: "restricted", scope: "part",
    scopeNote: "Fire rings and fireplaces on state forest lands within the county",
    officialUrl: "https://www.pacodeandbulletin.gov/secure/pacode/data/017/chapter21/s21.118.html",
    label: "Spring state forest fire restriction", seasons: [["03-01", "05-25"]],
    note: "From March 1 through May 25, fires in rings and fireplaces on Pennsylvania state forest land require permission from DCNR. Check with the district forester about permission and fire danger.",
  },
  SC_LAND_CLEARING: {
    state: "SC", zone: US_ZONES.Eastern, status: "restricted", scope: "part",
    officialUrl: "https://des.sc.gov/programs/bureau-air-quality/air-pollutants/open-burning",
    scopeNote: "Land clearing and right-of-way maintenance outside predominantly residential areas",
    label: "Land-clearing burn hours",
    hours: [15 * 60, 9 * 60],
    note: "South Carolina Regulation 61-62.2 I.E limits when covered land-clearing and right-of-way burns can start and take more fuel to 9 a.m.–3 p.m. Eastern. Other requirements include setbacks, wind direction, eligible material and pile limits.",
  },
  SC_CONSTRUCTION_SEASON: {
    state: "SC", zone: US_ZONES.Eastern, status: "restricted", scope: "part",
    officialUrl: "https://des.sc.gov/programs/bureau-air-quality/air-pollutants/open-burning",
    scopeNote: "On-site waste from construction of one- and two-family homes",
    label: "Ozone-season construction burning restriction",
    seasons: [["04-01", "10-30"]],
    note: "South Carolina Regulation 61-62.2 I.G excludes April 1 through October 30 from the on-site residential construction waste burning exception. Check state and local rules for your site.",
  },
  SC_CONSTRUCTION_HOURS: {
    state: "SC", zone: US_ZONES.Eastern, status: "restricted", scope: "part",
    officialUrl: "https://des.sc.gov/programs/bureau-air-quality/air-pollutants/open-burning",
    scopeNote: "On-site waste from construction of one- and two-family homes",
    label: "Residential construction burn hours",
    seasons: [["10-31", "03-31"]], hours: [15 * 60, 9 * 60],
    note: "Outside ozone season, South Carolina Regulation 61-62.2 I.G limits covered on-site residential construction waste burns to 9 a.m.–3 p.m. Eastern. Setbacks and material restrictions also apply.",
  },
  UT: {
    state: "UT", zone: US_ZONES.Mountain, status: "restricted", scope: "part",
    scopeNote: "Forest, brush, range, field, cultivated-land and debris-pile burning covered by Utah law",
    officialUrl: "https://le.utah.gov/xcode/Title65A/Chapter8/65A-8-S211.html",
    label: "Closed fire season permit requirement", seasons: [["06-01", "10-31"]],
    note: "June 1 through October 31, Utah requires a written permit and advance notification for covered burning. The state forester may change the season. Check the statute for exemptions and ask the local fire authority about permits, air-quality rules and Red Flag Warning rules.",
  },
  VA: {
    state: "VA", zone: US_ZONES.Eastern, status: "restricted", scope: "part",
    scopeNote: "Covered fires in or within 300 feet of woodland, brushland or fields with dry or flammable vegetation in areas organized for forest fire control",
    officialUrl: "https://law.lis.virginia.gov/vacode/title10.1/chapter11/section10.1-1142/",
    label: "Virginia 4 p.m. burning restriction", seasons: [["02-15", "04-30"]], hours: [0, 16 * 60],
    note: "From February 15 through April 30, Virginia prohibits starting covered fires between midnight and 4 p.m. Eastern. The law exempts federal lands, orchard and vineyard frost protection, and certain approved prescribed burns. Check local rules as well.",
  },
  WV: {
    state: "WV", zone: US_ZONES.Eastern, status: "restricted", scope: "state",
    scopeNote: "Covered outdoor burning during West Virginia's statewide forest fire seasons",
    officialUrl: "https://wvforestry.com/fire-laws/",
    label: "Daytime fire-season burning restriction", seasons: [["03-01", "05-31"], ["10-01", "12-31"]], hours: [420, 1020],
    note: "From March 1 through May 31 and October 1 through December 31, West Virginia restricts covered outdoor burning from 7 a.m. to 5 p.m. Eastern. Fires must be out by 7 a.m. The law has exceptions for certain small attended fires, snow cover of at least one inch and approved permits. Check for emergency orders and local rules before burning.",
  },
  WY_STATE_LANDS: {
    state: "WY", zone: US_ZONES.Mountain, status: "restricted", scope: "part",
    scopeNote: "Wyoming state trust lands",
    officialUrl: "https://lands.wyo.gov/resources/recreation",
    label: "Year-round state trust land fire restriction",
    note: "Wyoming limits open fires, campfires and charcoal grills on state trust lands year-round. W.S. § 36-2-107 allows exceptions for areas designated by the Board of Land Commissioners and activities authorized by a valid board lease, authorization or permit.",
  },
  MD: {
    state: "MD", zone: US_ZONES.Eastern, status: "restricted", scope: "part", scopeNote: "Woodland and areas within 200 feet, outside incorporated towns",
    officialUrl: "https://dnr.maryland.gov/forests/Pages/fire/prevention-burning-guidance.aspx",
    label: "Maryland woodland open-air burning limits",
    note: "Maryland limits open-air burning in or near woodland outside incorporated towns to 4 p.m.–midnight and requires a firebreak, equipment and attendance. Small recreational fires are exempt. Snow cover may change the hours.",
  },
};
