import { countyByName } from "../../counties";
import { arcgisRows, arcgisUrl } from "../lib/arcgis";
import { calendarStatusRows, type CalendarRule } from "../lib/calendar";
import { US_ZONES } from "../lib/dates";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const layer = "https://services.arcgis.com/uUvqNMGPm7axC2dD/arcgis/rest/services/Domestic_v5/FeatureServer/0";
const officialUrl = "https://geo.maps.arcgis.com/apps/instant/sidebar/index.html?appid=3a5d78bab88f438a8697f0acf737f633";
const zone = US_ZONES.Pacific;
const meta = {
  id: "or-deq-county-domestic-rules", state: "OR", stack: "ArcGIS FeatureServer",
  sourceName: "Oregon DEQ", sourceUrl: arcgisUrl(layer, ["FID", "RuleRef", "County", "BurnYesNo", "Message"]),
  officialUrl, scope: "part", mode: "positive-only", coverage: "restrictions", recurring: true,
} satisfies Pick<ActiveSource, "id" | "state" | "stack" | "sourceName" | "sourceUrl" | "officialUrl" | "scope" | "mode" | "coverage" | "recurring">;

type Rule = Pick<CalendarRule, "label" | "note" | "scopeNote" | "seasons"> & {
  areas: readonly (readonly [county: string, ruleRef: string, code: string])[];
  message: string;
};
const seasonal = "Prohibited: Seasonal";
const permit = "Prohibited : Permit Required";
const triCounty = "Prohibited: Tri-County";
const rules: readonly Rule[] = [
  {
    areas: [
      ["Clackamas", "340-264-0120(5)(a)", permit], ["Clackamas", "340-264-0120(5)(a)", triCounty],
      ["Multnomah", "340-264-0130(5)(a)", permit], ["Multnomah", "340-264-0130(5)(a)", triCounty],
      ["Washington", "340-264-0140(5)_prohib", triCounty],
    ],
    message: "Domestic/ yard debris open burning is prohibited unless authorized by a letter permit issued by DEQ in accordance with Division 264 Rules For Open Burning.",
    scopeNote: "DEQ-mapped Portland-area backyard burning prohibition zones",
    label: "Backyard burning requires special DEQ authorization",
    note: "Oregon DEQ prohibits open burning of domestic waste and yard debris in the mapped areas without a letter permit. Check the DEQ map for your address, and ask your local fire agency about separate restrictions.",
  },
  {
    areas: [
      ...["Benton", "Linn", "Marion", "Polk", "Yamhill"].map((county) =>
        [county, "304-264-0110(5)(a)", seasonal] as const), // The layer prints 304 for OAR 340-264-0110.
      ["Clackamas", "340-264-0120(5)(b)", seasonal],
      ["Multnomah", "340-264-0130(5)(b)", seasonal],
    ],
    message: "Domestic/ yard debris open burning is prohibited except for the burning of yard debris between March 1 and June 15, and between October 1 and December 15.",
    scopeNote: "DEQ-mapped areas with Willamette Valley backyard burning seasons",
    label: "Backyard burning closed outside spring and fall seasons",
    note: "The mapped areas allow covered yard debris only March 1–June 15 and October 1–December 15, subject to the daily decision and local fire rules. Use the DEQ address map to check your location.",
    seasons: [["06-16", "09-30"], ["12-16", "02-29"]],
  },
  {
    areas: [["Jackson", "Medford SIP", seasonal]],
    message: "Domestic/yard debris open burning is prohibited in the Medford-Ashland Air Quality Maintenance Area between November 1 and March 1.",
    scopeNote: "Medford–Ashland Air Quality Maintenance Area in Jackson County",
    label: "Winter residential debris-burning restriction",
    note: "Oregon DEQ maps a winter ban on domestic and yard-debris burning in the Medford–Ashland air quality area. Check the map, the Jackson County burn line and your fire district rules.",
    seasons: [["11-01", "02-29"]],
  },
  {
    areas: [["Lake", "Lakeview UGB", seasonal]],
    message: "Domestic/ yard debris open burning is prohibited between November 1st and March 1st.",
    scopeNote: "Lakeview urban growth boundary in Lake County",
    label: "Winter outdoor burning closed in the Lakeview urban growth boundary",
    note: "Lakeview Fire lists the winter outdoor burn closure from November 1 through March 1 within the town’s urban growth boundary. Use the DEQ map to check your address.",
    seasons: [["11-01", "03-01"]],
  },
];

function mappedCounty(name: string) {
  const county = countyByName("OR", name);
  if (!county) throw new Error(`Unmapped DEQ county: ${name}`);
  return county;
}

const reportingFips = [...new Set(rules.flatMap(({ areas }) => areas.map(([county]) => mappedCounty(county).fips)))];

export function parseDeqCountyRules(value: unknown, now: Date) {
  const features = arcgisRows(value, { requireComplete: true });
  const ids = new Set(features.map(({ FID }) => FID));
  if (ids.size !== features.length || features.some(({ FID, County, RuleRef, BurnYesNo, Message }) =>
    !Number.isInteger(FID) || [County, RuleRef, BurnYesNo, Message].some((field) => typeof field !== "string"))) {
    throw new Error("DEQ: unexpected domestic burning rule schema");
  }
  return rules.flatMap(({ areas, message, ...rule }) => {
    const counties = new Map<string, ReturnType<typeof mappedCounty>>();
    for (const [name, ruleRef, code] of areas) {
      const county = mappedCounty(name);
      const matches = features.filter(({ County, RuleRef, BurnYesNo }) =>
        County === county.name && RuleRef === ruleRef && BurnYesNo === code);
      if (matches.length !== 1 || matches.some(({ Message }) => Message !== message)) {
        throw new Error(`DEQ: mapped domestic burning rule changed for ${county.name} (${ruleRef})`);
      }
      counties.set(county.fips, county);
    }
    // Evaluate 02-29 as a calendar boundary without emitting a nonexistent February 29 expiry.
    return calendarStatusRows({ ...rule, zone, state: meta.state, status: "restricted", scope: "part", officialUrl },
      [...counties.values()], meta, now, { includeTomorrow: true });
  });
}

export const orDeqCountyRules: ActiveSource = {
  ...meta, reportingFips, cadence: { kind: "daily", zone, hours: [4] }, pollGroup: "or-regional-burning",
  async fetch({ now }) {
    return { rows: parseDeqCountyRules(JSON.parse(await getText(meta.sourceUrl, { maxBytes: 180_000 })), now) };
  },
};
