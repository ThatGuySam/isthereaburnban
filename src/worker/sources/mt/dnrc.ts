import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { arcgisEditWindow, arcgisRows, arcgisUrl } from "../lib/arcgis";
import { US_ZONES } from "../lib/dates";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";

const LAYER = "https://services2.arcgis.com/DRQySz3VhPgOv7Bo/arcgis/rest/services/Fire_Restrictions_by_Jurisdiction_Update_-_Read_Only_view/FeatureServer/3";
export const MT_DNRC_LAYER_URL = `${LAYER}?f=json`;
const META = {
  id: "mt-dnrc-fire-restrictions", state: "MT", scope: "part", stack: "ArcGIS Dashboard / FeatureServer",
  sourceName: "Montana DNRC interagency fire restrictions",
  sourceUrl: arcgisUrl(LAYER, [
    "OBJECTID", "NAME_1", "AreaSubUnit", "JurisdictionalUnitAgency", "JurisdictionalUnitName",
    "LandownerCategory", "RestrictionType", "Restriction_Document", "EditDate",
  ], { where: "RestrictionType IN ('Stage 1','Stage 2','Closures')" }),
  officialUrl: "https://www.arcgis.com/apps/dashboards/86668bab4c2248f09c1b70b546bff420",
} as const;

const STAGES = new Map([
  ["Stage 1", "Stage 1 fire restriction"],
  ["Stage 2", "Stage 2 fire restriction"],
  ["Closures", "Fire-related closure"],
]);
// This layer is edited when jurisdictions change an order. Bound both the
// register and each positive record because it has no effective or lift dates.
const MAX_AGE = 120 * 86_400_000;
const REGISTER = z.object({
  name: z.literal("Active Fire Restrictions"),
  editingInfo: z.object({ dataLastEditDate: z.number() }),
});
const ORDER = z.object({
  OBJECTID: z.number().int().positive(),
  NAME_1: z.string().nullable(),
  AreaSubUnit: z.string().nullable(),
  JurisdictionalUnitAgency: z.string().nullable(),
  JurisdictionalUnitName: z.string().nullable(),
  LandownerCategory: z.string().nullable(),
  RestrictionType: z.string().nullable(),
  Restriction_Document: z.string().nullable(),
  EditDate: z.number().nullable(),
});
const HTTPS = z.url({ protocol: /^https$/ });

export function parseDnrcRestrictions(metadata: unknown, data: unknown, now: Date): CountyStatus[] {
  const { editingInfo } = REGISTER.parse(metadata);
  if (!arcgisEditWindow(editingInfo.dataLastEditDate, now, MAX_AGE)) {
    throw new Error("Montana DNRC: stale or invalid order register edit date");
  }

  const checked = now.toISOString();
  const seen = new Set<number>();
  const rows: CountyStatus[] = [];
  for (const feature of arcgisRows(data, { allowEmpty: true, requireComplete: true })) {
    const order = ORDER.parse(feature);
    if (seen.has(order.OBJECTID)) throw new Error("Montana DNRC: duplicate jurisdiction feature");
    seen.add(order.OBJECTID);
    const label = STAGES.get(order.RestrictionType ?? "");
    const name = order.NAME_1 ?? "";
    const county = countyByName(META.state, /^Lewis\s*&\s*Clark$/i.test(name) ? "Lewis and Clark" : name);
    const area = order.AreaSubUnit?.trim();
    const manager = order.JurisdictionalUnitName?.trim();
    const agency = order.JurisdictionalUnitAgency?.trim();
    const ownership = order.LandownerCategory?.trim();
    const report = arcgisEditWindow(order.EditDate, now, MAX_AGE);
    if (!label || !county || !area || !manager || !agency || !ownership || !report) continue;
    const document = HTTPS.safeParse(order.Restriction_Document?.trim());
    rows.push({
      ...report, fips: county.fips, county: county.name, state: META.state, sourceId: META.id,
      scope: META.scope, scopeNote: area, status: "restricted", label,
      note: `The interagency map reports this restriction for ${ownership} land in ${area}, under ${manager} (${agency}). Check the order or contact the issuing agency for affected activities, boundaries and exemptions.`,
      checked, since: null, expires: null,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl,
      officialUrl: document.success ? document.data : META.officialUrl,
    });
  }
  return rows;
}

export const mtDnrcRestrictions: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only", keepRowLinks: true,
  cadence: { kind: "daily", zone: US_ZONES.Mountain, hours: [6, 12, 18] },
  async fetch({ now }) {
    const read = pacedTextReader({ headers: { accept: "application/json", "cache-control": "no-cache" }, maxBytes: 300_000 });
    const metadata: unknown = JSON.parse(await read(MT_DNRC_LAYER_URL));
    const data: unknown = JSON.parse(await read(META.sourceUrl));
    return { rows: parseDnrcRestrictions(metadata, data, now) };
  },
};
