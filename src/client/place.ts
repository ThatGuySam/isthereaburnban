// Shared between the vanilla hero/map scripts and the React sheets island: the remembered place,
// lookups, and the two DOM events they use to talk (`itabb:open` opens a sheet, `itabb:resolved`
// hands a looked-up county back to the page).
import type { CountyStatus, LookupResult } from "../shared/types";

export type Result = CountyStatus & { url?: string };

export type StoredPlace = {
  fips: string;
  /** "Tulsa County, OK" */
  label: string;
  url?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  /** epoch ms when the user chose this place */
  ts: number;
  /** last painted status + hero markup, so a return visit paints before any fetch */
  status?: string;
  style?: string;
  html?: string;
};

export const PLACE_KEY = "itabb:place";
const LEGACY_KEY = "itabb:last";

export function readPlace(): StoredPlace | null {
  try {
    const raw = localStorage.getItem(PLACE_KEY);
    if (raw) return JSON.parse(raw) as StoredPlace;
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const l = JSON.parse(legacy) as { fips: string; place: string; url?: string };
      return l.fips ? { fips: l.fips, label: l.place, url: l.url, ts: 0 } : null;
    }
  } catch {
    /* private mode or bad JSON */
  }
  return null;
}

export function savePlace(p: StoredPlace): void {
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(p));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* private mode */
  }
}

export async function lookupStatus(params: Record<string, string>): Promise<LookupResult> {
  const res = await fetch(`/api/v1/status?${new URLSearchParams(params)}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as LookupResult;
}

/** Ask the browser for a rough position. Only ever called from a tap. */
export function locate(): Promise<{ lat: string; lon: string }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude.toFixed(4), lon: pos.coords.longitude.toFixed(4) }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  });
}

// ---------- events ----------

export type SheetName = "location" | "alert" | "menu";
export type OpenDetail = {
  sheet: SheetName;
  fips?: string;
  place?: string;
  /** county page path for "More about …" in the menu */
  url?: string;
  /** one line shown at the top of the location sheet */
  message?: string;
  /** open the location sheet on this ZIP's county choices */
  zip?: string;
};
export type ResolvedDetail = { result: Result; note?: string; zip?: string; lat?: number; lon?: number };

type PendingWindow = Window & { __itabbSheet?: OpenDetail };

/** Open a sheet. If the island hasn't hydrated yet it picks the request up on mount. */
export function openSheet(detail: OpenDetail): void {
  (window as PendingWindow).__itabbSheet = detail;
  document.dispatchEvent(new CustomEvent<OpenDetail>("itabb:open", { detail }));
}

export function takePendingSheet(): OpenDetail | undefined {
  const w = window as PendingWindow;
  const d = w.__itabbSheet;
  delete w.__itabbSheet;
  return d;
}

export function emitResolved(detail: ResolvedDetail): void {
  document.dispatchEvent(new CustomEvent<ResolvedDetail>("itabb:resolved", { detail }));
}

/** Any element with data-sheet="location|alert|menu" opens that sheet (data-fips / data-place pass through). */
let bound = false;
export function bindSheetTriggers(): void {
  if (bound) return;
  bound = true;
  document.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-sheet]");
    if (!t) return;
    e.preventDefault();
    const { sheet, fips, place, url } = t.dataset;
    openSheet({ sheet: sheet as SheetName, fips: fips || undefined, place: place || undefined, url: url || undefined });
  });
}
