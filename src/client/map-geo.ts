// Planar lon/lat: the /map/ geometry is AlbersUSA, stored as the lon/lat that Web Mercator maps back
// to the projected point (see scripts/build-map.ts). These helpers convert between projected pixels
// and planar lon/lat. Real lon/lat goes through AlbersUSA in map-albers.ts (loaded only when needed).

/** d3 geoAlbersUsa defaults: the lower 48 fill roughly 960 x 600 projected pixels. */
const scale = 1070;
const cx = 480;
const cy = 250;
/** Projected pixels per full Mercator world width. Larger keeps the map near the equator, where Mercator is near linear. */
const WORLD = 4096;

export const PLANAR = {
  scale,
  cx,
  cy,
  xyToLonLat(x: number, y: number): [number, number] {
    const lon = ((x - cx) / WORLD) * 360;
    const lat = (Math.atan(Math.sinh((-2 * Math.PI * (y - cy)) / WORLD)) * 180) / Math.PI;
    return [lon, lat];
  },
  lonLatToXy(lon: number, lat: number): [number, number] {
    const x = (lon / 360) * WORLD + cx;
    const phi = (lat * Math.PI) / 180;
    const y = cy - (Math.log(Math.tan(Math.PI / 4 + phi / 2)) * WORLD) / (2 * Math.PI);
    return [x, y];
  },
};
