// Builds the /map/ geometry from public/data/counties.topo.json (us-atlas counties-10m).
// Usage: bun scripts/build-map.ts
//
// The map draws an AlbersUSA layout (Alaska and Hawaii as insets) in MapLibre. MapLibre only speaks
// Web Mercator, so each projected point is stored as the lon/lat that Mercator maps back to the same
// spot ("planar lon/lat"). The map then shows AlbersUSA exactly; src/client/map-geo.ts converts
// between real and planar coordinates for geolocation and dropped pins.
//
// Output: public/data/map.topo.json with
//   counties  one polygon per county, id = 5-digit FIPS (string), properties.n = county name
//   states    interior state lines (mesh), drawn as a second layer
//   nation    outer coastline/border (mesh), so the outline stays crisp at low zoom
import { readFileSync, writeFileSync } from "node:fs";
import { geoAlbersUsa } from "d3-geo";
import { feature, mesh, quantize } from "topojson-client";
import { presimplify, simplify, quantile, sphericalTriangleArea } from "topojson-simplify";
import { topology } from "topojson-server";
import type { Topology, GeometryCollection, Objects } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry, MultiLineString, Position } from "geojson";
import { PLANAR } from "../src/client/map-geo";

const SRC = "public/data/counties.topo.json";
const OUT = "public/data/map.topo.json";
// Keep the top 12% of vertices by visual weight: counties stay recognizable at state zoom and
// the file stays small. Raise it if county edges look boxy when zoomed into one state.
const KEEP = 0.12;

const NOT_DRAWN = new Set(["60", "66", "69", "72", "78"]); // territories AlbersUSA has no inset for

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const raw = JSON.parse(readFileSync(SRC, "utf8")) as Topology<Objects<{}>>;
const objs = raw.objects as Record<string, GeometryCollection>;
for (const key of ["counties", "states"]) {
  objs[key].geometries = objs[key].geometries.filter((g) => !NOT_DRAWN.has(String(g.id).slice(0, 2)));
}

const pre = presimplify(raw, sphericalTriangleArea);
const simple = simplify(pre, quantile(pre, 1 - KEEP));

const projection = geoAlbersUsa().scale(PLANAR.scale).translate([PLANAR.cx, PLANAR.cy]);
const toPlanarLonLat = (p: Position): Position => {
  const xy = projection([p[0], p[1]]);
  if (!xy) return [0, 0];
  const [lon, lat] = PLANAR.xyToLonLat(xy[0], xy[1]);
  return [lon, lat];
};

function projectGeometry<G extends Geometry>(g: G): G {
  const ring = (r: Position[]) => r.map(toPlanarLonLat);
  switch (g.type) {
    case "Polygon":
      return { ...g, coordinates: g.coordinates.map(ring) };
    case "MultiPolygon":
      return { ...g, coordinates: g.coordinates.map((p) => p.map(ring)) };
    case "MultiLineString":
      return { ...g, coordinates: g.coordinates.map(ring) };
    case "LineString":
      return { ...g, coordinates: ring(g.coordinates) };
    default:
      return g;
  }
}

const counties = feature(simple, objs.counties) as FeatureCollection<Geometry, { name: string }>;
const countyFeatures: Feature[] = counties.features.map((f) => ({
  type: "Feature",
  id: String(f.id),
  properties: { n: f.properties.name },
  geometry: projectGeometry(f.geometry),
}));
const states = projectGeometry(mesh(simple, objs.states, (a, b) => a !== b) as MultiLineString);
const nation = projectGeometry(mesh(simple, objs.states, (a, b) => a === b) as MultiLineString);

const topo = topology({
  counties: { type: "FeatureCollection", features: countyFeatures },
  states: { type: "Feature", properties: {}, geometry: states },
  nation: { type: "Feature", properties: {}, geometry: nation },
} as never);
// 2e4 steps across the whole extent is ~0.05 projected px per step: under a screen pixel even when one county fills the view.
const out = quantize(topo as unknown as Topology<Objects<{}>>, 2e4);
writeFileSync(OUT, JSON.stringify(out));
const bytes = readFileSync(OUT).byteLength;
console.log(`counties=${countyFeatures.length} arcs=${out.arcs.length} bytes=${bytes}`);
