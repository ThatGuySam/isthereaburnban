// Home + county hero: lookups, ZIP form, "Use my location", remembered choice.
import { escapeHtml, heroStyle, relativeTime, renderStatusHtml, statusTheme } from "../shared/render";
import type { CountyStatus, LookupResult } from "../shared/types";

type Result = CountyStatus & { url?: string };
type Last = { fips: string; place: string; url?: string };

const LAST_KEY = "itabb:last";

function readLast(): Last | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as Last) : null;
  } catch {
    return null;
  }
}

function saveLast(r: Result): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ fips: r.fips, place: `${r.county}, ${r.state}`, url: r.url }));
  } catch {
    /* private mode */
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

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
  const choices = hero.querySelector<HTMLElement>("[data-choices]")!;
  const msg = hero.querySelector<HTMLElement>("[data-tools-msg]")!;
  const form = hero.querySelector<HTMLFormElement>("[data-zip-form]")!;
  const locate = hero.querySelector<HTMLButtonElement>("[data-locate]")!;
  const alertBtn = hero.querySelector<HTMLButtonElement>("[data-alert-open]");
  const mode = hero.dataset.mode === "county" ? "county" : "home";
  const pageFips = slot.dataset.fips;

  const say = (text: string) => (msg.textContent = text);

  function setTheme(status: string) {
    hero!.dataset.status = status;
    hero!.style.cssText = heroStyle(status);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", statusTheme(status).color);
  }

  function paint(r: Result, note?: string) {
    const link = r.url && r.fips !== pageFips ? r.url : undefined;
    slot.innerHTML = renderStatusHtml(r, { link, note });
    setTheme(r.status);
    if (alertBtn) alertBtn.dataset.fips = r.fips;
    choices.hidden = true;
    choices.replaceChildren();
  }

  function paintMessage(word: string, sentence: string) {
    slot.innerHTML = `<div class="status" data-status="unknown"><p class="status-word">${escapeHtml(word)}</p><p class="status-sentence">${escapeHtml(sentence)}</p></div>`;
    setTheme("unknown");
  }

  function showChoices(res: LookupResult) {
    const label = res.query.zip ? `ZIP ${res.query.zip} touches ${res.results.length} counties. Which one?` : "Which county?";
    const p = document.createElement("p");
    p.textContent = label;
    const buttons = res.results.map((r) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = `${r.county}, ${r.state}`;
      b.addEventListener("click", () => {
        paint(r);
        saveLast(r);
      });
      return b;
    });
    choices.replaceChildren(p, ...buttons);
    choices.hidden = false;
    buttons[0]?.focus();
  }

  async function lookup(params: Record<string, string>, opts: { remember: boolean }) {
    say("");
    try {
      const res = await getJson<LookupResult>(`/api/v1/status?${new URLSearchParams(params)}`);
      if (!res.results?.length) {
        if (params.here) paintMessage("Where?", "We couldn't tell where you are. Enter a ZIP below.");
        else say("We couldn't find that place. Try another ZIP.");
        return;
      }
      if (res.ambiguous && res.results.length > 1) {
        if (slot.querySelector('[data-status="checking"]')) paintMessage("Which one?", "That spot touches more than one county.");
        showChoices(res);
        return;
      }
      const r = res.results[0];
      const note = res.approximate ? `Closest match${res.query.zip ? ` for ZIP ${res.query.zip}` : ""}` : undefined;
      paint(r, note);
      if (opts.remember) saveLast(r);
    } catch {
      if (params.here) paintMessage("Where?", "We couldn't tell where you are. Enter a ZIP below.");
      else if (slot.querySelector('[data-status="checking"]')) paintMessage("Not sure", "We couldn't reach our status service. Try again in a minute.");
      else say("Lookup failed. Try again in a minute.");
    }
  }

  // ZIP form: real GET form to /?zip=; on the home page JS intercepts and looks up in place.
  form.addEventListener("submit", (e) => {
    if (mode !== "home") return;
    const zip = String(new FormData(form).get("zip") ?? "").trim();
    if (!/^\d{5}$/.test(zip)) return;
    e.preventDefault();
    history.replaceState(null, "", `/?zip=${zip}`);
    void lookup({ zip }, { remember: true });
  });

  locate.addEventListener("click", () => {
    if (!("geolocation" in navigator)) return say("This browser can't share location. Enter a ZIP instead.");
    say("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(4);
        const lon = pos.coords.longitude.toFixed(4);
        if (mode !== "home") return void (location.href = `/?lat=${lat}&lon=${lon}`);
        history.replaceState(null, "", `/?lat=${lat}&lon=${lon}`);
        void lookup({ lat, lon }, { remember: true });
      },
      () => say("Location is off. Enter a ZIP instead."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  });

  setInterval(() => refreshRelativeTimes(slot), 60000);

  if (mode === "county") {
    // The Worker normally injects status. If the slot still says Checking (e.g. astro dev), fetch it.
    if (pageFips && slot.querySelector('[data-status="checking"]')) {
      getJson<Result | LookupResult>(`/api/v1/counties/${pageFips}`)
        .catch(() => getJson<LookupResult>(`/api/v1/status?fips=${pageFips}`))
        .then((data) => {
          const r = "results" in data ? data.results[0] : data;
          if (r?.status) paint(r);
        })
        .catch(() => paintMessage("Not sure", "We couldn't load the status. Check the official source below."));
    } else {
      refreshRelativeTimes(slot);
    }
    return;
  }

  const q = new URLSearchParams(location.search);
  const zip = q.get("zip")?.trim();
  const lat = q.get("lat");
  const lon = q.get("lon");
  const fips = q.get("fips");
  if (zip && /^\d{5}$/.test(zip)) {
    (form.elements.namedItem("zip") as HTMLInputElement).value = zip;
    void lookup({ zip }, { remember: true });
  } else if (lat && lon) {
    void lookup({ lat, lon }, { remember: true });
  } else if (fips && /^\d{5}$/.test(fips)) {
    void lookup({ fips }, { remember: true });
  } else {
    const last = readLast();
    if (last?.fips) void lookup({ fips: last.fips }, { remember: false });
    else void lookup({ here: "1" }, { remember: false });
  }
}
