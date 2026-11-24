// Shared between the vanilla hero/map scripts and the React sheets island: the remembered place,
// lookups, and the two DOM events they use to talk (`itabb:open` opens a sheet, `itabb:resolved`
// hands a looked-up county back to the page).
import type { CountyStatus, LookupResult } from "../shared/types";

export type Result = CountyStatus & { url?: string };

export type StoredPlace = { fips: string; label: string; url?: string };
type StoredAnswer = { result: Result; savedAt: number; expiresAt: number };

export const PLACE_KEY = "itabb:place";
const ANSWER_KEY = "itabb:answer";
const LEGACY_KEY = "itabb:last";
export const HOME_ANSWER_TTL_MS = 2 * 60_000;

export function readPlace(): StoredPlace | null {
  try {
    const raw = localStorage.getItem(PLACE_KEY);
    const value = JSON.parse(raw ?? localStorage.getItem(LEGACY_KEY) ?? "null");
    const label = value?.label ?? value?.place;
    if (typeof value?.fips !== "string" || !/^\d{5}$/.test(value.fips) || typeof label !== "string") return null;
    const place: StoredPlace = { fips: value.fips, label, url: typeof value.url === "string" ? value.url : undefined };
    if (raw !== JSON.stringify(place)) savePlace(place);
    return place;
  } catch {
    return null;
  }
}

export function savePlace(place: StoredPlace): void {
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(place));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* Private mode or storage full. */
  }
}

/** A saved answer is used only as a historical report after revalidation fails. */
export function readLastAnswer(fips: string): Result | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(ANSWER_KEY) ?? "null") as StoredAnswer | null;
    const result = saved?.result;
    if (result?.fips !== fips || result.status === "unknown" || !result.sourceUrl || !result.checked ||
      !Number.isFinite(Date.parse(result.checked)) || typeof result.label !== "string") return;
    return result;
  } catch {
    return undefined;
  }
}

export function saveAnswer(result: Result, now = Date.now()): number {
  const deadline = result.validUntil ? Date.parse(result.validUntil) : NaN;
  const expiresAt = Number.isFinite(deadline) ? Math.min(now + HOME_ANSWER_TTL_MS, deadline) : now + HOME_ANSWER_TTL_MS;
  const answer: StoredAnswer = { result, savedAt: now, expiresAt };
  try {
    localStorage.setItem(ANSWER_KEY, JSON.stringify(answer));
  } catch {
    /* Private mode or storage full. */
  }
  return expiresAt;
}

export async function lookupStatus(params: Record<string, string>): Promise<LookupResult> {
  const res = await fetch(`/api/v1/status?${new URLSearchParams(params)}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
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

export type SheetName = "location" | "details" | "alert" | "menu";
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
export type ResolvedDetail = { result: Result };

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

// ---------- county sheet (map page) ----------

/** The detached, non-modal county card on /map/. `null` closes it. */
export type CountyDetail = {
  fips: string;
  /** "Tulsa County, OK" (or "that spot" for a dropped pin before the lookup lands) */
  place: string;
  state: "checking" | "ready" | "error";
  result?: Result;
  message?: string;
};

type CountyWindow = Window & { __itabbCounty?: CountyDetail | null };

/** Show, update or close (null) the county card. Picked up on mount if the island hasn't hydrated yet. */
export function showCounty(detail: CountyDetail | null): void {
  (window as CountyWindow).__itabbCounty = detail;
  document.dispatchEvent(new CustomEvent<CountyDetail | null>("itabb:county", { detail }));
}

export function takePendingCounty(): CountyDetail | null | undefined {
  const w = window as CountyWindow;
  const d = w.__itabbCounty;
  delete w.__itabbCounty;
  return d;
}

/** Fired by the island when the reader dismisses the county card (swipe, close button, Escape). */
export const COUNTY_CLOSED = "itabb:county-closed";
