import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countiesInState, countyByName, COUNTY_BY_FIPS } from "../../counties";
import { arcgisDateOnly, arcgisEditWindow, arcgisRows, arcgisUrl } from "../lib/arcgis";
import { atLocalTime, localClock, US_ZONES } from "../lib/dates";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";

const LAYER = "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Fire_Restrictions/FeatureServer/0";
export const UT_ORDERS_LAYER_URL = `${LAYER}?f=json`;
const META = {
  id: "ut-ffsl-fire-orders", state: "UT", scope: "part", stack: "ArcGIS FeatureServer",
  sourceName: "Utah Division of Forestry, Fire and State Lands",
  sourceUrl: arcgisUrl(LAYER, [
    "OBJECTID", "OrderNum", "Agency", "EffectiveDate", "RescindedDate", "AreaDescription",
    "Link", "Link_Rescind", "RestrictionType", "Status", "Campfire_etc", "Shape__Area",
  ], {
    where: "Agency IN ('1-FFSL','5-Navajo','6-Ute') AND Campfire_etc = 1",
    orderByFields: "OBJECTID ASC",
  }),
  officialUrl: "https://utah-fire-info-utahdnr.hub.arcgis.com/pages/active-fire-restrictions",
} as const;

const ZONE = US_ZONES.Mountain;
const COUNTIES = countiesInState(META.state);
// An unsigned daily all-clear would need a much shorter window. These are signed
// orders that remain in force until rescinded, on a register edited when orders change.
const MAX_LAYER_AGE_MS = 120 * 86_400_000;
const SCHEDULED_END = new Set(["Future_Rescind", "Future_Supersede"]);
const PUBLISHED_STATUSES = new Set(["Active", "Future", ...SCHEDULED_END]);
const STAGES = new Set(["Stage 1", "Stage 2", "Stage 3"]);
const LAYER_SCHEMA = z.object({
  name: z.literal("Fire_Restrictions"),
  editingInfo: z.object({ dataLastEditDate: z.number() }),
});
const ORDER_SCHEMA = z.object({
  OBJECTID: z.number().int().positive(),
  OrderNum: z.string().nullable(),
  Agency: z.string(),
  EffectiveDate: z.string().nullable(),
  RescindedDate: z.string().nullable(),
  AreaDescription: z.string().nullable(),
  Link: z.string().nullable(),
  Link_Rescind: z.string().nullable(),
  RestrictionType: z.string(),
  Status: z.string(),
  Campfire_etc: z.number(),
  Shape__Area: z.number().positive(),
});
type Order = z.infer<typeof ORDER_SCHEMA>;

const SIGNED_URL = z.url({ protocol: /^https$/ });
const STATE_LANDS = /^All state lands [–-]AND[–-] all unincorporated private lands within the state of Utah\.$/i;
const COUNTY_LANDS = /^(?:The unincorporated (?:areas of|state and private (?:areas of|lands within))|All unincorporated state and private lands within) ([a-z ]+) County(?=\.|, Utah\.| within the boundaries of )/i;
const MULTI_COUNTY_LANDS = /^(?:All state, private, and unincorporated lands within|All unincorporated private and all state lands within the following area: All of) (.+?) counties\b/i;
const PARK_LANDS = /^All lands within .+ State Park in ([a-z ]+) County\.?$/i;

function ffslCounties(area: string) {
  if (STATE_LANDS.test(area)) return COUNTIES;
  const single = COUNTY_LANDS.exec(area)?.[1] ?? PARK_LANDS.exec(area)?.[1];
  const multiple = MULTI_COUNTY_LANDS.exec(area)?.[1];
  const names = single ? [single] : multiple?.split(/\s*(?:,\s*(?:and\s+)?|\s+and\s+)/i) ?? [];
  const counties = names.map((name) => countyByName(META.state, name));
  return counties.every((county) => county !== undefined) ? [...new Set(counties)] : [];
}

// The footprints of these reservation-wide orders were reviewed against county
// boundaries. Require the publisher's area description and shape area to match.
const RESERVATIONS = {
  "5-Navajo": {
    area: "The Navajo Nation", shapeArea: 8107679335.5898438,
    counties: ["49037"], sourceName: "Navajo Nation",
  },
  "6-Ute": {
    area: "All lands located within the Uintah and Ouray Indian Reservation", shapeArea: 7369682310.4648438,
    counties: ["49007", "49013", "49019", "49047", "49051"], sourceName: "Ute Indian Tribe and Bureau of Indian Affairs",
  },
};

