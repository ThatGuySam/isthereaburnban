// Builds src/data/places.json: incorporated places (cities, towns, villages) with their counties.
// Usage: bun scripts/build-places.ts [cacheDir]   (default ~/.cache/itabb-geo)
//
// Inputs (downloaded into the cache dir, never committed):
//   sub-est2024.csv      Census Vintage 2024 city and town population estimates. SUMLEV 162 rows give
//                        each incorporated place's total; SUMLEV 157 rows split it by county, which orders
//                        a multi-county place's counties by population share.
//                        https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv
//   gaz/2024_Gaz_place_national.txt  2024 Gazetteer places: UTF-8 names, LSAD, GNIS id, internal point.
//                        https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_place_national.zip
//   county-seats.csv     Wikidata (CC0) county seats: county FIPS (P882) -> seat (P36) GNIS id (P590).
//                        Fetched by this script when missing.
//
// Scope (Google spam policy: no thin city doorway pages): a place gets a page when it has at least
// MIN_POP residents or is a county seat. Places that are the same jurisdiction as their county
// (independent cities, DC, consolidated city-counties with ~all of the county) are left out because the
// county page already is that page. Everything else resolves to its county through search.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { feature } from "topojson-client";
import countiesData from "../src/data/counties.json";
import { countySlug } from "../src/shared/slug";
import { STATE_BY_FIPS } from "../src/shared/states-fips";

export const MIN_POP = 5000;

const cache = process.argv[2] ?? join(homedir(), ".cache/itabb-geo");
const counties = countiesData as { fips: string; state: string; name: string; slug: string }[];
const countyByFips = new Map(counties.map((c) => [c.fips, c]));

/** Minimal CSV line parser (quoted fields with commas). */
function csvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") out.push(cur), (cur = "");
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// ---------- population ----------
const popRows = readFileSync(join(cache, "sub-est2024.csv"), "latin1").split(/\r?\n/);
const ph = csvLine(popRows[0]);
const P = (n: string) => ph.indexOf(n);
const [iSum, iSt, iCo, iPl, iPop] = [P("SUMLEV"), P("STATE"), P("COUNTY"), P("PLACE"), P("POPESTIMATE2024")];

const placePop = new Map<string, number>();
const parts = new Map<string, { fips: string; pop: number }[]>();
const countyPop = new Map<string, number>();
for (const line of popRows.slice(1)) {
  if (!line) continue;
  const r = csvLine(line);
  const geo = r[iSt] + r[iPl];
  const pop = Number(r[iPop]) || 0;
  if (r[iSum] === "162") placePop.set(geo, pop);
  else if (r[iSum] === "157" && r[iPl] !== "99990") {
    const arr = parts.get(geo) ?? [];
    arr.push({ fips: r[iSt] + r[iCo], pop });
    parts.set(geo, arr);
  } else if (r[iSum] === "050") countyPop.set(r[iSt] + r[iCo], pop);
}

// ---------- gazetteer ----------
type Gaz = { geoid: string; gnis: string; name: string; lsad: string; lat: number; lon: number; aland: number };
const gaz = new Map<string, Gaz>();
const gl = readFileSync(join(cache, "gaz/2024_Gaz_place_national.txt"), "utf8").split(/\r?\n/);
const gh = gl[0].split("\t").map((s) => s.trim());
const G = (n: string) => gh.indexOf(n);
for (const line of gl.slice(1)) {
  if (!line.trim()) continue;
  const r = line.split("\t").map((s) => s.trim());
  gaz.set(r[G("GEOID")], {
    geoid: r[G("GEOID")],
    gnis: String(Number(r[G("ANSICODE")])),
    name: r[G("NAME")],
    lsad: r[G("LSAD")],
    lat: Number(r[G("INTPTLAT")]),
    lon: Number(r[G("INTPTLONG")]),
    aland: Number(r[G("ALAND")]),
  });
}

