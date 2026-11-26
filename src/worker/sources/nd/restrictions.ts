import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { arcgisLocalDate, arcgisRows, arcgisTimestampOffset, arcgisUrl, msToIso, type Attributes } from "../lib/arcgis";
import { localClock, localDayWindow, reportWindow, US_ZONES } from "../lib/dates";
import { pacedTextReader } from "../lib/http";
import { hasDatedRedFlagRule } from "../nws/rules";
import type { ActiveSource } from "../types";
import { ND_DECLARATION_FIELDS, ND_DECLARATION_LAYER, ndDeclarationWindow } from "./declarations";

const ZONE = US_ZONES.Central;
const MAX_AGE = 3 * 3_600_000;
const COUNTY_NAMES = new Map(countiesInState("ND").map((county) => [county.name.replace(/ County$/, ""), county]));
const LEVELS = ["Low", "Moderate", "High", "Very High", "Extreme"] as const;
const INDEX = new Map<unknown, number>(LEVELS.map((level, i) => [level, i + 1]));
const ACTIVITIES = {
  campfires: "campfires",
  controlled: "controlled burns",
  controlledburns: "advance notice for controlled burns",
  cropland: "agricultural burning",
  patio: "gas patio fireplaces and chimineas",
  patioorganic: "wood-burning patio fireplaces and chimineas",
  fireworks: "aerial fireworks",
  fireworks2: "ground fireworks",
  garbage: "garbage or pit burning",
  camp: "gas camp stoves",
  charcoal: "charcoal grills and smokers",
  gas: "gas grills and smokers",
  pellet: "pellet grills and smokers",
  wood: "wood-fired grills and smokers",
} as const;
type Activity = keyof typeof ACTIVITIES;
const ACTIVITIES_BY_FIELD = Object.entries(ACTIVITIES) as [Activity, string][];
const FIELDS = [
  "OBJECTID", "county", "FDR_COUNTY", "Jurisdiction_Type", "remove", "attachment_declaration_name",
  ...ND_DECLARATION_FIELDS, "Script_Update_Date", "RFW_Status", "rfw_effective_Date", "rfw_expiration_date",
  ...ACTIVITIES_BY_FIELD.flatMap(([key]) => [`${key}_conditions`, `${key}_red_checkbox`]),
];
const DANGER_FIELDS = ["CNTY_FIPS", "DatePublished", "FireIndex"];
export const ND_FIRE_DANGER_URL = arcgisUrl(
  "https://services1.arcgis.com/qQaNyq8h4wNEdlUV/arcgis/rest/services/FireDangerIndex_Public/FeatureServer/0",
  DANGER_FIELDS, { orderByFields: "OBJECTID ASC" },
);
const ADMIN_CODE = "https://ndlegis.gov/information/acdata/pdf/33.1-15-04.pdf";
const SIGNED_ORDERS = "https://nddesgis.nd.gov/server/rest/services/Hosted/WebEOC_Burn_Restriciions_Publish/FeatureServer/0";
const META = {
  id: "nd-des-restrictions", state: "ND", scope: "part", stack: "ArcGIS FeatureServer / Dashboard WebMap",
  sourceName: "North Dakota Department of Emergency Services",
  sourceUrl: arcgisUrl(ND_DECLARATION_LAYER, FIELDS, { orderByFields: "OBJECTID ASC" }),
  officialUrl: "https://burnrestrictions.nd.gov",
} as const;

type ReviewedOrder = {
  county: string;
  officialUrl: string;
  thresholds?: Partial<Record<Activity, typeof LEVELS[number]>>;
  label?: string;
  notice?: string;
  note?: string;
};
const largeBurnOrder = {
  thresholds: {
    controlledburns: "Low", campfires: "High", cropland: "High", patioorganic: "High",
    fireworks: "High", fireworks2: "High", garbage: "High", charcoal: "Extreme", wood: "Extreme",
  },
  notice: "contacting the local jurisdiction before large burns",
} as const;

