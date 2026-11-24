import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { COUNTY_BY_FIPS } from "../../counties";
import { arcgisEditWindow, arcgisUrl, codedDomains, layerMetadata, msToIso, queryArcgis } from "../lib/arcgis";
import { US_ZONES } from "../lib/dates";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";
import zoneCounties from "./idl-zone-counties.json";

const LAYER = "https://gis1.idl.idaho.gov/arcgis/rest/services/Portal/FireRestrictions/MapServer/1";
const FIELDS = ["OBJECTID", "Name", "Stage", "Rstrct_Are", "last_edited_date", "DateEnacted", "DateRescinded", "Shape.STArea()"];
const META = {
  id: "id-idl-fire-stages", state: "ID", scope: "part", stack: "ArcGIS Enterprise / MapServer",
  sourceName: "Idaho Department of Lands",
  sourceUrl: arcgisUrl(LAYER, FIELDS, { orderByFields: "OBJECTID ASC", resultOffset: "0", resultRecordCount: "1000" }),
  officialUrl: "https://www.idl.idaho.gov/fire-management/fire-restrictions-finder/",
} as const;
const MAX_AGE = 45 * 86_400_000;
const STAGES = ["None", "Stage I", "Stage II"] as const;
const ZONES = new Map(zoneCounties.map((zone) => [zone.id, zone]));
const layerSchema = z.object({
  name: z.literal("Fire Restriction Zones"),
  fields: z.array(z.object({
    name: z.string(),
    domain: z.object({ codedValues: z.array(z.object({ code: z.string(), name: z.string() })).optional() }).nullish()
      .transform((domain) => domain ?? undefined),
  })),
});
const zoneSchema = z.object({
  OBJECTID: z.number().int(), Name: z.string(), Stage: z.enum(STAGES), Rstrct_Are: z.string(),
  last_edited_date: z.number().nullable(), DateEnacted: z.number().nullable(), DateRescinded: z.number().nullable(),
  "Shape.STArea()": z.number().positive(),
});

export function parseIdlStages(metadata: unknown, features: unknown[], now: Date): CountyStatus[] {
  const domains = codedDomains(layerSchema.parse(metadata)).get("Stage");
  if (domains?.size !== STAGES.length || STAGES.some((stage) => domains.get(stage) !== stage)) {
    throw new Error("Idaho Lands: changed fire restriction codes");
  }
  if (features.length !== ZONES.size) throw new Error("Idaho Lands: changed fire restriction zone inventory");

  const checked = now.toISOString();
  const seen = new Set<number>();
  const rows: CountyStatus[] = [];
  for (const feature of features) {
    const record = zoneSchema.parse(feature);
    const zone = ZONES.get(record.OBJECTID);
    if (!zone || zone.name !== record.Name || zone.area !== record.Rstrct_Are ||
        zone.shapeArea !== record["Shape.STArea()"] || seen.has(zone.id)) {
      throw new Error(`Idaho Lands: unmapped or changed fire restriction zone ${record.Name}`);
    }
    seen.add(zone.id);
    if (record.Stage === "None") continue;

    const validFrom = msToIso(record.DateEnacted);
    const rescinded = msToIso(record.DateRescinded);
    if (!validFrom || (record.DateRescinded !== null && (!rescinded || rescinded <= validFrom))) {
      throw new Error(`Idaho Lands: invalid effective dates for ${zone.name}`);
    }
    if (validFrom > checked || (rescinded && rescinded <= checked)) continue;
    const report = arcgisEditWindow(record.last_edited_date, now, MAX_AGE);
    if (!report) throw new Error(`Idaho Lands: stale stage report for ${zone.name}`);
    const validUntil = rescinded && rescinded < report.validUntil ? rescinded : report.validUntil;
    const stage = record.Stage === "Stage I" ? "Stage 1" : "Stage 2";
    for (const fips of zone.countyFips) {
      const county = COUNTY_BY_FIPS.get(fips);
      if (county?.state !== META.state) throw new Error(`Idaho Lands: invalid mapped county FIPS ${fips}`);
      rows.push({
        fips, county: county.name, state: META.state, sourceId: META.id, status: "restricted", scope: META.scope,
        scopeNote: `${zone.name}, ${zone.area}`,
        label: `${stage} fire restrictions`,
        note: `${stage} limits campfires and other activities in this zone. Check the Idaho Lands finder and issuing land manager's order for boundaries, activities and exceptions.`,
        checked, sourceUpdated: report.sourceUpdated, since: null, expires: null, validFrom, validUntil,
        sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      });
    }
  }
  return rows;
}

export const idIdlStages: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Mountain, hours: [2, 8, 14, 20] },
  async fetch({ now }) {
    let nextRequest = 0;
    const read = async (url: string): Promise<unknown> => {
      const delay = nextRequest - Date.now();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      nextRequest = Date.now() + 1_000;
      return JSON.parse(await getText(url, { headers: { accept: "application/json", "cache-control": "no-cache" }, maxBytes: 100_000 }));
    };
    const metadata = await layerMetadata(LAYER, read);
    return { rows: parseIdlStages(metadata, await queryArcgis(LAYER, FIELDS, metadata, { read }), now) };
  },
};
