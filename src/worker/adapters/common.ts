import type { BanStatus, CountyStatus } from "../../shared/types";
import { COUNTY_BY_FIPS, countyByName, type County } from "../counties";

export type Adapter = {
  id: string;
  state: string;
  mode: "full" | "positive-only";
  sourceName: string;
  sourceUrl: string;
  officialUrl: string;
  /** true if rows may carry their own per-county official link (e.g. a signed order) */
  keepRowLinks?: boolean;
  fetch(): Promise<CountyStatus[]>;
};

export type Meta = Pick<Adapter, "state" | "sourceName" | "sourceUrl" | "officialUrl">;

export type Row = {
  county: County | undefined;
  status: BanStatus;
  label: string;
  since?: string | null;
  expires?: string | null;
  sourceUpdated?: string | null;
  officialUrl?: string;
  note?: string;
};

const UA = { "user-agent": "isthereaburnban.com status checker", accept: "application/json, text/plain, */*" };

export async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

export async function getJson<T = unknown>(url: string): Promise<T> {
  return JSON.parse(await getText(url)) as T;
}

export type ArcgisResponse = { features?: { attributes: Record<string, unknown> }[]; error?: { message?: string } };

/** Query every row of an ArcGIS FeatureServer layer, attributes only. */
export function arcgisUrl(layer: string, fields: string[]): string {
  const q = new URLSearchParams({ where: "1=1", outFields: fields.join(","), returnGeometry: "false", f: "json" });
  return `${layer}/query?${q}`;
}

export function arcgisRows(json: ArcgisResponse): Record<string, unknown>[] {
  if (json.error) throw new Error(`ArcGIS error: ${json.error.message ?? "unknown"}`);
  if (!Array.isArray(json.features) || json.features.length === 0) throw new Error("ArcGIS returned no features");
  return json.features.map((f) => f.attributes);
}

export function msToIso(v: unknown): string | null {
  return typeof v === "number" && Number.isFinite(v) ? new Date(v).toISOString() : null;
}

export function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function byFips(fips: string): County | undefined {
  return COUNTY_BY_FIPS.get(fips);
}

export { countyByName };

/** Turn parsed rows into CountyStatus records, dropping rows we can't place and duplicate counties. */
export function toStatuses(meta: Meta, rows: Row[], checked: string): CountyStatus[] {
  const seen = new Set<string>();
  const out: CountyStatus[] = [];
  for (const r of rows) {
    const c = r.county;
    if (!c || c.state !== meta.state || seen.has(c.fips)) continue;
    seen.add(c.fips);
    const s: CountyStatus = {
      fips: c.fips,
      state: c.state,
      county: c.name,
      status: r.status,
      label: r.label,
      since: r.since ?? null,
      expires: r.expires ?? null,
      sourceUpdated: r.sourceUpdated ?? null,
      checked,
      sourceName: meta.sourceName,
      sourceUrl: meta.sourceUrl,
      officialUrl: r.officialUrl || meta.officialUrl,
    };
    if (r.note) s.note = r.note;
    out.push(s);
  }
  if (out.length === 0) throw new Error(`${meta.state}: no rows matched known counties`);
  return out;
}