// Apply the signed wording only to the matching declaration edition.
const REVIEWED = new Map<unknown, ReviewedOrder>([
  ["Mercer County 20260506  Burn Restriction Declaration.pdf", {
    ...largeBurnOrder, county: "Mercer County",
    officialUrl: "https://mercercountynd.com/image/cache/5-6-2026_Fire_Emergency_Declaration_Burn_Ban.pdf",
  }],
  ["Oliver County 11102026 Burn Restriction Declaration.pdf", {
    ...largeBurnOrder, county: "Oliver County", officialUrl: `${SIGNED_ORDERS}/36/attachments/186`,
  }],
  ["McLean County 02182026 Burn Restriction Declaration.pdf", {
    county: "McLean County", officialUrl: "https://www.mcleancountynd.gov/county-news/2026-burn-restrictions/",
    thresholds: { campfires: "Very High", controlled: "Very High", cropland: "Very High",
      fireworks: "Very High", fireworks2: "Very High", garbage: "Very High" },
  }],
  ["Waiver Burke County Burn Ban.pdf", {
    county: "Burke County", officialUrl: `${SIGNED_ORDERS}/51/attachments/125`,
    notice: "local fire authority approval for burning",
  }],
  ["Sioux County 20260414 Burn Restriction Declaration.pdf", {
    county: "Sioux County", officialUrl: `${SIGNED_ORDERS}/41/attachments/95`,
    thresholds: { controlledburns: "Low", campfires: "High", cropland: "High", patioorganic: "High",
      fireworks: "High", fireworks2: "High", garbage: "High", camp: "High", charcoal: "High" },
    notice: "local fire authority approval for controlled burns",
  }],
  ["Slope County 20260513 Burn Declaration.pdf", {
    county: "Slope County", officialUrl: `${SIGNED_ORDERS}/26/attachments/160`,
    thresholds: { controlledburns: "Low", campfires: "Low", cropland: "Low",
      fireworks: "Low", fireworks2: "Low", garbage: "Low" },
    notice: "contacting the district fire chief before burning",
    note: "The district fire chief decides whether burning may proceed.",
  }],
  ["2026 DC Fire Emergency and Burn Restrictions Signed.pdf", {
    county: "Divide County", officialUrl: `${SIGNED_ORDERS}/14/attachments/69`,
    thresholds: { controlledburns: "Low", campfires: "Very High", controlled: "Very High",
      cropland: "Very High", garbage: "Very High", fireworks: "Very High", fireworks2: "Very High" },
    notice: "district fire chief approval for covered open burning",
    note: "Check Divide County's own fire danger rating and the declaration for notification requirements.",
  }],
  ["McKenzie County 20260804 Burn Restriction Declaration.pdf", {
    county: "McKenzie County", officialUrl: `${SIGNED_ORDERS}/34/attachments/157`,
    label: "Open burning ban",
    thresholds: { campfires: "Low", controlled: "Low", cropland: "Low", fireworks: "Low", fireworks2: "Low",
      garbage: "Low", patioorganic: "Low", charcoal: "Low", wood: "Low", pellet: "Low" },
    note: "The county bans open and controlled burning. The signed order allows responsible use of propane, gas and electric grills away from combustible materials.",
  }],
]);

function jurisdiction(row: Attributes) {
  if (typeof row.FDR_COUNTY !== "string" || typeof row.county !== "string") return;
  const county = COUNTY_NAMES.get(row.FDR_COUNTY);
  if (!county) return;
  const name = row.county;
  switch (row.Jurisdiction_Type) {
    case "County FDR":
      if (name === county.name) return { county, scopeNote: `Areas covered by the ${county.name} declaration` };
      return;
    case "Federal Agency FDR":
      // Signed USFS order 01-18-00-26-02 omits Dunn, which has a polygon in the daily map.
      if (name.startsWith("USFS Little Missouri National Grassland") && county.name === "Dunn County") return;
      if (name === `BLM Lands within ${county.name}`) return { county, scopeNote: `BLM-managed lands in ${county.name}` };
      break;
    case "City FDR":
    case "Tribal FDR":
    case "State Agency FDR":
      break;
    default:
      return;
  }
  return { county, scopeNote: `${name} jurisdiction within ${county.name}` };
}

export function ndActiveWarning(row: Attributes, at: string) {
  if (row.RFW_Status !== "RFW") return;
  const start = arcgisTimestampOffset(row.rfw_effective_Date);
  const end = arcgisTimestampOffset(row.rfw_expiration_date);
  if (start && end && start <= at && at < end) return { start, end };
}

export function currentNdRatings(json: unknown, checked: string, today: string) {
  const ratings = new Map<string, number>();
  const seen = new Set<string>();
  const dates = new Map<unknown, boolean>();
  for (const row of arcgisRows(json, { requireComplete: true })) {
    if (DANGER_FIELDS.some((name) => !Object.hasOwn(row, name))) throw new Error("North Dakota DES: fire danger fields changed");
    if (typeof row.CNTY_FIPS !== "string" || !/^\d{3}$/.test(row.CNTY_FIPS)) continue;
    const fips = `38${row.CNTY_FIPS}`;
    if (seen.has(fips)) throw new Error("North Dakota DES: duplicate county fire danger rating");
    seen.add(fips);
    // The fire-danger dashboard reads the calendar date of the 4 a.m. NWS run.
    // DatePublished is wall time encoded as UTC, unlike the ArcGIS layer edit timestamp.
    if (!dates.has(row.DatePublished)) {
      const issued = arcgisLocalDate(row.DatePublished, ZONE);
      dates.set(row.DatePublished, Boolean(issued && issued <= checked && msToIso(row.DatePublished)?.startsWith(today)));
    }
    if (dates.get(row.DatePublished) && typeof row.FireIndex === "number" &&
      Number.isInteger(row.FireIndex) && row.FireIndex >= 1 && row.FireIndex <= LEVELS.length) {
      ratings.set(fips, row.FireIndex);
    }
  }
  if (!seen.size) throw new Error("North Dakota DES: missing county fire danger ratings");
  return ratings;
}

