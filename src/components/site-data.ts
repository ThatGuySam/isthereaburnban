// Build-time data helpers for the Astro pages (never shipped to the browser).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neighbors } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import countiesJson from "../data/counties.json";
import statesJson from "../data/states.json";
import type { StateDirectoryEntry } from "../shared/types";

export type County = { fips: string; state: string; stateFips: string; name: string; slug: string };

export const SITE = "https://isthereaburnban.com";
export const counties = countiesJson as County[];
export const states = (statesJson as StateDirectoryEntry[]).slice().sort((a, b) => a.name.localeCompare(b.name));
export const stateByAbbr: Record<string, StateDirectoryEntry> = Object.fromEntries(states.map((s) => [s.abbr, s]));
export const countyByFips: Record<string, County> = Object.fromEntries(counties.map((c) => [c.fips, c]));

export function countiesIn(abbr: string): County[] {
  return counties.filter((c) => c.state === abbr).sort((a, b) => a.name.localeCompare(b.name));
}

export function countyPath(c: Pick<County, "state" | "slug">): string {
  return `/us/${c.state.toLowerCase()}/${c.slug}/`;
}

export function statePath(abbr: string): string {
  return `/us/${abbr.toLowerCase()}/`;
}

export const COVERAGE_LABEL: Record<StateDirectoryEntry["coverage"], string> = {
  live: "Live county status",
  restrictions: "Restrictions feed",
  directory: "Official links only",
};

// us-atlas (2017) still has Valdez-Cordova (02261); Census 2020 split it into 02063 and 02066.
const TOPO_ALIAS: Record<string, string> = { "02063": "02261", "02066": "02261" };

let neighborMap: Map<string, string[]> | null = null;

/** Real adjacency from the county TopoJSON (shared arcs), computed once per build. */
export function countyNeighbors(fips: string): County[] {
  if (!neighborMap) {
    const topo = JSON.parse(readFileSync(join(process.cwd(), "public/data/counties.topo.json"), "utf8")) as Topology;
    const geoms = (topo.objects.counties as GeometryCollection).geometries;
    const ids = geoms.map((g) => String(g.id));
    const adj = neighbors(geoms as any);
    neighborMap = new Map(ids.map((id, i) => [id, adj[i].map((j) => ids[j])]));
    // Expand the alias: neighbors of 02261 become neighbors of both halves, and the halves border each other.
    const vc = neighborMap.get("02261") ?? [];
    for (const half of ["02063", "02066"]) {
      const other = half === "02063" ? "02066" : "02063";
      neighborMap.set(half, [...vc, other]);
    }
    for (const id of vc) {
      const list = neighborMap.get(id) ?? [];
      neighborMap.set(id, [...list.filter((x) => x !== "02261"), "02063", "02066"]);
    }
  }
  const key = TOPO_ALIAS[fips] && !neighborMap.has(fips) ? TOPO_ALIAS[fips] : fips;
  return (neighborMap.get(key) ?? [])
    .map((id) => countyByFips[id])
    .filter((c): c is County => Boolean(c) && c.fips !== fips)
    .sort((a, b) => (a.state === b.state ? a.name.localeCompare(b.name) : a.state.localeCompare(b.state)));
}
