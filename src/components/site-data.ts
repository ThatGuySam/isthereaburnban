// Build-time data helpers for the Astro pages (never shipped to the browser).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neighbors } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import countiesJson from "../data/counties.json";
import statesJson from "../data/states.json";
import placesJson from "../data/places.json";
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

// ---------- Places (cities, towns, villages); see scripts/build-places.ts ----------


export type Place = {
  geoid: string;
  name: string;
  lsad: string;
  state: string;
  slug: string;
  counties: string[];
  pop: number;
  lat: number;
  lon: number;
  seatOf?: string[];
};

export const places = placesJson as Place[];

export function placePath(p: Pick<Place, "state" | "slug">): string {
  return `/us/${p.state.toLowerCase()}/city/${p.slug}/`;
}

export function stateCitiesPath(abbr: string): string {
  return `/us/${abbr.toLowerCase()}/city/`;
}

let byCounty: Map<string, Place[]> | null = null;

/** Places with a page that touch this county, largest first. */
export function placesInCounty(fips: string): Place[] {
  if (!byCounty) {
    byCounty = new Map();
    for (const p of places) for (const f of p.counties) (byCounty.get(f) ?? byCounty.set(f, []).get(f)!).push(p);
    for (const list of byCounty.values()) list.sort((a, b) => b.pop - a.pop);
  }
  return byCounty.get(fips) ?? [];
}

export function placesInState(abbr: string): Place[] {
  return places.filter((p) => p.state === abbr).sort((a, b) => a.name.localeCompare(b.name));
}

function km(a: Place, b: Place): number {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

let grid: Map<string, Place[]> | null = null;
const cell = (lat: number, lon: number) => `${Math.floor(lat * 2)}:${Math.floor(lon * 2)}`;

/** Up to `n` other places with pages within `maxKm`, nearest first. Half-degree grid keeps the build fast. */
export function nearbyPlaces(p: Place, n = 6, maxKm = 50): Place[] {
  if (!grid) {
    grid = new Map();
    for (const q of places) {
      const k = cell(q.lat, q.lon);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(q);
    }
  }
  const [la, lo] = [Math.floor(p.lat * 2), Math.floor(p.lon * 2)];
  const out: { q: Place; d: number }[] = [];
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (const q of grid.get(`${la + i}:${lo + j}`) ?? []) {
        if (q.geoid === p.geoid) continue;
        const d = km(p, q);
        if (d <= maxKm) out.push({ q, d });
      }
  return out.sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.q);
}