function orderScope(order: Order, area: string) {
  if (order.Agency === "1-FFSL" && STAGES.has(order.RestrictionType)) {
    return { counties: ffslCounties(area), sourceName: META.sourceName, label: `${order.RestrictionType} fire restriction` };
  }
  const navajo = order.Agency === "5-Navajo" && STAGES.has(order.RestrictionType);
  const ute = order.Agency === "6-Ute" && order.RestrictionType === "Prevention Order";
  if (!navajo && !ute) return;
  const reservation = RESERVATIONS[navajo ? "5-Navajo" : "6-Ute"];
  if (area !== reservation.area || order.Shape__Area !== reservation.shapeArea) return;
  return {
    ...reservation,
    counties: reservation.counties.map((fips) => COUNTY_BY_FIPS.get(fips)),
    label: navajo ? `${order.RestrictionType} fire restriction` : "Reservation fire restriction",
  };
}

export function parseUtahOrders(metadata: unknown, data: unknown, now: Date): CountyStatus[] {
  const { editingInfo } = LAYER_SCHEMA.parse(metadata);
  const report = arcgisEditWindow(editingInfo.dataLastEditDate, now, MAX_LAYER_AGE_MS);
  if (!report) throw new Error("Utah FFSL: stale or invalid order register edit date");
  const checked = now.toISOString();
  const { date: today } = localClock(now, ZONE);
  const seen = new Set<number>();
  const rows: CountyStatus[] = [];
  for (const feature of arcgisRows(data, { allowEmpty: true, requireComplete: true })) {
    const order = ORDER_SCHEMA.parse(feature);
    if (seen.has(order.OBJECTID)) throw new Error("Utah FFSL: duplicate order feature");
    seen.add(order.OBJECTID);
    if (!PUBLISHED_STATUSES.has(order.Status) || order.Campfire_etc !== 1) continue;
    const since = arcgisDateOnly(order.EffectiveDate);
    const expires = arcgisDateOnly(order.RescindedDate);
    if (!since || since > today || (expires && expires <= today)) continue;
    // The register publishes dates only. Wait until the start date has passed
    // if the publisher still marks the order as scheduled.
    if (order.Status === "Future" && since === today) continue;
    if (!expires && (order.RescindedDate !== null || order.Link_Rescind?.trim() || SCHEDULED_END.has(order.Status))) continue;
    const area = order.AreaDescription?.trim().replace(/\s+/g, " ");
    const signed = SIGNED_URL.safeParse(order.Link);
    if (!area || !signed.success) continue;
    const scope = orderScope(order, area);
    if (!scope) continue;
    const rescinds = expires && atLocalTime(expires, 0, ZONE);
    const validUntil = rescinds && rescinds < report.validUntil ? rescinds : report.validUntil;
    for (const county of scope.counties) {
      if (!county) continue;
      rows.push({
        fips: county.fips, county: county.name, state: META.state, sourceId: META.id,
        scope: META.scope, scopeNote: area, status: "restricted", label: scope.label,
        note: `Open-fire restrictions apply in the area described by ${order.OrderNum ? `order ${order.OrderNum}` : "the signed order"}. Read the order for boundaries, exceptions and exact effective times.`,
        since, expires, checked, validUntil, sourceUpdated: report.sourceUpdated,
        sourceName: scope.sourceName, sourceUrl: META.sourceUrl, officialUrl: signed.data,
      });
    }
  }
  return rows;
}

export const utFfslFireOrders: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only", keepRowLinks: true,
  cadence: { kind: "daily", zone: ZONE, hours: [2, 8, 14, 20] },
  staleMs: 24 * 3_600_000,
  async fetch({ now }) {
    const read = pacedTextReader({ headers: { accept: "application/json", "cache-control": "no-cache" }, maxBytes: 250_000 });
    const metadata: unknown = JSON.parse(await read(UT_ORDERS_LAYER_URL));
    const data: unknown = JSON.parse(await read(META.sourceUrl));
    return { rows: parseUtahOrders(metadata, data, now) };
  },
};
