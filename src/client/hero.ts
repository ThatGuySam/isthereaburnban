// Home remembers a county and fetches its current report on every visit and return to the tab.
import { escapeHtml, heroStyle, placeName, placeStatus, relativeTime, renderAskHtml, renderCheckingHtml, renderCityHtml,
  renderStatusHtml, statusTheme, type HeroStatus } from "../shared/render";
import {
  bindSheetTriggers, HOME_ANSWER_TTL_MS, locate, lookupStatus, openSheet, readLastAnswer, readPlace,
  saveAnswer, savePlace, type ResolvedDetail, type Result,
} from "./place";

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
  const home = hero.dataset.mode === "home";
  const pageFips = slot.dataset.fips;
  bindSheetTriggers();

  function paint(status: HeroStatus, markup: string, state = "answer") {
    slot.innerHTML = markup;
    const theme = statusTheme(status);
    hero!.dataset.state = state;
    hero!.dataset.status = status;
    hero!.style.cssText = heroStyle(status);
    if (home) document.documentElement.style.backgroundColor = theme.color;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.color);
  }

  function setTriggers(fips: string, label: string, url?: string) {
    hero!.querySelectorAll<HTMLElement>("[data-sheet]").forEach((el) => {
      el.dataset.fips = fips;
      el.dataset.place = label;
      if (url) el.dataset.url = url;
      else delete el.dataset.url;
    });
  }

  setInterval(() => refreshRelativeTimes(slot), 60_000);

  if (!home) {
    document.addEventListener("itabb:resolved", (e) => {
      const { result } = (e as CustomEvent<ResolvedDetail>).detail;
      savePlace({ fips: result.fips, label: placeName(result), url: result.url });
      if (result.url && (result.fips !== pageFips || document.documentElement.dataset.city)) location.href = result.url;
    });
    // Static previews can fetch the same place API if the Worker hasn't injected a report.
    if (pageFips && slot.querySelector('[data-status="checking"]')) {
      const link = document.querySelector<HTMLLinkElement>('link[rel="alternate"][type="application/json"]');
      const params = link ? Object.fromEntries(new URL(link.href).searchParams) : { fips: pageFips };
      void lookupStatus(params).then((result) => {
        if (!result.results.length) return;
        const city = result.place;
        paint(placeStatus(result.results), city
          ? renderCityHtml(result.results, `${city.name}, ${city.state}`, city.localRulesUrl)
          : renderStatusHtml(result.results[0]));
      }).catch(() => undefined);
    }
    return;
  }

  let place = readPlace();
  let lastAnswer = place ? readLastAnswer(place.fips) : undefined;
  let refreshTimer: ReturnType<typeof setTimeout>;
  let request = 0;
  let pending = false;

  function schedule(delay: number) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, Math.max(1_000, delay));
  }

  function showLostConnection() {
    if (lastAnswer?.fips === place?.fips && lastAnswer?.checked) {
      paint("unknown", renderStatusHtml(lastAnswer, { lastKnown: true }));
    } else {
      const label = place ? ` for ${place.label}` : "";
      const markup = `<div class="status" data-status="unknown"><p class="status-word status-word--long">Unsure</p><p class="status-sentence">We couldn't check the status${escapeHtml(label)}.</p></div>`;
      paint("unknown", markup, place ? "answer" : "ask");
    }
  }

  function showAnswer(result: Result) {
    place = { fips: result.fips, label: placeName(result), url: result.url };
    savePlace(place);
    setTriggers(place.fips, place.label, place.url);
    const expiresAt = saveAnswer(result);
    if (expiresAt <= Date.now()) {
      showLostConnection();
      schedule(1_000);
      return;
    }
    lastAnswer = result.status !== "unknown" && result.checked && result.sourceUrl ? result : undefined;
    paint(result.status, renderStatusHtml(result));
    schedule(expiresAt - Date.now());
  }

  async function check(params: Record<string, string>) {
    const mine = ++request;
    pending = true;
    clearTimeout(refreshTimer);
    const current = params.fips === place?.fips ? place : undefined;
    if (current) setTriggers(current.fips, current.label, current.url);
    paint("checking", renderCheckingHtml(current?.label), "checking");
    try {
      const result = await lookupStatus(params);
      if (mine !== request) return;
      if (result.approximate || result.ambiguous) {
        if (place) showLostConnection();
        else paint("checking", renderAskHtml(), "ask");
        openSheet({ sheet: "location", zip: params.zip });
        if (place) schedule(HOME_ANSWER_TTL_MS);
      } else if (result.results[0]) showAnswer(result.results[0]);
      else throw new Error("No county found");
    } catch {
      if (mine !== request) return;
      showLostConnection();
      if (place) schedule(HOME_ANSWER_TTL_MS);
      else openSheet({ sheet: "location", message: "We couldn't load a county report. Try a ZIP." });
    } finally {
      if (mine === request) pending = false;
    }
  }

  function refresh() {
    if (document.visibilityState === "visible" && !pending && place) void check({ fips: place.fips });
  }

  function clearLocationQuery() {
    const url = new URL(location.href);
    for (const key of ["zip", "fips", "lat", "lon"]) url.searchParams.delete(key);
    if (url.href !== location.href) history.replaceState(history.state, "", url.href);
  }

  document.addEventListener("itabb:resolved", (e) => {
    request++;
    pending = false;
    clearLocationQuery();
    showAnswer((e as CustomEvent<ResolvedDetail>).detail.result);
  });

  const locateBtn = hero.querySelector<HTMLButtonElement>("[data-locate]");
  locateBtn?.addEventListener("click", async () => {
    locateBtn.disabled = true;
    try {
      const { lat, lon } = await locate();
      clearLocationQuery();
      await check({ lat, lon });
    } catch {
      openSheet({ sheet: "location", message: "Location is off. Enter a ZIP instead." });
    } finally {
      locateBtn.disabled = false;
    }
  });

  document.addEventListener("visibilitychange", refresh);
  addEventListener("online", refresh);
  addEventListener("pageshow", (event) => { if (event.persisted) refresh(); });

  // Deep links take precedence for this visit. Refreshes use the confirmed county.
  const q = new URLSearchParams(location.search);
  const zip = q.get("zip")?.trim();
  const lat = q.get("lat");
  const lon = q.get("lon");
  const fips = q.get("fips");
  if (zip && /^\d{5}$/.test(zip)) void check({ zip });
  else if (lat && lon) void check({ lat, lon });
  else if (fips && /^\d{5}$/.test(fips)) void check({ fips });
  else if (place) void check({ fips: place.fips });
  else paint("checking", renderAskHtml(), "ask");
}
