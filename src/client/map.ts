// Map page: county outlines from TopoJSON (no tile server), colored by /api/v1/bans.
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, Geometry } from "geojson";
import { heroStyle, renderStatusHtml } from "../shared/render";
import { STATE_BY_FIPS } from "../shared/states-fips";
import type { CountyStatus, LookupResult, SourceHealth } from "../shared/types";
import { bindSheetTriggers } from "./place";

type Coverage = Record<string, { abbr: string; coverage: "live" | "restrictions" | "directory" }>;
type Bans = { generated: string; counties: CountyStatus[]; sources: SourceHealth[] };

const COLOR = { ban: "#f34f49", restricted: "#f5a623", none: "#2a9d70", unknown: "#8fa3ad", untracked: "#e4e4e4" };

export async function initMap(): Promise<void> {
  const el = document.getElementById("map")!;
  const loading = document.querySelector<HTMLElement>("[data-map-loading]");
  const panel = document.querySelector<HTMLElement>("[data-map-panel]")!;
  const slot = panel.querySelector<HTMLElement>("[data-status-slot]")!;
  const alertBtn = panel.querySelector<HTMLButtonElement>('[data-sheet="alert"]')!;
  const pinToggle = document.querySelector<HTMLButtonElement>("[data-pin-toggle]")!;
  const coverage = JSON.parse(el.dataset.coverage || "{}") as Coverage;
  bindSheetTriggers();

  const [topo, bans] = await Promise.all([
    fetch("/data/counties.topo.json").then((r) => r.json() as Promise<Topology>),
    fetch("/api/v1/bans")
      .then((r) => (r.ok ? (r.json() as Promise<Bans>) : null))
      .catch(() => null),
  ]);

  const byFips = new Map((bans?.counties ?? []).map((c) => [c.fips, c]));
  // Green only where a healthy source vouches for negatives ("full" mode). Positive-only or failing = can't confirm.
  const healthy = new Set((bans?.sources ?? []).filter((s) => s.ok && s.mode === "full").map((s) => s.state.toUpperCase()));

  function colorFor(fips: string): string {
    const hit = byFips.get(fips);
    if (hit) return hit.status === "ban" ? COLOR.ban : hit.status === "restricted" ? COLOR.restricted : COLOR.unknown;
    const st = coverage[fips.slice(0, 2)];
    if (!st || st.coverage !== "live") return COLOR.untracked;
    return healthy.has(st.abbr) ? COLOR.none : COLOR.unknown;
  }

  const map = L.map(el, { preferCanvas: true, zoomSnap: 0.25, attributionControl: true, minZoom: 3, maxZoom: 10 });
  map.attributionControl.setPrefix(false).addAttribution("Boundaries: US Census via us-atlas");
  map.fitBounds([[24.5, -125], [49.5, -66.9]]);

  const counties = feature(topo, topo.objects.counties as GeometryCollection) as unknown as { features: Feature<Geometry, { name: string }>[] };
  let selected: L.Path | null = null;

  const layer = L.geoJSON(counties.features as any, {
    style: (f) => ({ color: "#ffffff", weight: 0.4, fillColor: colorFor(String(f?.id)), fillOpacity: 1 }),
    onEachFeature: (f, lyr) => {
      lyr.on("click", (e: L.LeafletMouseEvent) => {
        if (pinMode) return; // map click handler drops the pin
        L.DomEvent.stopPropagation(e);
        const path = lyr as L.Path;
        selected?.setStyle({ weight: 0.4, color: "#ffffff" });
        path.setStyle({ weight: 2.5, color: "#1a1a1a" });
        path.bringToFront();
        selected = path;
        const fips = String(f.id);
        const st = STATE_BY_FIPS[fips.slice(0, 2)]?.abbr ?? "";
        showLoading(`${(f.properties as { name: string }).name}, ${st}`);
        void lookup({ fips });
      });
    },
  }).addTo(map);

  L.geoJSON(mesh(topo, topo.objects.states as GeometryCollection, (a, b) => a !== b) as any, {
    style: { color: "#555", weight: 1, fill: false, interactive: false } as L.PathOptions,
    interactive: false,
  }).addTo(map);
  layer.bringToBack();
  loading?.remove();

  let pinMode = false;
  let pin: L.CircleMarker | null = null;
  pinToggle.addEventListener("click", () => {
    pinMode = !pinMode;
    pinToggle.setAttribute("aria-pressed", String(pinMode));
    el.classList.toggle("pin-mode", pinMode);
  });
  map.on("click", (e: L.LeafletMouseEvent) => {
    if (!pinMode) return;
    pin?.remove();
    pin = L.circleMarker(e.latlng, { radius: 8, color: "#1a1a1a", weight: 3, fillColor: "#fff", fillOpacity: 1 }).addTo(map);
    showLoading("that spot");
    void lookup({ lat: e.latlng.lat.toFixed(4), lon: e.latlng.lng.toFixed(4) });
  });

  panel.querySelector("[data-panel-close]")!.addEventListener("click", () => {
    panel.hidden = true;
    selected?.setStyle({ weight: 0.4, color: "#ffffff" });
    selected = null;
  });

  function showLoading(place: string) {
    panel.hidden = false;
    panel.dataset.status = "checking";
    panel.style.cssText = heroStyle("checking");
    slot.innerHTML = "";
    const p = document.createElement("p");
    p.className = "status-sentence";
    p.textContent = `Checking ${place}…`;
    slot.appendChild(p);
    alertBtn.hidden = true;
  }

  async function lookup(params: Record<string, string>) {
    try {
      const res = (await fetch(`/api/v1/status?${new URLSearchParams(params)}`).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })) as LookupResult;
      const r = res.results?.[0];
      if (!r) {
        slot.innerHTML = `<p class="status-sentence">No US county there. Try another spot.</p>`;
        return;
      }
      slot.innerHTML = renderStatusHtml(r, { link: r.url });
      panel.dataset.status = r.status;
      panel.style.cssText = heroStyle(r.status);
      alertBtn.dataset.fips = r.fips;
      alertBtn.dataset.place = `${r.county}, ${r.state}`;
      alertBtn.hidden = false;
    } catch {
      slot.innerHTML = `<p class="status-sentence">Couldn't load the status. Try again in a minute.</p>`;
    }
  }
}