// ---------- county seats ----------
const seatsPath = join(cache, "county-seats.csv");
if (!existsSync(seatsPath)) {
  const q = `SELECT ?fips ?seatLabel ?gnis WHERE { ?county wdt:P882 ?fips; wdt:P36 ?seat. OPTIONAL { ?seat wdt:P590 ?gnis } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}`, {
    headers: { accept: "text/csv", "user-agent": "itabb-build/0.1 (geo data build)" },
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  writeFileSync(seatsPath, await res.text());
}
const seatOf = new Map<string, Set<string>>(); // gnis -> county fips
for (const line of readFileSync(seatsPath, "utf8").split(/\r?\n/).slice(1)) {
  const [fips, , gnis] = csvLine(line);
  if (!fips || !gnis || !countyByFips.has(fips)) continue;
  (seatOf.get(gnis) ?? seatOf.set(gnis, new Set()).get(gnis)!).add(fips);
}

// ---------- point in county (Connecticut) ----------
// Census estimates now split Connecticut by planning region, but the site (and the 2020 ZCTA file) still
// uses its eight counties. Those places get their county from the internal point instead.
type Ring = [number, number][];
let shapes: { fips: string; polys: Ring[][] }[] | null = null;
function countyAt(lat: number, lon: number, stateFips: string): string | undefined {
  if (!shapes) {
    const topo = JSON.parse(readFileSync("public/data/counties.topo.json", "utf8"));
    const fc = feature(topo, topo.objects.counties) as unknown as { features: { id: string; geometry: { type: string; coordinates: any } }[] };
    shapes = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({ fips: String(f.id), polys: f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates }));
  }
  const inRing = (r: Ring) => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return shapes.find((s) => s.fips.startsWith(stateFips) && s.polys.some((poly) => inRing(poly[0]) && !poly.slice(1).some(inRing)))?.fips;
}

// ---------- names ----------
const LSAD: Record<string, string> = { "25": "city", "43": "town", "47": "village", "21": "borough", "53": "city and borough", "35": "municipality", "37": "municipality" };
// Consolidated governments whose Census name isn't what anyone searches for.
const NAME_OVERRIDE: Record<string, [string, string]> = {
  "4752006": ["Nashville", "city"],
  "2148006": ["Louisville", "city"],
  "2146027": ["Lexington", "city"],
  "1836003": ["Indianapolis", "city"],
  "1303440": ["Athens", "city"],
  "1304204": ["Augusta", "city"],
  "1349008": ["Macon", "city"],
  "1321017": ["Cusseta", "city"],
  "1332528": ["Georgetown", "city"],
  "3011397": ["Butte", "city"],
  "3001675": ["Anaconda", "city"],
  "4744382": ["Lynchburg", "city"],
  "0947515": ["Milford", "city"],
};
const SUFFIXES = [" city and borough", " metropolitan government", " metro government", " unified government", " consolidated government", " urban county", " municipality", " borough", " village", " town", " city"];

function cleanName(g: Gaz): { name: string; lsad: string } {
  const o = NAME_OVERRIDE[g.geoid];
  if (o) return { name: o[0], lsad: o[1] };
  let name = g.name;
  // One legal suffix only: "Oklahoma City city" -> "Oklahoma City", never "Oklahoma".
  name = name.replace(/ \(balance\)$/, "");
  const s = SUFFIXES.find((x) => name.endsWith(x) && name.length > x.length);
  if (s) name = name.slice(0, -s.length);
  return { name, lsad: LSAD[g.lsad] ?? "city" };
}

// ---------- assemble ----------
export type Place = {
  geoid: string;
  name: string;
  lsad: string;
  state: string;
  slug: string;
  /** county FIPS, largest population share first */
  counties: string[];
  pop: number;
  lat: number;
  lon: number;
  /** counties this place is the seat of */
  seatOf?: string[];
};

