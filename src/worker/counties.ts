import countiesData from "../data/counties.json";
import statesData from "../data/states.json";
import { bareCountyKey, countySlug } from "../shared/slug";
import type { StateDirectoryEntry } from "../shared/types";

export type County = { fips: string; state: string; stateFips: string; name: string; slug: string };

export const COUNTIES = countiesData as County[];
export const STATES_DIR = statesData as StateDirectoryEntry[];
export const COUNTY_BY_FIPS = new Map(COUNTIES.map((c) => [c.fips, c]));
export const STATE_DIR_BY_ABBR = new Map(STATES_DIR.map((s) => [s.abbr, s]));

/** Name key that ignores "County"/"Parish", punctuation and spacing ("De Soto" == "DeSoto"). */
export function matchKey(name: string): string {
  return bareCountyKey(name).replace(/\s+/g, "");
}

const qualified = new Map<string, County[]>();
const unqualified = new Map<string, County[]>();
const compact = (slug: string) => slug.replaceAll("-", "");
for (const county of COUNTIES) {
  for (const [index, name] of [[qualified, compact(countySlug(county.name))], [unqualified, matchKey(county.name)]] as const) {
    const key = `${county.state}:${name}`;
    const matches = index.get(key);
    if (matches) matches.push(county);
    else index.set(key, [county]);
  }
}

export type CountyNameResolution =
  | { kind: "matched"; county: County }
  | { kind: "ambiguous"; counties: readonly County[] }
  | { kind: "unmatched" };

export function resolveCountyName(state: string, name: string): CountyNameResolution {
  const slug = countySlug(name).replace(/^(city|county)-of-(.+)$/, "$2-$1");
  const prefix = state.toUpperCase() + ":";
  // A named city, county or parish is a specific jurisdiction. An unmatched
  // qualified name must never fall back to a different kind of jurisdiction.
  const explicit = /-(?:county|parish|borough|census-area|municipality|city)$/.test(slug);
  const exact = qualified.get(prefix + compact(slug));
  const matches = exact ?? (explicit ? undefined : unqualified.get(prefix + matchKey(name)));
  if (!matches?.length) return { kind: "unmatched" };
  if (matches.length > 1) return { kind: "ambiguous", counties: matches };
  return { kind: "matched", county: matches[0] };
}

export function countyByName(state: string, name: string): County | undefined {
  const result = resolveCountyName(state, name);
  if (result.kind === "matched") return result.county;
}

export function countiesInState(state: string): County[] {
  return COUNTIES.filter((c) => c.state === state);
}

/** Canonical county page path, e.g. "/us/ok/tulsa-county/". */
export function countyPath(fips: string): string {
  const c = COUNTY_BY_FIPS.get(fips);
  return c ? `/us/${c.state.toLowerCase()}/${c.slug}/` : "/";
}

/** Keep only known 5-digit county FIPS codes, deduped, at most `max`. */
export function cleanFipsList(input: unknown, max = 20): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(String).filter((f) => COUNTY_BY_FIPS.has(f)))].slice(0, max);
}
