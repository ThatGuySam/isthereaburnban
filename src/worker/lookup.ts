import type { CountyStatus, LookupResult, Snapshot } from "../shared/types";
import { ADAPTERS } from "./adapters";
import { COUNTY_BY_FIPS, countyPath, STATE_DIR_BY_ABBR } from "./counties";
import type { Env } from "./env";

export const DISCLAIMER = "Informational only. Always confirm with the official source before burning.";

export class LookupError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const TRACKED = new Set(ADAPTERS.map((a) => a.state));

/** Status for one county. Never defaults to "none": anything we can't vouch for is "unknown". */
export function statusFor(snapshot: Snapshot, fips: string): CountyStatus {
  const hit = snapshot.counties[fips];
  if (hit) return hit;
  const c = COUNTY_BY_FIPS.get(fips);
  if (!c) throw new LookupError(`unknown county FIPS ${fips}`, 404);
  const dir = STATE_DIR_BY_ABBR.get(c.state);
  const tracked = TRACKED.has(c.state);
  return {
    fips,
    state: c.state,
    county: c.name,
    status: "unknown",
    label: tracked ? "Not in the latest source data" : "We don't track this state yet",
    since: null,
    expires: null,
    sourceUpdated: null,
    checked: snapshot.generated,
    sourceName: dir?.publisher ?? "",
    sourceUrl: "",
    officialUrl: dir?.officialUrl ?? "",
    note: dir?.notes,
  };
}

export function buildResult(query: LookupResult["query"], fipsList: string[], snapshot: Snapshot, approximate = false): LookupResult {
  const results = fipsList.map((f) => ({ ...statusFor(snapshot, f), url: countyPath(f) }));
  return { query, ambiguous: results.length > 1, approximate, results, disclaimer: DISCLAIMER };
}

/** ZIP -> county FIPS list (largest land overlap first). Unknown ZIPs fall back to the nearest ZIP in the same 3-digit shard. */
export async function zipToFips(env: Env, zip: string): Promise<{ fips: string[]; approximate: boolean; matched: string }> {
  if (!/^\d{5}$/.test(zip)) throw new LookupError("zip must be 5 digits");
  const res = await env.ASSETS.fetch(new Request(`https://assets.local/zip/${zip.slice(0, 3)}.json`));
  if (!res.ok) throw new LookupError(`no counties found for ZIP ${zip}`, 404);
  const shard = (await res.json()) as Record<string, string[]>;
  if (shard[zip]) return { fips: shard[zip], approximate: false, matched: zip };
  const target = Number(zip);
  let best = "";
  for (const z of Object.keys(shard)) if (!best || Math.abs(Number(z) - target) < Math.abs(Number(best) - target)) best = z;
  if (!best) throw new LookupError(`no counties found for ZIP ${zip}`, 404);
  return { fips: shard[best], approximate: true, matched: best };
}

/** Coordinates -> county FIPS via the Census geocoder, cached by coords rounded to 3 decimals (~100 m). */
export async function coordsToFips(lat: number, lon: number): Promise<string[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new LookupError("lat and lon must be valid coordinates");
  const x = lon.toFixed(3);
  const y = lat.toFixed(3);
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${x}&y=${y}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`;
  const cache = typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : undefined;
  const key = new Request(url);
  let res = await cache?.match(key);
  if (!res) {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new LookupError(`location lookup failed (Census geocoder HTTP ${res.status})`, 502);
    const body = await res.text();
    res = new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=2592000" } });
    await cache?.put(key, res.clone());
  }
  const json = (await res.json()) as { result?: { geographies?: Record<string, { GEOID?: string }[]> } };
  const counties = json.result?.geographies?.Counties ?? [];
  const fips = counties.map((c) => c.GEOID ?? "").filter((g) => COUNTY_BY_FIPS.has(g));
  if (!fips.length) throw new LookupError("that location is not inside a US county we know", 404);
  return fips;
}

/** Shared entry point for the API, MCP tools and pages. */
export async function lookup(
  env: Env,
  snapshot: Snapshot,
  q: { zip?: string; lat?: number; lon?: number; fips?: string },
): Promise<LookupResult> {
  if (q.zip) {
    const z = await zipToFips(env, q.zip.trim());
    return buildResult({ zip: q.zip.trim() }, z.fips, snapshot, z.approximate);
  }
  if (q.lat !== undefined || q.lon !== undefined) {
    const lat = Number(q.lat);
    const lon = Number(q.lon);
    return buildResult({ lat, lon }, await coordsToFips(lat, lon), snapshot);
  }
  if (q.fips) {
    const f = q.fips.trim();
    if (!/^\d{5}$/.test(f)) throw new LookupError("fips must be a 5-digit county FIPS code");
    return buildResult({ fips: f }, [f], snapshot);
  }
  throw new LookupError("provide zip, lat and lon, fips, or here=1");
}

/** "Yes: Tulsa County, OK has a burn ban (County Burn Ban). Source: ..., checked .... Official: ..." */
export function resultSentence(r: CountyStatus): string {
  const where = `${r.county}, ${r.state}`;
  const checked = /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(r.checked) ? `${r.checked.slice(0, 16)}Z` : r.checked;
  const head =
    r.status === "ban"
      ? `Yes: ${where} has a burn ban (${r.label}).`
      : r.status === "restricted"
        ? `Sort of: ${where} has burning restrictions (${r.label}).`
        : r.status === "none"
          ? `No: ${where} has no burn ban reported by the source.`
          : `Not sure: we can't confirm the burn ban status for ${where} (${r.label}).`;
  const src = r.sourceName ? ` Source: ${r.sourceName}, checked ${checked}.` : "";
  const exp = r.expires ? ` Expires ${r.expires}.` : "";
  return `${head}${exp}${src}${r.officialUrl ? ` Official: ${r.officialUrl}` : ""}`;
}