type Candidate = Place & { page: boolean };
const all: Candidate[] = [];
let skippedSame = 0;
for (const [geoid, pop] of placePop) {
  const st = STATE_BY_FIPS[geoid.slice(0, 2)];
  const g = gaz.get(geoid);
  if (!st || !g) continue;
  const seat = [...(seatOf.get(g.gnis) ?? [])].filter((f) => f.startsWith(geoid.slice(0, 2)));
  let cs = (parts.get(geoid) ?? []).filter((p) => countyByFips.has(p.fips) && p.pop > 0).sort((a, b) => b.pop - a.pop);
  if (!cs.length) {
    const f = countyAt(g.lat, g.lon, geoid.slice(0, 2));
    if (!f || !countyByFips.has(f)) continue;
    cs = [{ fips: f, pop }];
  }
  // Same jurisdiction as the county (Richmond city VA, Carson City, DC, Philadelphia): the county page covers it.
  const sameAsCounty = cs.length === 1 && pop >= 0.97 * (countyPop.get(cs[0].fips) ?? Infinity);
  const page = !sameAsCounty && (pop >= MIN_POP || seat.length > 0);
  if (sameAsCounty) skippedSame++;
  const { name, lsad } = cleanName(g);
  all.push({
    geoid,
    name,
    lsad,
    state: st.abbr,
    slug: countySlug(name),
    counties: cs.map((c) => c.fips),
    pop,
    lat: Math.round(g.lat * 1e4) / 1e4,
    lon: Math.round(g.lon * 1e4) / 1e4,
    ...(seat.length ? { seatOf: seat.sort() } : {}),
    page,
  });
}
const out: Place[] = all.filter((p) => p.page).map(({ page: _, ...p }) => p);

// Unique slugs per state: "pewaukee" (city) and "pewaukee-village".
out.sort((a, b) => a.state.localeCompare(b.state) || a.slug.localeCompare(b.slug) || b.pop - a.pop);
const seen = new Set<string>();
for (const p of out) {
  let k = `${p.state}/${p.slug}`;
  if (seen.has(k)) {
    p.slug = `${p.slug}-${countySlug(p.lsad)}`;
    k = `${p.state}/${p.slug}`;
  }
  if (seen.has(k)) {
    p.slug = `${p.slug}-${countyByFips.get(p.counties[0])!.slug}`;
    k = `${p.state}/${p.slug}`;
  }
  if (seen.has(k)) throw new Error(`duplicate slug ${k}`);
  seen.add(k);
}

writeFileSync("src/data/places.json", JSON.stringify(out));

// Lookup shards for every incorporated place, by first letter: public/data/places/t.json
//   [name, state, page path, county FIPS[], primary county name]
// Used by the /us/ type-ahead and the city= API. Places without a page point at their county page.
const slugOf = new Map(out.map((p) => [p.geoid, p.slug]));
const shards = new Map<string, unknown[][]>();
for (const p of all.sort((a, b) => b.pop - a.pop)) {
  const key = countySlug(p.name)[0] ?? "_";
  const k = /[a-z]/.test(key) ? key : "0";
  const st = p.state.toLowerCase();
  const primary = countyByFips.get(p.counties[0])!;
  const path = p.page ? `/us/${st}/city/${slugOf.get(p.geoid)}/` : `/us/${st}/${primary.slug}/`;
  (shards.get(k) ?? shards.set(k, []).get(k)!).push([p.name, p.state, path, p.counties, primary.name]);
}
rmSync("public/data/places", { recursive: true, force: true });
mkdirSync("public/data/places", { recursive: true });
for (const [k, rows] of shards) writeFileSync(`public/data/places/${k}.json`, JSON.stringify(rows));
const seats = out.filter((p) => p.seatOf).length;
const small = out.filter((p) => p.pop < MIN_POP).length;
const multi = out.filter((p) => p.counties.length > 1).length;
const countiesWithSeat = new Set(out.flatMap((p) => p.seatOf ?? [])).size;
console.log(
  `places=${out.length} (pop>=${MIN_POP}: ${out.length - small}, seats under ${MIN_POP}: ${small}) seats=${seats} countiesWithSeatPage=${countiesWithSeat}/${counties.length} multiCounty=${multi} skippedSameAsCounty=${skippedSame} lookupPlaces=${all.length} shards=${shards.size}`,
);
