// Build-time state outlines for the state list: one small SVG path per state, drawn from the
// us-atlas `states` object already in public/data/counties.topo.json. Never shipped as JS.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { STATE_BY_ABBR } from "../shared/states-fips";

/** Outlines are drawn into a 24 x 24 box. */
export const ICON_BOX = 24;
const PAD = 1.5;
/** Square states would look heavier than long thin ones at the same width; cap the filled box area. */
const MAX_FILL = 0.6;
/** Douglas-Peucker tolerance in output units. */
const TOLERANCE = 0.22;

type XY = [number, number];

let cache: Map<string, string> | null = null;

/** SVG path data for a state outline in a 24 x 24 viewBox, or null when the state is too small to draw (DC). */
export function stateOutline(abbr: string): string | null {
  if (!cache) cache = buildAll();
  return cache.get(abbr) ?? null;
}

function buildAll(): Map<string, string> {
  const topo = JSON.parse(readFileSync(join(process.cwd(), "public/data/counties.topo.json"), "utf8")) as Topology;
  const fc = feature(topo, topo.objects.states as GeometryCollection);
  const out = new Map<string, string>();
  for (const f of fc.features as Feature<Polygon | MultiPolygon>[]) {
    const fips = String(f.id).padStart(2, "0");
    const abbr = Object.values(STATE_BY_ABBR).find((s) => s.fips === fips)?.abbr;
    if (!abbr || abbr === "DC") continue;
    const d = drawState(f, abbr === "AK");
    if (d) out.set(abbr, d);
  }
  return out;
}

function drawState(f: Feature<Polygon | MultiPolygon>, wrapDateLine: boolean): string | null {
  const polys: Position[][][] = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  // Outer rings only: holes are invisible at this size.
  let rings = polys.map((p) => p[0].map(([lon, lat]) => [wrapDateLine && lon > 0 ? lon - 360 : lon, lat] as XY));

  // Drop specks (tiny islands) relative to the largest landmass, so the bounding box fits the shape people know.
  const areas = rings.map((r) => Math.abs(ringArea(r)));
  const biggest = Math.max(...areas);
  rings = rings.filter((_, i) => areas[i] >= biggest * 0.004);

  const lats = rings.flat().map((p) => p[1]);
  const k = Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
  const projected = rings.map((r) => r.map(([lon, lat]) => [lon * k, -lat] as XY));

  const xs = projected.flat().map((p) => p[0]);
  const ys = projected.flat().map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = x1 - x0;
  const h = y1 - y0;
  const room = ICON_BOX - PAD * 2;
  const s = Math.min(room / w, room / h, Math.sqrt((room * room * MAX_FILL) / (w * h)));
  const dx = (ICON_BOX - w * s) / 2;
  const dy = (ICON_BOX - h * s) / 2;

  const parts: string[] = [];
  for (const r of projected) {
    const pts = simplify(
      r.map(([x, y]) => [(x - x0) * s + dx, (y - y0) * s + dy] as XY),
      TOLERANCE,
    );
    if (pts.length < 4 || Math.abs(ringArea(pts)) < 0.25) continue;
    const coords = pts.slice(0, -1).map(([x, y]) => `${round(x)} ${round(y)}`);
    parts.push(`M${coords.join("L")}Z`);
  }
  return parts.length ? parts.join("") : null;
}

function round(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function ringArea(r: XY[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}

/** Douglas-Peucker on a closed ring (first point repeated at the end). */
function simplify(pts: XY[], tol: number): XY[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  // Split the ring at its farthest point from the start so both halves have distinct endpoints.
  let far = 0;
  let farD = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > farD) [far, farD] = [i, d];
  }
  keep[far] = 1;
  const stack: [number, number][] = [
    [0, far],
    [far, pts.length - 1],
  ];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let idx = -1;
    let max = tol;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i], pts[a], pts[b]);
      if (d > max) [idx, max] = [i, d];
    }
    if (idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function segDist(p: XY, a: XY, b: XY): number {
  const [x, y] = p;
  const [x1, y1] = a;
  const dx = b[0] - x1;
  const dy = b[1] - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