export function parseNdRestrictions(json: unknown, fireDanger: unknown, now: Date): CountyStatus[] {
  const features = arcgisRows(json, { requireComplete: true });
  const checked = now.toISOString();
  const today = localClock(now, ZONE).date;
  const ratings = currentNdRatings(fireDanger, checked, today);
  const { validUntil } = localDayWindow(today, ZONE);
  const stamps = new Map<unknown, ReturnType<typeof reportWindow>>();
  const seen = new Set<string>();
  const rows: CountyStatus[] = [];
  let currentCounties = 0;

  for (const row of features) {
    if (FIELDS.some((name) => !Object.hasOwn(row, name))) throw new Error("North Dakota DES: restriction fields changed");
    const area = jurisdiction(row);
    if (!area || typeof row.remove !== "string" || row.remove.toLowerCase() !== "no") continue;
    const { county, scopeNote } = area;
    const identity = `${county.fips}:${row.Jurisdiction_Type}:${row.county}`;
    if (seen.has(identity)) throw new Error("North Dakota DES: duplicate restriction jurisdiction");
    seen.add(identity);
    if (!stamps.has(row.Script_Update_Date)) {
      const stamp = arcgisLocalDate(row.Script_Update_Date, ZONE);
      stamps.set(row.Script_Update_Date, reportWindow(stamp, now, MAX_AGE));
    }
    const report = stamps.get(row.Script_Update_Date);
    if (!report) continue;
    const isCounty = row.Jurisdiction_Type === "County FDR";
    if (isCounty) currentCounties++;
    const base = {
      ...META, fips: county.fips, county: county.name, scopeNote, checked, sourceId: META.id,
      sourceUpdated: report.sourceUpdated, status: "restricted", since: null,
    } as const;
    const dayEnd = report.validUntil < validUntil ? report.validUntil : validUntil;
    // Divide County uses its own locally published fire danger.
    const usesStateRating = !isCounty || county.name !== "Divide County";
    const rating = usesStateRating ? ratings.get(county.fips) : undefined;
    if (isCounty && rating === 5) rows.push({
      ...base, scopeNote: `Open burning covered by North Dakota air-quality rules in ${county.name}`,
      label: "Extreme fire danger open-burning prohibition", officialUrl: ADMIN_CODE,
      note: "North Dakota Administrative Code 33.1-15-04 limits covered open burning when the fire danger rating is Extreme.",
      expires: null, validUntil: dayEnd,
    });

    const declaration = ndDeclarationWindow(row, checked);
    if (!declaration) continue;
    const reviewed = REVIEWED.get(row.attachment_declaration_name);
    const order = reviewed?.county === county.name && isCounty ? reviewed : undefined;
    // NWS already evaluates these particular signed editions using its live CAP feed.
    const coveredByNws = isCounty && typeof row.attachment_declaration_name === "string" &&
      hasDatedRedFlagRule(county.fips, row.attachment_declaration_name);
    const warning = coveredByNws ? undefined : ndActiveWarning(row, checked);
    const indexActivities: string[] = [];
    const warnedActivities: string[] = [];
    for (const [activity, label] of ACTIVITIES_BY_FIELD) {
      const threshold = INDEX.get(order?.thresholds ? order.thresholds[activity] : row[`${activity}_conditions`]);
      const description = activity === "controlledburns" ? order?.notice ?? label : label;
      // Low is the floor of the scale and applies before the morning rating is published.
      if (threshold && (threshold === 1 || (rating !== undefined && rating >= threshold))) {
        indexActivities.push(description);
      }
      if (warning && (order?.thresholds ? threshold && activity !== "controlledburns"
        : row[`${activity}_red_checkbox`] === "Yes")) {
        warnedActivities.push(description);
      }
    }
    const officialUrl = order?.officialUrl ?? META.officialUrl;
    const details = (activities: string[]) => [
      `Affected activities and requirements include ${activities.join(", ")}.`,
      order?.note,
      "Check the declaration for boundaries and exceptions.",
    ].filter(Boolean).join(" ");
    if (indexActivities.length) rows.push({
      ...base, officialUrl, label: order?.label ?? "Burning restrictions in effect",
      note: details(indexActivities), expires: declaration.end,
      validUntil: declaration.end && declaration.end < dayEnd ? declaration.end : dayEnd,
    });
    if (warning && warnedActivities.length) {
      const end = declaration.end && declaration.end < warning.end ? declaration.end : warning.end;
      rows.push({
        ...base, officialUrl, label: "Burning restrictions during a Red Flag Warning", note: details(warnedActivities),
        since: null,
        expires: end, validUntil: report.validUntil < end ? report.validUntil : end,
      });
    }
  }
  if (!currentCounties) throw new Error("North Dakota DES: stale or missing county reports");
  return rows;
}

export const ndDesRestrictions: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only", keepRowLinks: true,
  cadence: { kind: "hourly" }, pollGroup: "nd-hourly", staleMs: MAX_AGE,
  async fetch({ now }) {
    const read = pacedTextReader({ headers: { accept: "application/json" }, maxBytes: 300_000 });
    const declarations: unknown = JSON.parse(await read(META.sourceUrl));
    const ratings: unknown = JSON.parse(await read(ND_FIRE_DANGER_URL));
    return { rows: parseNdRestrictions(declarations, ratings, now) };
  },
};
