import { parseLocalDateTime, parseUsDate, reportWindow } from "./dates";
import { getText } from "./http";

// Inventory stacks: ArcGIS FeatureServer, MapServer, Online and Experience, including the IN WebEOC export.
export type Attributes = Record<string, unknown>;
export type ArcgisResponse = {
  features?: { attributes: Attributes }[];
  exceededTransferLimit?: boolean;
  error?: { message?: string };
};

export function arcgisUrl(layer: string, fields: string[], extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ where: "1=1", outFields: fields.join(","), returnGeometry: "false", f: "json", ...extra });
  return `${layer.replace(/\/$/, "")}/query?${q}`;
}

/** Query unique attribute combinations without transferring the underlying features. */
export function arcgisDistinctUrl(layer: string, fields: string[], where = "1=1"): string {
  return arcgisUrl(layer, fields, { where, returnDistinctValues: "true" });
}

function isRecord(value: unknown): value is Attributes {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function arcgisRows(json: unknown, { allowEmpty = false, requireComplete = false } = {}): Attributes[] {
  if (!isRecord(json)) throw new Error("Unexpected ArcGIS JSON");
  if (json.error) {
    const message = isRecord(json.error) && typeof json.error.message === "string" ? json.error.message : "unknown";
    throw new Error(`ArcGIS error: ${message}`);
  }
  if (requireComplete && json.exceededTransferLimit === true) throw new Error("Incomplete ArcGIS response");
  if (!Array.isArray(json.features) || (!allowEmpty && !json.features.length)) {
    throw new Error("ArcGIS returned no features");
  }
  return json.features.map((feature: unknown) => {
    if (!isRecord(feature) || !isRecord(feature.attributes)) throw new Error("ArcGIS feature has no attributes");
    return feature.attributes;
  });
}

export function msToIso(v: unknown): string | null {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 8.64e15 ? new Date(v).toISOString() : null;
}

/** ArcGIS esriFieldTypeDateOnly values are calendar dates without a time or offset. */
export function arcgisDateOnly(value: unknown): string | null {
  return typeof value === "string" && parseUsDate(value) === value ? value : null;
}

/** Bound a row's freshness by its own UTC edit date, even if other features are edited later. */
export function arcgisEditWindow(value: unknown, now: Date, maxAgeMs: number) {
  return reportWindow(msToIso(value), now, maxAgeMs);
}

/** For layers verified to encode local wall-clock time as epoch milliseconds. */
export function arcgisLocalDate(value: unknown, zone: string): string | null {
  const iso = msToIso(value);
  if (!iso) return null;
  const local = parseLocalDateTime(iso.slice(0, 19), zone);
  return local && local.slice(0, -5) + iso.slice(-5);
}

export type LayerMetadata = {
  objectIdField?: string;
  maxRecordCount?: number;
  advancedQueryCapabilities?: { supportsPagination?: boolean };
  editingInfo?: { dataLastEditDate?: number };
  dataLastEditDate?: number;
  fields?: { name: string; type?: string; domain?: { codedValues?: { code: string | number; name: string }[] } }[];
};

export const dataLastEditDate = (layer: LayerMetadata) => msToIso(layer.editingInfo?.dataLastEditDate ?? layer.dataLastEditDate);

export function codedDomains(layer: LayerMetadata): Map<string, Map<string | number, string>> {
  const out = new Map<string, Map<string | number, string>>();
  for (const { name, domain } of layer.fields ?? []) {
    if (domain?.codedValues) out.set(name, new Map(domain.codedValues.map(({ code, name }) => [code, name])));
  }
  return out;
}

type JsonReader = (url: string) => Promise<unknown>;
const readJson: JsonReader = async (url) => JSON.parse(await getText(url));
function checked<T>(data: unknown): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Unexpected ArcGIS JSON");
  const error = (data as ArcgisResponse).error;
  if (error) throw new Error(`ArcGIS error: ${error.message ?? "unknown"}`);
  return data as T;
}

export async function layerMetadata(layer: string, read = readJson): Promise<LayerMetadata> {
  return checked(await read(`${layer}?f=json`));
}

