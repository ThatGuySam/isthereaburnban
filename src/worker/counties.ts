import countiesData from "../data/counties.json";
import statesData from "../data/states.json";
import { bareCountyKey } from "../shared/slug";
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

const byStateKey = new Map<string, County>();
for (const c of COUNTIES) byStateKey.set(`${c.state}:${matchKey(c.name)}`, c);

const ALIASES: Record<string, string> = { "FL:dade": "FL:miamidade", "MT:lewisclark": "MT:lewisandclark" };

export function countyByName(state: string, name: string): County | undefined {
  const k = `${state}:${matchKey(name)}`;
  return byStateKey.get(ALIASES[k] ?? k);
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
