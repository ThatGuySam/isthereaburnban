import { getText } from "../sources/lib/http";
import type { BanStatus, CountyStatus } from "../../shared/types";
import { COUNTY_BY_FIPS, countiesInState, countyByName, type County } from "../counties";
import { layerMetadata, msToIso, queryArcgis, type ArcgisResponse } from "../sources/lib/arcgis";

export type Adapter = {
  id: string;
  state: string;
  mode: "full" | "positive-only";
  sourceName: string;
  sourceUrl: string;
  officialUrl: string;
  /** true if rows may carry their own per-county official link (e.g. a signed order) */
  keepRowLinks?: boolean;
  fetch(now?: Date): Promise<CountyStatus[]>;
};

export type Meta = Pick<Adapter, "state" | "sourceName" | "sourceUrl" | "officialUrl">;

export type Row = {
  county: County | undefined;
  status: BanStatus;
  label: string;
  since?: string | null;
  expires?: string | null;
  sourceUpdated?: string | null;
  validFrom?: string;
  validUntil?: string;
  officialUrl?: string;
  note?: string;
  scope?: CountyStatus["scope"];
  scopeNote?: string;
  standing?: true;
  scopedBan?: true;
};

export { getText };
export { arcgisRows, arcgisUrl, msToIso, type ArcgisResponse } from "../sources/lib/arcgis";

export async function getJson<T = unknown>(url: string): Promise<T> {
  return JSON.parse(await getText(url)) as T;
}

export async function completeLayer(layer: string, fields: string[]): Promise<ArcgisResponse> {
  const rows = await queryArcgis(layer, fields, await layerMetadata(layer));
  return { features: rows.map((attributes) => ({ attributes })) };
}

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function byFips(fips: string): County | undefined {
  return COUNTY_BY_FIPS.get(fips);
}

export { countyByName };

export function byPublisherFips(state: string, prefix: string, name: unknown, code: unknown): County {
  const raw = typeof code === "number" ? String(code) : str(code);
  const county = /^\d{1,3}$/.test(raw)
    ? byFips(prefix + raw.padStart(3, "0")) : undefined;
  if (!county || typeof name !== "string" || countyByName(state, name) !== county) {
    throw new Error(`${state}: county name ${str(name)} does not match FIPS ${raw}`);
  }
  return county;
}

export function publisherDate(source: string, value: unknown, nullable = false): string | null {
  const iso = msToIso(value);
  if (!iso && !(nullable && value === null)) throw new Error(`${source}: invalid publisher date`);
  return iso;
}

/** Positive-only adapters may skip unrelated rows. Full editions must account for the entire roster. */
export function toStatuses(meta: Meta, rows: Row[], checked: string, full = false): CountyStatus[] {
  const seen = new Set<string>();
  const out: CountyStatus[] = [];
  for (const r of rows) {
    const c = r.county;
    if (!c || c.state !== meta.state) {
      if (full) throw new Error(`${meta.state}: unrecognized county in full edition`);
      continue;
    }
    if (seen.has(c.fips)) {
      if (full) throw new Error(`${meta.state}: duplicate county ${c.name}`);
      continue;
    }
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
    if (r.validFrom) s.validFrom = r.validFrom;
    if (r.validUntil) s.validUntil = r.validUntil;
    if (r.scope) s.scope = r.scope;
    if (r.scopeNote) s.scopeNote = r.scopeNote;
    if (r.standing) s.standing = true;
    if (r.scopedBan) s.scopedBan = true;
    out.push(s);
  }
  if (full) {
    const missing = countiesInState(meta.state).filter((county) => !seen.has(county.fips));
    if (missing.length) throw new Error(`${meta.state}: full edition missing ${missing.length} counties (first: ${missing[0].name})`);
  }
  if (out.length === 0) throw new Error(`${meta.state}: no rows matched known counties`);
  return out;
}
