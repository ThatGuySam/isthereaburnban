// /map/: county burn ban map drawn with MapLibre GL (WebGL), no basemap and no tile server.
//
// Why WebGL: the GPU redraws every county outline at full resolution on every frame, so pinch and
// pan never show a blurry stretched bitmap that "resharpens" afterwards, and nothing is redrawn
// on the main thread when a gesture ends (the old Leaflet canvas renderer repainted all counties
// on every zoomend/moveend). Colors live in feature-state, so recoloring never rebuilds geometry.
//
// Geometry: public/data/map.topo.json from scripts/build-map.ts, AlbersUSA stored as planar lon/lat.
import { Map as MapLibre, Marker, setWorkerCount, setWorkerUrl, type MapMouseEvent, type StyleSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { STATE_BY_FIPS } from "../shared/states-fips";
import type { CountyStatus, SourceHealth } from "../shared/types";
import { COUNTY_CLOSED, bindSheetTriggers, locate, lookupStatus, showCounty, type ResolvedDetail, type Result } from "./place";

type Coverage = Record<string, { abbr: string; coverage: "live" | "restrictions" | "directory" }>;
type Bans = { generated: string; counties: CountyStatus[]; sources: SourceHealth[] };
type County = Feature<Geometry, { n: string }> & { id: number };

const COLOR = { ban: "#f34f49", restricted: "#f5a623", none: "#2a9d70", unknown: "#8fa3ad", untracked: "#e4e4e4" };
const LONG_PRESS_MS = 500;
const TAP_SLOP = 10;

const fipsOf = (id: number) => String(id).padStart(5, "0");

export async function initMap(): Promise<void> {
  const host = document.getElementById("map")!;
  const app = host.closest<HTMLElement>(".map-app")!;
  const coverage = JSON.parse(host.dataset.coverage || "{}") as Coverage;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const ms = (n: number) => (reduceMotion.matches ? 0 : n);
  bindSheetTriggers();
  setWorkerUrl(workerUrl);
  // Three small GeoJSON sources: one worker tiles them all, and each extra worker re-parses ~550 KB of JS.
  setWorkerCount(1);

  // Colors arrive after first paint: the map draws gray first and never waits on the API.
  const bansPromise = fetch("/api/v1/bans")
    .then((r) => (r.ok ? (r.json() as Promise<Bans>) : null))
    .catch(() => null);
  const topo = (await fetch("/data/map.topo.json").then((r) => r.json())) as Topology;
  const fc = feature(topo, topo.objects.counties as GeometryCollection) as FeatureCollection<Geometry, { n: string }>;
  const byId = new Map<number, County>();
  for (const f of fc.features) {
    const id = Number(f.id); // feature-state needs numeric ids
    f.id = id;
    byId.set(id, f as County);
  }
  const all = boundsOf(fc.features);

  const style: StyleSpecification = {
    version: 8,
    sources: {
      counties: { type: "geojson", data: fc, maxzoom: 5, buffer: 32 },
      states: { type: "geojson", data: feature(topo, topo.objects.states as GeometryCollection), maxzoom: 5 },
      nation: { type: "geojson", data: feature(topo, topo.objects.nation as GeometryCollection), maxzoom: 5 },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#f7f7f5" } },
      { id: "fill", type: "fill", source: "counties", paint: { "fill-color": ["coalesce", ["feature-state", "c"], COLOR.untracked] } },
      {
        id: "county-lines",
        type: "line",
        source: "counties",
        paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 2, 0.3, 5, 0.8, 8, 1.6] },
      },
      { id: "nation", type: "line", source: "nation", paint: { "line-color": "#a9a9a4", "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 8, 1.5] } },
      {
        id: "states",
        type: "line",
        source: "states",
        layout: { "line-join": "round" },
        paint: { "line-color": "#4d4d4d", "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.75, 6, 1.5, 8, 2.25] },
      },
      {
        id: "hover",
        type: "line",
        source: "counties",
        paint: { "line-color": "#1a1a1a", "line-width": 1.5, "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.7, 0] },
      },
      {
        id: "selected",
        type: "line",
        source: "counties",
        layout: { "line-join": "round" },
        paint: {
          "line-color": "#1a1a1a",
          "line-width": ["interpolate", ["linear"], ["zoom"], 2, 2, 8, 3.5],
          "line-opacity": ["case", ["boolean", ["feature-state", "sel"], false], 1, 0],
        },
      },
    ],
  };

  const map = new MapLibre({
    container: host,
    style,
    bounds: all,
    fitBoundsOptions: { padding: chromePadding() },
    minZoom: 0,
    maxZoom: 9,
    maxPitch: 0,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
    attributionControl: false,
    fadeDuration: 0,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.getCanvas().setAttribute("aria-label", "County burn ban map. Arrow keys pan, plus and minus zoom.");

  map.once("load", () => {
    // No maxBounds: on a tall phone it would force a zoom where the viewport fits inside it, which
    // crops the country and locks vertical panning. Instead: can't zoom out much past the whole
    // country, and a pan that leaves the country mostly off screen eases back.
    map.setMinZoom(map.getZoom() - 0.75);
    map.on("moveend", () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const nw = map.project([all[0][0], all[1][1]]);
      const se = map.project([all[1][0], all[0][1]]);
      const x = Math.min(Math.max(w / 2, nw.x - w * 0.35), se.x + w * 0.35);
      const y = Math.min(Math.max(h / 2, nw.y - h * 0.35), se.y + h * 0.35);
      if (x !== w / 2 || y !== h / 2) map.easeTo({ center: map.unproject([x, y]), duration: ms(300) });
    });
    host.dataset.ready = "";
    document.querySelector("[data-map-loading]")?.remove();
    void bansPromise.then(paint);
  });
  map.once("idle", () => {
    document.documentElement.dataset.mapReady = "";
  });

  // ---------- colors ----------

  function paint(bans: Bans | null) {
    const byFips = new Map((bans?.counties ?? []).map((c) => [c.fips, c]));
    // Green only where a healthy source vouches for negatives ("full" mode). Positive-only or failing = can't confirm.
    const healthy = new Set((bans?.sources ?? []).filter((s) => s.ok && s.mode === "full").map((s) => s.state.toUpperCase()));
    for (const id of byId.keys()) {
      const fips = fipsOf(id);
      const hit = byFips.get(fips);
      let c: string = COLOR.untracked;
      if (hit) c = hit.status === "ban" ? COLOR.ban : hit.status === "restricted" ? COLOR.restricted : COLOR.unknown;
      else {
        const st = coverage[fips.slice(0, 2)];
        if (st?.coverage === "live") c = healthy.has(st.abbr) ? COLOR.none : COLOR.unknown;
      }
      if (c !== COLOR.untracked) map.setFeatureState({ source: "counties", id }, { c });
    }
    document.documentElement.dataset.mapColored = "";
  }

  // ---------- selection + county card ----------

  let selected: number | null = null;
  let pin: Marker | null = null;
  let request = 0;

  function highlight(id: number | null) {
    if (selected !== null) map.setFeatureState({ source: "counties", id: selected }, { sel: false });
    selected = id;
    if (id !== null) map.setFeatureState({ source: "counties", id }, { sel: true });
  }

  function labelFor(id: number): string {
    const f = byId.get(id);
    const st = STATE_BY_FIPS[fipsOf(id).slice(0, 2)]?.abbr ?? "";
    return f ? `${f.properties.n}, ${st}` : "this county";
  }

  function openCard() {
    app.dataset.card = "open";
    setLegend(false);
  }

  /** Forget the selection and pin. `fromIsland` = the reader already dismissed the card. */
  function closeCard(fromIsland = false) {
    request++;
    highlight(null);
    pin?.remove();
    pin = null;
    delete app.dataset.card;
    if (!fromIsland) showCounty(null);
  }
  document.addEventListener(COUNTY_CLOSED, () => closeCard(true));

  async function lookup(params: Record<string, string>, place: string, fips = "") {
    const mine = ++request;
    showCounty({ fips, place, state: "checking" });
    openCard();
    try {
      const res = await lookupStatus(params);
      if (mine !== request) return;
      const r = res.results?.[0] as Result | undefined;
      if (!r) return showCounty({ fips, place, state: "error", message: "No US county there. Try another spot." });
      if (!fips) highlight(Number(r.fips));
      showCounty({ fips: r.fips, place: `${r.county}, ${r.state}`, state: "ready", result: r });
    } catch {
      if (mine !== request) return;
      showCounty({ fips, place, state: "error", message: "Couldn't load the status. Try again in a minute." });
    }
  }

  function selectCounty(id: number) {
    pin?.remove();
    pin = null;
    highlight(id);
    keepClearOfCard(id);
    void lookup({ fips: fipsOf(id) }, labelFor(id), fipsOf(id));
  }

  /** The card covers the bottom of the screen; nudge the map so the chosen county stays in view above it. */
  function keepClearOfCard(id: number) {
    const f = byId.get(id);
    if (!f) return;
    const b = boundsOf([f]);
    const p = map.project([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]);
    const { top, bottom } = clearArea();
    const w = host.clientWidth;
    let dx = 0;
    let dy = 0;
    if (p.y > bottom - 24 || p.y < top + 24) dy = p.y - (top + bottom) / 2;
    if (p.x < 24 || p.x > w - 24) dx = p.x - w / 2;
    if (dx || dy) map.panBy([dx, dy], { duration: ms(350) });
  }

  function flyToCounty(id: number) {
    const f = byId.get(id);
    if (!f) return;
    const { top, bottom } = clearArea();
    map.fitBounds(boundsOf([f]), {
      padding: { top: top + 24, bottom: host.clientHeight - bottom + 24, left: 32, right: 32 },
      maxZoom: Math.max(map.getZoom(), 6),
      duration: ms(900),
    });
  }

  /** Vertical band of the map not covered by the header chip or the county card. */
  function clearArea(): { top: number; bottom: number } {
    const h = host.clientHeight;
    const head = document.querySelector(".map-head")?.getBoundingClientRect().bottom ?? 60;
    const card = document.querySelector<HTMLElement>(".vs--detached");
    const cardTop = card ? card.getBoundingClientRect().top : h - Math.min(340, h * 0.45);
    return { top: head, bottom: Math.min(h, cardTop) };
  }

  function chromePadding() {
    const h = host.clientHeight;
    const head = document.querySelector(".map-head")?.getBoundingClientRect().bottom ?? 60;
    const bar = document.querySelector(".map-controls")?.getBoundingClientRect().top ?? h - 60;
    return { top: head + 12, bottom: Math.max(12, h - bar + 12), left: 12, right: 12 };
  }

  // ---------- taps, long-press pins ----------

  let suppressClickUntil = 0;
  map.on("click", (e: MapMouseEvent) => {
    if (performance.now() < suppressClickUntil) return;
    const hit = map.queryRenderedFeatures(e.point, { layers: ["fill"] })[0];
    if (hit && typeof hit.id === "number") selectCounty(hit.id);
    else if (app.dataset.card) closeCard();
  });

  let hovered: number | null = null;
  map.on("mousemove", "fill", (e) => {
    const id = e.features?.[0]?.id;
    if (typeof id !== "number" || id === hovered) return;
    if (hovered !== null) map.setFeatureState({ source: "counties", id: hovered }, { hover: false });
    hovered = id;
    map.setFeatureState({ source: "counties", id }, { hover: true });
    host.dataset.hover = "";
  });
  map.on("mouseleave", "fill", () => {
    if (hovered !== null) map.setFeatureState({ source: "counties", id: hovered }, { hover: false });
    hovered = null;
    delete host.dataset.hover;
  });

  async function dropPin(lngLat: { lng: number; lat: number }) {
    suppressClickUntil = performance.now() + 700;
    navigator.vibrate?.(8);
    pin?.remove();
    const el = document.createElement("div");
    el.className = "map-pin";
    pin = new Marker({ element: el }).setLngLat(lngLat).addTo(map);
    highlight(null);
    const { fromPlanar } = await import("./map-albers");
    const real = fromPlanar(lngLat.lng, lngLat.lat);
    if (!real) {
      request++;
      showCounty({ fips: "", place: "That spot", state: "error", message: "No US county there. Try another spot." });
      openCard();
      return;
    }
    void lookup({ lat: real[1].toFixed(4), lon: real[0].toFixed(4) }, "that spot");
  }

  // Touch: press and hold without moving. (MapLibre has no long-press event; iOS fires no contextmenu.)
  let press: { x: number; y: number; timer: number } | null = null;
  const cancelPress = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  const local = (t: Touch) => {
    const rect = host.getBoundingClientRect();
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };
  host.addEventListener(
    "touchstart",
    (e) => {
      cancelPress();
      if (e.touches.length !== 1) return;
      const { x, y } = local(e.touches[0]);
      const timer = window.setTimeout(() => {
        press = null;
        void dropPin(map.unproject([x, y]));
      }, LONG_PRESS_MS);
      press = { x, y, timer };
    },
    { passive: true },
  );
  host.addEventListener(
    "touchmove",
    (e) => {
      if (!press) return;
      const p = local(e.touches[0]);
      if (e.touches.length !== 1 || Math.hypot(p.x - press.x, p.y - press.y) > TAP_SLOP) cancelPress();
    },
    { passive: true },
  );
  host.addEventListener("touchend", cancelPress, { passive: true });
  host.addEventListener("touchcancel", cancelPress, { passive: true });
  // Mouse: right-click drops a pin. (Android also fires contextmenu on long-press; the timer covers it.)
  map.on("contextmenu", (e) => {
    e.preventDefault();
    if ((e.originalEvent as PointerEvent).pointerType === "touch" || performance.now() < suppressClickUntil) return;
    void dropPin(e.lngLat);
  });

  // ---------- controls ----------

  const legend = document.querySelector<HTMLElement>("[data-legend]")!;
  const legendBtn = document.querySelector<HTMLButtonElement>("[data-legend-toggle]")!;
  function setLegend(open: boolean) {
    legend.classList.toggle("is-open", open);
    legend.inert = !open;
    legendBtn.setAttribute("aria-expanded", String(open));
  }
  setLegend(matchMedia("(min-width: 48rem)").matches);
  legendBtn.addEventListener("click", () => setLegend(!legend.classList.contains("is-open")));

  document.querySelectorAll<HTMLButtonElement>("[data-zoom]").forEach((b) =>
    b.addEventListener("click", () => (b.dataset.zoom === "in" ? map.zoomIn({ duration: ms(250) }) : map.zoomOut({ duration: ms(250) }))),
  );

  const locateBtn = document.querySelector<HTMLButtonElement>("[data-locate]")!;
  locateBtn.addEventListener("click", async () => {
    if (locateBtn.getAttribute("aria-busy") === "true") return;
    locateBtn.setAttribute("aria-busy", "true");
    const mine = ++request;
    try {
      const [{ lat, lon }, { toPlanar }] = await Promise.all([locate(), import("./map-albers")]);
      const at = toPlanar(Number(lon), Number(lat));
      if (at) map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 6), duration: ms(900) });
      const res = await lookupStatus({ lat, lon });
      if (mine !== request) return;
      const r = res.results?.[0] as Result | undefined;
      if (!r) {
        showCounty({ fips: "", place: "Your location", state: "error", message: "We couldn't find a US county where you are. Try Search." });
      } else {
        pin?.remove();
        pin = null;
        highlight(Number(r.fips));
        showCounty({ fips: r.fips, place: `${r.county}, ${r.state}`, state: "ready", result: r });
      }
      openCard();
    } catch (err) {
      if (mine !== request) return;
      const off = err instanceof GeolocationPositionError || (err as Error)?.message === "unsupported";
      showCounty({
        fips: "",
        place: "Your location",
        state: "error",
        message: off ? "Location is off. Use Search to find a county by ZIP." : "Couldn't find you. Try again in a minute.",
      });
      openCard();
    } finally {
      locateBtn.removeAttribute("aria-busy");
    }
  });

  // Search (the location sheet) hands its county back here instead of leaving the page.
  document.addEventListener("itabb:resolved", (e) => {
    const { result: r } = (e as CustomEvent<ResolvedDetail>).detail;
    const id = Number(r.fips);
    request++;
    pin?.remove();
    pin = null;
    highlight(id);
    showCounty({ fips: r.fips, place: `${r.county}, ${r.state}`, state: "ready", result: r });
    openCard();
    requestAnimationFrame(() => flyToCounty(id));
  });

  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && legend.classList.contains("is-open")) setLegend(false);
  });
}

function boundsOf(features: Feature<Geometry>[]): [[number, number], [number, number]] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const visit = (p: Position) => {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  };
  for (const f of features) {
    const g = f.geometry;
    if (g.type === "Polygon") g.coordinates.forEach((r) => r.forEach(visit));
    else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => p.forEach((r) => r.forEach(visit)));
  }
  return [[x0, y0], [x1, y1]];
}

