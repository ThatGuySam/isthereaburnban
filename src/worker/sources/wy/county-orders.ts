import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { arcgisEditWindow, arcgisRows, arcgisUrl, codedDomains } from "../lib/arcgis";
import { US_ZONES } from "../lib/dates";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";

const LAYER = "https://services1.arcgis.com/i5xRZLABP6oUOcld/arcgis/rest/services/Updated_fire_restrictions_2021_Read_Only/FeatureServer/0";
const LAYER_URL = `${LAYER}?f=json`;
const META = {
  id: "wy-forestry-county-orders", state: "WY", scope: "part", stack: "ArcGIS FeatureServer",
  sourceName: "Wyoming State Forestry Division",
  sourceUrl: arcgisUrl(LAYER, ["OBJECTID_1", "COUNTYNAME", "Restriction", "Restriction_Link", "Link", "EditDate"]),
  officialUrl: "https://sites.google.com/wyo.gov/forestry-division/fire-management/fire-restrictions",
} as const;

const LABELS = new Map([
  ["Stage 1", "Stage 1 fire restriction"],
  ["Stage 2", "Stage 2 fire restriction"],
  ["Closed", "Fire-danger closure"],
]);
// This map retains some flags after a lift. Bound each row by its own edit,
// since updating an unrelated county also refreshes the layer timestamp.
const MAX_AGE = 90 * 86_400_000;
const LAYER_SCHEMA = z.object({
  name: z.literal("New_Fire_Restrictions"),
  editingInfo: z.object({ dataLastEditDate: z.number() }),
  fields: z.array(z.object({
    name: z.string(),
    domain: z.object({ codedValues: z.array(z.object({ code: z.string(), name: z.string() })) }).nullish()
      .transform((domain) => domain ?? undefined),
  })),
});
const FEATURE = z.object({
  OBJECTID_1: z.number().int().positive(),
  COUNTYNAME: z.string().nullable(),
  Restriction: z.string().nullable(),
  Restriction_Link: z.string().nullable(),
  Link: z.string().nullable(),
  EditDate: z.number().nullable(),
});
const HTTPS = z.url({ protocol: /^https$/ });

export function parseWyomingCountyOrders(metadata: unknown, data: unknown, now: Date): CountyStatus[] {
  const layer = LAYER_SCHEMA.parse(metadata);
  if (!arcgisEditWindow(layer.editingInfo.dataLastEditDate, now, MAX_AGE)) {
    throw new Error("Wyoming State Forestry: stale or invalid county layer edit date");
  }
  const domain = codedDomains(layer).get("Restriction");
  if (!domain || [...LABELS.keys()].some((stage) => domain.get(stage) !== stage)) {
    throw new Error("Wyoming State Forestry: county stage domain changed");
  }

  const features = FEATURE.array().parse(arcgisRows(data, { requireComplete: true }));
  if (new Set(features.map((feature) => feature.OBJECTID_1)).size !== features.length) {
    throw new Error("Wyoming State Forestry: duplicate ArcGIS object ID");
  }
  const checked = now.toISOString();
  const seen = new Set<string>();
  const ambiguous = new Set<string>();
  const rows: CountyStatus[] = [];
  for (const feature of features) {
    const county = feature.COUNTYNAME && countyByName(META.state, feature.COUNTYNAME);
    if (!county) continue;
    if (seen.has(county.fips)) ambiguous.add(county.fips);
    seen.add(county.fips);
    const label = LABELS.get(feature.Restriction ?? "");
    if (!label || feature.EditDate === null || feature.EditDate > layer.editingInfo.dataLastEditDate) continue;
    const report = arcgisEditWindow(feature.EditDate, now, MAX_AGE);
    if (!report) continue;
    const officialUrl = [feature.Link, feature.Restriction_Link]
      .map((url) => url?.trim()).find((url) => HTTPS.safeParse(url).success);
    if (!officialUrl) continue;
    rows.push({
      ...report, fips: county.fips, county: county.name, state: META.state, sourceId: META.id,
      status: "restricted", label, scope: META.scope,
      scopeNote: `Unincorporated areas named in the ${county.name} order`,
      note: "State Forestry reports a county fire restriction. Read the county order for the boundary, dates and exceptions.",
      since: null, expires: null, checked, sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl,
    });
  }
  if (!seen.size) throw new Error("Wyoming State Forestry: county layer has no recognized counties");
  return rows.filter((row) => !ambiguous.has(row.fips));
}

export const wyCountyOrders: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only", keepRowLinks: true,
  cadence: { kind: "daily", zone: US_ZONES.Mountain, hours: [3, 9, 15, 21] },
  async fetch({ now }) {
    const read = pacedTextReader({ headers: { accept: "application/json", "cache-control": "no-cache" }, maxBytes: 100_000 });
    const metadata: unknown = JSON.parse(await read(LAYER_URL));
    const data: unknown = JSON.parse(await read(META.sourceUrl));
    return { rows: parseWyomingCountyOrders(metadata, data, now) };
  },
};
