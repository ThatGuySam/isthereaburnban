import type { CountyStatus } from "../../../shared/types";
import { COUNTY_BY_FIPS } from "../../counties";
import { arcgisUrl, codedDomains, dataLastEditDate, layerMetadata, queryArcgis, type LayerMetadata } from "../lib/arcgis";
import { reportWindow, US_ZONES } from "../lib/dates";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";
import zoneCounties from "./zone-counties.json";

const LAYER = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Alaska_Burn_Permit_Zones_Public_View/FeatureServer/0";
const FIELDS = ["FID", "Name", "GlobalID", "Shape__Area", "Shape__Length", "BurnPermitLink", "Status"];
const META = {
  id: "ak-dnr-permit-zones", state: "AK", scope: "part", stack: "ArcGIS FeatureServer",
  sourceName: "Alaska Division of Forestry & Fire Protection",
  sourceUrl: arcgisUrl(LAYER, FIELDS, { orderByFields: "FID ASC", resultOffset: "0", resultRecordCount: "1000" }),
  officialUrl: "https://dnr.alaska.gov/burn/fireareas",
} as const;
const ZONES = new Map(zoneCounties.map((zone) => [zone.id, zone]));
const MAX_EDIT_AGE_MS = 48 * 3_600_000;
const STATUS_NAMES = new Map([
  [0, "Open to burning with DOF permit"],
  [1, "Closed to all burning except in an approved burning device"],
  [2, "Burn permits suspended"],
  [4, "Open permit not required"],
]);
const DNR_LINK = /^https:\/\/dnr\.alaska\.gov\/burn\/fireareas\/[a-z-]+(?:\/permitform)?$/;

export function parseAlaskaPermitZones(metadata: LayerMetadata, features: Record<string, unknown>[], now: Date): CountyStatus[] {
  const domain = codedDomains(metadata).get("Status");
  if (metadata.objectIdField !== "FID" || domain?.size !== STATUS_NAMES.size ||
      [...STATUS_NAMES].some(([code, label]) => domain.get(code) !== label)) {
    throw new Error("Alaska Forestry: changed permit zone schema or status domain");
  }
  if (features.length !== ZONES.size) throw new Error("Alaska Forestry: changed permit zone inventory");

  // The publisher exposes a layer edit date and no per-zone decision timestamp.
  const report = reportWindow(dataLastEditDate(metadata), now, MAX_EDIT_AGE_MS);
  if (!report) throw new Error("Alaska Forestry: stale or undated permit zone report");

  const checked = now.toISOString();
  const seen = new Set<number>();
  const rows: CountyStatus[] = [];
  for (const { FID, Name, GlobalID, Shape__Area, Shape__Length, BurnPermitLink, Status } of features) {
    const zone = typeof FID === "number" ? ZONES.get(FID) : undefined;
    if (!zone || seen.has(zone.id) || zone.name !== Name || zone.globalId !== GlobalID ||
        zone.shapeArea !== Shape__Area || zone.shapeLength !== Shape__Length) {
      throw new Error(`Alaska Forestry: unmapped or changed permit zone ${Name}`);
    }
    seen.add(zone.id);
    if (typeof BurnPermitLink !== "string" || !DNR_LINK.test(BurnPermitLink)) {
      throw new Error(`Alaska Forestry: invalid permit link for ${zone.name}`);
    }
    // The statutory calendar supplies the regular permit requirement. Only 1 and 2 are temporary restrictions.
    if (Status === null || Status === 0 || Status === 4) continue;
    if (Status !== 1 && Status !== 2) throw new Error(`Alaska Forestry: unknown permit status for ${zone.name}`);

    const closure = Status === 1;
    for (const fips of zone.countyFips) {
      const county = COUNTY_BY_FIPS.get(fips);
      if (county?.state !== META.state) throw new Error(`Alaska Forestry: invalid mapped FIPS ${fips}`);
      rows.push({
        ...report, fips, county: county.name, state: META.state, sourceId: META.id, status: "restricted",
        scope: META.scope, scopeNote: `DNR permit zone: ${zone.name}`,
        label: closure ? "Burning closed except in approved devices" : "Burn permits suspended",
        note: closure
          ? "Check the area’s Forestry office for the closure boundary and approved devices."
          : "Burning that requires a state permit is suspended in this zone. Check the area’s Forestry office for current limits.",
        checked, since: null, expires: null,
        sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: BurnPermitLink,
      });
    }
  }
  return rows;
}

export const akDnrPermitZones: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only", keepRowLinks: true,
  cadence: { kind: "daily", zone: US_ZONES.Alaska, hours: [0, 6, 12, 18] },
  async fetch({ now }) {
    const readText = pacedTextReader({ headers: { accept: "application/json", "cache-control": "no-cache" }, maxBytes: 100_000 });
    const read = async (url: string): Promise<unknown> => JSON.parse(await readText(url));
    const metadata = await layerMetadata(LAYER, read);
    const features = await queryArcgis(LAYER, FIELDS, metadata, { read });
    return { rows: parseAlaskaPermitZones(metadata, features, now) };
  },
};
