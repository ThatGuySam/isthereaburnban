import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { arcgisEditWindow, arcgisRows, arcgisUrl, codedSubtypes } from "../lib/arcgis";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";

const LAYER = "https://services6.arcgis.com/XBUaJ9z59sKeDhyY/arcgis/rest/services/FireDistrictsWeb_view/FeatureServer/0";
const META = {
  id: "ks-dickinson-fire-districts", state: "KS", scope: "part", stack: "ArcGIS FeatureServer / WebMap",
  sourceName: "Dickinson County Emergency Communications",
  sourceUrl: arcgisUrl(LAYER, ["OBJECTID", "Fire__Dist", "BanStatus"], { orderByFields: "OBJECTID ASC" }),
  officialUrl: "https://www.dkcoks.gov/Burn-Restrictions-Map",
} as const;

const SUBTYPES = new Map([[1, "No Ban"], [2, "Banned"], [3, "Grassland Only"]]);
// The published polygons only establish these districts' conditions within Dickinson County.
const DISTRICTS = new Map([
  [1, "Longford - Talmage FD"], [2, "Solomon FD"], [3, "Grant Township FD"], [5, "DK CO Dist #1 FD"],
  [6, "Woodbine FD"], [7, "DK CO Dist #2 FD"], [8, "SA CO Dist #1 FD"], [9, "Herington FD"],
  [10, "Abilene FD"], [11, "Chapman FD"], [12, "Enterprise FD"], [13, "Solomon FD (City)"],
]);
const LAYER_SCHEMA = z.object({
  name: z.literal("FireDistrictsWeb"),
  typeIdField: z.literal("BanStatus"),
  types: z.array(z.object({ id: z.number().int(), name: z.string() })),
  editingInfo: z.object({ dataLastEditDate: z.number().int() }),
});
const FEATURE_SCHEMA = z.object({
  OBJECTID: z.number().int(), Fire__Dist: z.string(),
  BanStatus: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
// The view has a layer-wide edit stamp, with no per-district dates or heartbeat.
const MAX_DATA_AGE = 7 * 86_400_000;

export function parseDickinsonDistricts(metadata: unknown, data: unknown, now: Date): CountyStatus[] {
  const layer = LAYER_SCHEMA.parse(metadata);
  const codes = codedSubtypes(layer, "BanStatus");
  if (codes?.size !== SUBTYPES.size || [...SUBTYPES].some(([id, name]) => codes.get(id) !== name)) {
    throw new Error("Dickinson County: unexpected ArcGIS burn-status codes");
  }
  const report = arcgisEditWindow(layer.editingInfo.dataLastEditDate, now, MAX_DATA_AGE);
  if (!report) throw new Error("Dickinson County: stale or invalid ArcGIS layer edit date");

  const districts = FEATURE_SCHEMA.array().parse(arcgisRows(data, { requireComplete: true }));
  if (districts.length !== DISTRICTS.size || new Set(districts.map(({ OBJECTID }) => OBJECTID)).size !== DISTRICTS.size ||
    districts.some(({ OBJECTID, Fire__Dist }) => DISTRICTS.get(OBJECTID) !== Fire__Dist)) {
    throw new Error("Dickinson County: incomplete or changed fire district roster");
  }
  const checked = now.toISOString();
  return districts.flatMap(({ Fire__Dist, BanStatus }): CountyStatus[] => {
    if (BanStatus === 1) return [];
    return [{
      ...report, fips: "20041", county: "Dickinson County", state: META.state, sourceId: META.id,
      scope: META.scope, scopeNote: `${Fire__Dist} response area within Dickinson County`,
      status: BanStatus === 2 ? "ban" : "restricted",
      label: BanStatus === 2 ? "District controlled-burning ban" : "District grassland burning only",
      note: "Check the county map for the district boundary and call Emergency Communications at 785-263-4041 for current rules and permits.",
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      checked, since: null, expires: null,
    }];
  });
}

export const ksDickinsonDistricts: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "hourly" }, staleMs: 3 * 3_600_000,
  async fetch({ now }) {
    const read = pacedTextReader({
      headers: { accept: "application/json", "cache-control": "no-cache" },
      maxBytes: 100_000, maxResponseAgeMs: 60 * 60_000,
    });
    const metadata: unknown = JSON.parse(await read(`${LAYER}?f=json`));
    const districts: unknown = JSON.parse(await read(META.sourceUrl));
    return { rows: parseDickinsonDistricts(metadata, districts, now) };
  },
};
