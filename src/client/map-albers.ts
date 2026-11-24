// Real lon/lat <-> planar lon/lat for the /map/ geometry. Loaded on demand (locate me, dropped pins),
// so d3-geo stays out of the map's first load.
import { geoAlbersUsa } from "d3-geo";
import { PLANAR } from "./map-geo";

const projection = geoAlbersUsa().scale(PLANAR.scale).translate([PLANAR.cx, PLANAR.cy]);

/** Real lon/lat to the map's planar lon/lat, or null outside the 50 states. */
export function toPlanar(lon: number, lat: number): [number, number] | null {
  const xy = projection([lon, lat]);
  return xy ? PLANAR.xyToLonLat(xy[0], xy[1]) : null;
}

/** The map's planar lon/lat back to real lon/lat, or null over water between the insets. */
export function fromPlanar(lon: number, lat: number): [number, number] | null {
  const [x, y] = PLANAR.lonLatToXy(lon, lat);
  return projection.invert?.([x, y]) ?? null;
}
