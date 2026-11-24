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

const ALIASES: Record<string, string> = { "FL:dade": "FL:miamidade" };

export function countyByName(state: string, name: string): County | undefined {
  const k = `${state}:${matchKey(name)}`;
  return byStateKey.get(ALIASES[k] ?? k);
}

export function countiesInState(state: string): County[] {
  return COUNTIES.filter((c) => c.state === state);
}
