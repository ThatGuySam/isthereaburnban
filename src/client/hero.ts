// Home + county hero. Home asks first ("Use my location" / ZIP), then remembers the place in
// localStorage and repaints it on later visits. No IP geolocation: it guessed the wrong state.
import { heroStyle, relativeTime, renderStatusHtml, statusTheme } from "../shared/render";
import type { LookupResult } from "../shared/types";
import { bindSheetTriggers, locate, lookupStatus, openSheet, readPlace, savePlace, type ResolvedDetail, type Result } from "./place";

type Extra = Omit<ResolvedDetail, "result">;

export function refreshRelativeTimes(root: { querySelectorAll: Document["querySelectorAll"] } = document): void {
  root.querySelectorAll<HTMLTimeElement>("time[data-relative]").forEach((t) => {
    const text = relativeTime(t.dateTime);
    if (text) t.textContent = text;
  });
}

export function initHero(): void {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return;
  const slot = hero.querySelector<HTMLElement>("[data-status-slot]")!;
  const locateBtn = hero.querySelector<HTMLButtonElement>("[data-locate]");
  const mode = hero.dataset.mode === "county" ? "county" : "home";
  const pageFips = slot.dataset.fips;

  bindSheetTriggers();

  function setTheme(status: string) {
    const theme = statusTheme(status);
    hero!.dataset.status = status;
    hero!.style.cssText = heroStyle(status);
    if (mode === "home") document.documentElement.style.backgroundColor = theme.color;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.color);
  }

  /** Point the hero's sheet triggers at the county on screen. */
  function setTriggers(fips: string, label: string, url?: string) {
    hero!.querySelectorAll<HTMLElement>("[data-sheet]").forEach((el) => {
      el.dataset.fips = fips;
      el.dataset.place = label;
      if (url) el.dataset.url = url;
    });
  }

  function paint(r: Result, extra: Extra = {}, remember = true) {
    const label = `${r.county}, ${r.state}`;
    slot.innerHTML = renderStatusHtml(r, { note: extra.note });
    setTheme(r.status);
    hero!.dataset.state = "answer";
    setTriggers(r.fips, label, r.url);
    if (!remember) return;
    const prev = readPlace();
    const same = prev?.fips === r.fips;
    const chosen = extra.zip !== undefined || extra.lat !== undefined;
    savePlace({
      fips: r.fips,
      label,
      url: r.url ?? (same ? prev?.url : undefined),
      zip: extra.zip ?? (same && !chosen ? prev?.zip : undefined),
      lat: extra.lat ?? (same && !chosen ? prev?.lat : undefined),
      lon: extra.lon ?? (same && !chosen ? prev?.lon : undefined),
      ts: same && !chosen && prev?.ts ? prev.ts : Date.now(),
      status: r.status,
      style: heroStyle(r.status),
      html: renderStatusHtml(r),
    });
  }

  /** Look up and paint, or hand off to the location sheet when the answer needs a choice. */
  async function lookup(params: Record<string, string>, extra: Extra = {}) {
    let res: LookupResult;
    try {
      res = await lookupStatus(params);
    } catch {
      if (hero!.dataset.state === "answer") return; // keep the remembered answer on screen
      return openSheet({ sheet: "location", message: "We couldn't reach our status service. Try again in a minute." });
    }
    if (!res.results?.length) return openSheet({ sheet: "location", message: "We couldn't find a US county there. Try a ZIP." });
    if (res.approximate || res.ambiguous) return openSheet({ sheet: "location", zip: params.zip });
    const r = res.results[0];
    paint(r, extra);
  }

  document.addEventListener("itabb:resolved", (e) => {
    const d = (e as CustomEvent<ResolvedDetail>).detail;
    paint(d.result, d);
    // On a county page, a different county means a different page.
    if (mode === "county" && d.result.fips !== pageFips && d.result.url) location.href = d.result.url;
  });

  locateBtn?.addEventListener("click", async () => {
    locateBtn.disabled = true;
    try {
      const { lat, lon } = await locate();
      await lookup({ lat, lon }, { lat: Number(lat), lon: Number(lon) });
    } catch {
      openSheet({ sheet: "location", message: "Location is off. Enter a ZIP instead." });
    } finally {
      locateBtn.disabled = false;
    }
  });

  setInterval(() => refreshRelativeTimes(slot), 60000);

  if (mode === "county") {
    // The Worker normally injects status. If the slot still says Checking (e.g. astro dev), fetch it.
    if (pageFips && slot.querySelector('[data-status="checking"]')) {
      lookupStatus({ fips: pageFips })
        .then((res) => {
          const r = res.results?.[0];
          if (r?.status) paint(r, { note: slot.dataset.note }, false);
        })
        .catch(() => undefined);
    } else {
      refreshRelativeTimes(slot);
    }
    return;
  }

  // Home. Explicit links (?zip= / ?lat=&lon= / ?fips=) win; otherwise the remembered place.
  const q = new URLSearchParams(location.search);
  const zip = q.get("zip")?.trim();
  const lat = q.get("lat");
  const lon = q.get("lon");
  const fips = q.get("fips");
  if (zip && /^\d{5}$/.test(zip)) void lookup({ zip }, { zip });
  else if (lat && lon) void lookup({ lat, lon }, { lat: Number(lat), lon: Number(lon) });
  else if (fips && /^\d{5}$/.test(fips)) void lookup({ fips });
  else {
    const last = readPlace();
    if (last?.fips) {
      // The inline script already painted the stored answer; refresh it quietly.
      refreshRelativeTimes(slot);
      setTriggers(last.fips, last.label, last.url);
      void lookup({ fips: last.fips });
    }
  }
}
