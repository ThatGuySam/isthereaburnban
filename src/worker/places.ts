// City -> counties for the API and MCP (?city=Tulsa&state=OK).
// Reads the lookup shards written by scripts/build-places.ts (public/data/places/<letter>.json), which list
// every incorporated place, most populous first: [name, state, page path, county FIPS[], primary county name].
import { countySlug } from "../shared/slug";
import { STATE_BY_ABBR } from "../shared/states-fips";
import type { Env } from "./env";
import { LookupError } from "./lookup";

export type PlaceRow = [name: string, state: string, path: string, counties: string[], county: string];
export type PlaceMatch = { name: string; state: string; url: string; counties: string[] };

/** "St. Louis" -> "st louis", "Oklahoma-City" -> "oklahoma city", "Saint Louis" -> "st louis". */
export function placeKey(s: string): string {
  return countySlug(s.trim())
    .replace(/-/g, " ")
    .replace(/^saint /, "st ")
    .replace(/^fort /, "ft ")
    .replace(/^mount /, "mt ");
}

export function shardKey(name: string): string {
  const c = placeKey(name)[0] ?? "";
  return /[a-z]/.test(c) ? c : "0";
}

/** Pure matcher over one shard, so it can be tested without assets. */
export function matchPlace(rows: PlaceRow[], city: string, state?: string): PlaceMatch {
  const key = placeKey(city);
  const st = state?.trim().toUpperCase();
  if (st && !STATE_BY_ABBR[st]) throw new LookupError("state must be a 2-letter US state code");
  // Exact name, or the page slug ("oklahoma-city", "pewaukee-village").
  const slug = countySlug(city);
  const hits = rows.filter(
    (r) => (!st || r[1] === st) && (placeKey(r[0]) === key || r[2].endsWith(`/city/${slug}/`)),
  );
  if (!hits.length) {
    throw new LookupError(`no incorporated city or town named "${city}"${st ? ` in ${st}` : ""}; try zip= or lat= and lon=`, 404);
  }
  const states = [...new Set(hits.map((r) => r[1]))];
  if (states.length > 1) {
    throw new LookupError(`"${city}" matches places in ${states.length} states (${states.join(", ")}); add state=XX`, 400);
  }
  // Rows are sorted by population, so a repeated name (Pewaukee city and village) resolves to the larger one.
  const [name, s, url, counties] = hits[0];
  return { name, state: s, url, counties };
}

export async function resolveCity(env: Env, city: string, state?: string): Promise<PlaceMatch> {
  if (!city.trim() || city.length > 80) throw new LookupError("city must be a place name, e.g. city=Tulsa&state=OK");
  const res = await env.ASSETS.fetch(new Request(`https://assets.local/data/places/${shardKey(city)}.json`));
  if (!res.ok) throw new LookupError(`no incorporated city or town named "${city}"`, 404);
  return matchPlace((await res.json()) as PlaceRow[], city, state);
}
