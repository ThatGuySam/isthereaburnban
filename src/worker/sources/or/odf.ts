import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { COUNTY_BY_FIPS } from "../../counties";
import { arcgisEditWindow, arcgisRows, arcgisUrl, codedDomains, msToIso } from "../lib/arcgis";
import { US_ZONES } from "../lib/dates";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";
import areaProjection from "./odf-areas.json";

const LAYER = "https://gis.odf.oregon.gov/odfags/rest/services/Hosted/Fire_Industrial_Fire_Precaution_Level_View/FeatureServer/0";
export const ODF_LAYER_URL = `${LAYER}?f=json`;
const META = {
  id: "or-odf-public-use", state: "OR", stack: "ArcGIS FeatureServer",
  sourceName: "Oregon Department of Forestry",
  sourceUrl: arcgisUrl(LAYER, [
    "regusearea", "district", "SHAPE__Area", "reguseineffect", "debrisburning", "openfire", "openfireother", "openfirewoodburning",
  ]),
  officialUrl: "https://gisapps.odf.oregon.gov/firerestrictions/pfr.html",
  scope: "part", coverage: "restrictions", mode: "positive-only",
} satisfies Pick<ActiveSource, "id" | "state" | "stack" | "sourceName" | "sourceUrl" | "officialUrl" | "scope" | "coverage" | "mode">;

const areas = new Map(Object.entries(areaProjection));
const projection = z.object({
  regusearea: z.string(),
  district: z.number().int(),
  SHAPE__Area: z.number().positive(),
  reguseineffect: z.literal([-1, 0, 1]),
  debrisburning: z.literal([0, 1, 2]),
  openfire: z.literal([0, 1, 2, 3]),
  openfireother: z.literal([0, 1]),
  openfirewoodburning: z.literal([0, 1]),
});
const layer = z.object({
  name: z.literal("Fire_Restriction"),
  editingInfo: z.object({ lastEditDate: z.number() }),
  fields: z.array(z.object({
    name: z.string(),
    domain: z.object({ codedValues: z.array(z.object({ code: z.number().int(), name: z.string().min(1) })).optional() })
      .nullish().transform((domain) => domain ?? undefined),
  })),
});

const expectedCodes = {
  debrisburning: ["NA", "No Debris Burning", "Debris Burn Permit Required"],
  openfire: ["NA", "No campfires", "Campfires in designated locations", "Campfires in approved campgrounds"],
  openfireother: ["NA", "Appliances using bottled fuels allowed"],
  openfirewoodburning: ["NA", "No wood burning devices in temporary dwellings (i.e. tents, travel trailers, etc.)"],
};

export function parseOdfPublicUse(metadata: unknown, data: unknown, now: Date): CountyStatus[] {
  const meta = layer.parse(metadata);
  const domains = codedDomains({ fields: meta.fields });
  if (Object.entries(expectedCodes).some(([field, labels]) => labels.some((label, code) => domains.get(field)?.get(code) !== label))) {
    throw new Error("ODF: changed restriction code definitions");
  }
  const checked = now.toISOString();
  const edited = meta.editingInfo.lastEditDate;
  const sourceUpdated = msToIso(edited);
  if (!sourceUpdated || sourceUpdated > checked) throw new Error("ODF: invalid layer edit date");
  const report = arcgisEditWindow(edited, now, 30 * 86_400_000);
  const features = arcgisRows(data, { requireComplete: true });
  if (features.length !== areas.size) throw new Error("ODF: changed regulated-use area inventory");

  const seen = new Set<string>();
  const rows: CountyStatus[] = [];
  for (const feature of features) {
    const row = projection.parse(feature);
    const area = areas.get(row.regusearea);
    const district = domains.get("district")?.get(row.district);
    if (!area || !district || area.district !== row.district || area.shapeArea !== row.SHAPE__Area || seen.has(row.regusearea)) {
      throw new Error(`ODF: unmapped or changed regulated-use area ${row.regusearea}`);
    }
    seen.add(row.regusearea);
    // The public map always shows the debris rule. It gates campfire and temporary-dwelling rules on regulated use.
    const details: string[] = [];
    if (row.debrisburning) details.push(expectedCodes.debrisburning[row.debrisburning]);
    if (row.reguseineffect) {
      if (row.openfire) details.push(expectedCodes.openfire[row.openfire]);
      if (row.openfire && row.openfireother) details.push(expectedCodes.openfireother[row.openfireother]);
      if (row.openfirewoodburning) details.push(expectedCodes.openfirewoodburning[row.openfirewoodburning]);
    }
    if (!details.length) continue;
    if (!report) throw new Error("ODF: active rules on a stale layer");
    for (const fips of area.countyFips) {
      const county = COUNTY_BY_FIPS.get(fips);
      if (county?.state !== META.state) throw new Error(`ODF: invalid county FIPS ${fips}`);
      rows.push({
        fips, county: county.name, state: META.state, sourceId: META.id, status: "restricted",
        scope: META.scope, scopeNote: `ODF-protected land in ${district} regulated-use area ${row.regusearea}`,
        label: "ODF public-use fire restrictions",
        note: `${details.join(". ")}. Check the ODF map for the location and the district proclamation for exceptions.`,
        since: null, expires: null, checked, ...report,
        sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      });
    }
  }
  return rows;
}

export const orOdfPublicUse: ActiveSource = {
  ...META,
  cadence: { kind: "daily", zone: US_ZONES.Pacific, hours: [0, 4, 8, 12, 16, 20] },
  async fetch({ now }) {
    const started = Date.now();
    const meta: unknown = JSON.parse(await getText(ODF_LAYER_URL, { maxBytes: 100_000 }));
    const delay = 1_100 - (Date.now() - started);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const data: unknown = JSON.parse(await getText(META.sourceUrl, { maxBytes: 100_000 }));
    return { rows: parseOdfPublicUse(meta, data, now) };
  },
};