/** Stable attribute paging, with ID batching for layers without offset support. Never return a truncated result. */
export async function queryArcgis(layer: string, fields: string[], meta: LayerMetadata, {
  where = "1=1", maxPages = 20, read = readJson,
} = {}): Promise<Attributes[]> {
  const size = Math.max(1, Math.min(meta.maxRecordCount ?? 1000, 1000));
  const oid = meta.objectIdField ?? meta.fields?.find((f) => f.type === "esriFieldTypeOID")?.name;
  const rows: Attributes[] = [];
  if (!meta.advancedQueryCapabilities?.supportsPagination || !oid) {
    const idsUrl = arcgisUrl(layer, [], { where, returnIdsOnly: "true" });
    const result = checked<{ objectIds?: number[] }>(await read(idsUrl));
    if (!Array.isArray(result.objectIds)) throw new Error("ArcGIS query did not return object IDs");
    if (result.objectIds.length > size * maxPages) throw new Error("ArcGIS page limit exceeded");
    for (let start = 0; start < result.objectIds.length; start += size) {
      const ids = result.objectIds.slice(start, start + size);
      const data = checked<ArcgisResponse>(await read(arcgisUrl(layer, fields, { where, objectIds: ids.join(",") })));
      const page = arcgisRows(data, { allowEmpty: true });
      if (data.exceededTransferLimit || page.length !== ids.length) throw new Error("Incomplete ArcGIS ID page");
      rows.push(...page);
    }
    return rows;
  }
  for (let page = 0; page < maxPages; page++) {
    const url = arcgisUrl(layer, fields, {
      where, orderByFields: `${oid} ASC`, resultOffset: String(rows.length), resultRecordCount: String(size),
    });
    const data = checked<ArcgisResponse>(await read(url));
    const chunk = arcgisRows(data, { allowEmpty: true });
    rows.push(...chunk);
    if (data.exceededTransferLimit === false || (data.exceededTransferLimit == null && chunk.length < size)) return rows;
    if (chunk.length === 0) throw new Error("ArcGIS returned an empty page with more rows");
  }
  throw new Error("ArcGIS page limit exceeded");
}

type LayerRef = { id?: string; title?: string; url?: string; itemId?: string };
const ITEM_ID = /^[a-f0-9]{32}$/i;
const ITEM_URL = /(?:[?&]id=|\/items\/|\/experiences?\/|\/dashboards\/)([a-f0-9]{32})(?![a-f0-9])/gi;

/** Find web-map operationalLayers reachable from a Dashboard or Experience, including grouped layers. */
export async function findOperationalLayers(rootId: string, { read = readJson, portal = "https://www.arcgis.com", maxItems = 16 } = {}): Promise<LayerRef[]> {
  if (!ITEM_ID.test(rootId)) throw new Error("Invalid ArcGIS item ID");
  const pending = new Set([rootId.toLowerCase()]);
  const visited = new Set<string>();
  const layers: LayerRef[] = [];
  function scan(value: unknown, key = "", layer = false) {
    if (typeof value === "string") {
      if (/(?:item.?id|map.?id|^map$|^item$|^webmap$)/i.test(key) && ITEM_ID.test(value)) pending.add(value.toLowerCase());
      if (/(?:url|uri|src|link)/i.test(key)) {
        for (const match of value.matchAll(ITEM_URL)) pending.add(match[1].toLowerCase());
      }
    } else if (Array.isArray(value)) {
      for (const child of value) scan(child, key, layer || key === "operationalLayers");
    } else if (value && typeof value === "object") {
      const node = value as Record<string, unknown>;
      if (layer && (typeof node.url === "string" || typeof node.itemId === "string" || "featureCollection" in node)) {
        layers.push(node as LayerRef);
      }
      for (const [name, child] of Object.entries(node)) {
        // An operational layer's itemId points to a leaf service, not another web map.
        if (name === "baseMap" || (layer && name === "itemId")) continue;
        scan(child, name, layer && name === "layers");
      }
    }
  }
  while (pending.size) {
    const id = pending.values().next().value!;
    pending.delete(id);
    if (visited.has(id)) continue;
    if (visited.size >= maxItems) throw new Error("ArcGIS item traversal limit exceeded");
    visited.add(id);
    const data = await read(`${portal}/sharing/rest/content/items/${id}/data?f=json`);
    if (data != null) scan(checked(data));
  }
  return layers;
}
