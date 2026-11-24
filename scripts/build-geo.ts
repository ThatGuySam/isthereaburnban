// Builds county list, ZIP->county shards and the browse-map TopoJSON from Census data.
// Usage: bun scripts/build-geo.ts <zcta_county.txt> <counties-10m.json>
// Sources:
//   https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt
//   https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { STATE_BY_FIPS } from "../src/shared/states-fips";
import { countySlug } from "../src/shared/slug";

const [zctaPath, topoPath] = process.argv.slice(2);
if (!zctaPath || !topoPath) throw new Error("usage: build-geo.ts <zcta_county.txt> <counties-10m.json>");

const lines = readFileSync(zctaPath, "utf8").replace(/^﻿/, "").split(/\r?\n/);
const header = lines[0].split("|");
const col = (n: string) => header.indexOf(n);
const iZ = col("GEOID_ZCTA5_20"), iC = col("GEOID_COUNTY_20"), iN = col("NAMELSAD_COUNTY_20"), iA = col("AREALAND_PART");

type County = { fips: string; state: string; stateFips: string; name: string; slug: string };
const counties = new Map<string, County>();
const zips = new Map<string, { fips: string; area: number }[]>();

for (const line of lines.slice(1)) {
  if (!line.trim()) continue;
  const p = line.split("|");
  const fips = p[iC];
  const st = STATE_BY_FIPS[fips.slice(0, 2)];
  if (!st) continue; // territories
  if (!counties.has(fips)) counties.set(fips, { fips, state: st.abbr, stateFips: fips.slice(0, 2), name: p[iN], slug: countySlug(p[iN]) });
  const z = p[iZ];
  const area = Number(p[iA]) || 0;
  if (!z || area <= 0) continue;
  const arr = zips.get(z) ?? [];
  arr.push({ fips, area });
  zips.set(z, arr);
}

// counties.json sorted by state then name
const list = [...counties.values()].sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
writeFileSync("src/data/counties.json", JSON.stringify(list));

// ZIP shards by first 3 digits: { "74103": ["40143"], "74008": ["40143","40145"] } ordered by land overlap
rmSync("public/zip", { recursive: true, force: true });
mkdirSync("public/zip", { recursive: true });
const shards = new Map<string, Record<string, string[]>>();
for (const [z, arr] of zips) {
  const k = z.slice(0, 3);
  const shard = shards.get(k) ?? {};
  shard[z] = arr.sort((a, b) => b.area - a.area).map((x) => x.fips);
  shards.set(k, shard);
}
for (const [k, shard] of shards) writeFileSync(`public/zip/${k}.json`, JSON.stringify(shard));

// Browse map: copy us-atlas TopoJSON (counties + states objects, ids are 5-digit FIPS)
mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/counties.topo.json", readFileSync(topoPath));

console.log(`counties=${list.length} zips=${zips.size} shards=${shards.size} multiCounty=${[...zips.values()].filter((a) => a.length > 1).length}`);
