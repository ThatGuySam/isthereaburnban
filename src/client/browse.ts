// Type-ahead for the state list (/us/) and the county list on each state page.
// The lists are real links in the HTML; this only hides rows that don't match and adds county hits.
import { countySlug } from "../shared/slug";
import { locate, lookupStatus } from "./place";

/** "St. Mary's County" -> ["st", "marys", "county"] */
export function words(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Every query word must start some word of the target ("baton" finds East Baton Rouge Parish). */
export function matches(query: string[], target: string[]): boolean {
  return query.every((q) => target.some((t) => t.startsWith(q)));
}

function announcer(el: HTMLElement | null) {
  let timer = 0;
  return (text: string) => {
    if (!el) return;
    clearTimeout(timer);
    // Wait for a pause in typing so screen readers get one message, not one per key.
    timer = window.setTimeout(() => (el.textContent = text), 450);
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Enter goes to the first visible state, else the first county hit. */
function goFirst(form: HTMLFormElement, scope: HTMLElement | Document) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const first =
      scope.querySelector<HTMLAnchorElement>("[data-group]:not([hidden]) [data-row]:not([hidden]) a") ??
      scope.querySelector<HTMLAnchorElement>("[data-hit] a");
    if (first) location.href = first.href;
  });
}

const rowWords = new WeakMap<HTMLElement, string[]>();

/** Filter the rows inside each [data-group]; hide groups that end up empty. Returns visible row count. */
function filterRows(root: HTMLElement, q: string[]): number {
  let shown = 0;
  for (const group of root.querySelectorAll<HTMLElement>("[data-group]")) {
    let inGroup = 0;
    for (const row of group.querySelectorAll<HTMLElement>("[data-row]")) {
      let w = rowWords.get(row);
      if (!w) rowWords.set(row, (w = words(row.dataset.row ?? "")));
      const ok = !q.length || matches(q, w);
      row.hidden = !ok;
      if (ok) inGroup++;
    }
    group.hidden = inGroup === 0;
    shown += inGroup;
  }
  return shown;
}

// ---------- /us/ ----------

type CountyIndex = { name: string; st: string; stName: string; words: string[]; stWords: string[] }[];
/** public/data/places/<letter>.json rows (scripts/build-places.ts), most populous first. */
type PlaceRow = [name: string, st: string, path: string, counties: string[], county: string];
type PlaceIndex = { name: string; st: string; path: string; county: string; words: string[]; stWords: string[] }[];

const COUNTY_HITS = 8;
const CITY_HITS = 6;

function hitRow(name: string, href: string, aside: string, cls: string): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset.hit = "";
  const a = document.createElement("a");
  a.className = `row ${cls}`;
  a.href = href;
  const n = document.createElement("span");
  n.className = "row-name";
  n.textContent = name;
  const st = document.createElement("span");
  st.className = "row-abbr";
  st.textContent = aside;
  a.appendChild(n);
  a.appendChild(st);
  li.appendChild(a);
  return li;
}

export function initStateFinder(): void {
  const form = document.querySelector<HTMLFormElement>("[data-finder]");
  const input = form?.querySelector<HTMLInputElement>("input[type=search]");
  const list = document.querySelector<HTMLElement>("[data-state-list]");
  const hits = document.querySelector<HTMLElement>("[data-county-hits]");
  const cityHits = document.querySelector<HTMLElement>("[data-city-hits]");
  if (!form || !input || !list || !hits || !cityHits) return;
  const cityList = cityHits.querySelector("ul")!;
  const say = announcer(document.querySelector<HTMLElement>("[data-finder-status]"));
  const hitList = hits.querySelector("ul")!;
  const more = hits.querySelector<HTMLElement>("[data-more]")!;
  const stateNames: Record<string, string> = {};
  for (const a of list.querySelectorAll<HTMLAnchorElement>("[data-abbr]")) stateNames[a.dataset.abbr!] = a.dataset.name!;

  let index: CountyIndex | null = null;
  let loading: Promise<void> | null = null;
  const load = () =>
    (loading ??= fetch("/data/counties-by-state.json")
      .then((r) => r.json() as Promise<Record<string, string[]>>)
      .then((by) => {
        index = Object.entries(by).flatMap(([st, names]) => {
          const stName = stateNames[st] ?? st;
          const stWords = [st.toLowerCase(), ...words(stName)];
          return names.map((name) => ({ name, st, stName, words: words(name), stWords }));
        });
        render();
      })
      .catch(() => {
        loading = null;
      }));

  // Cities load one first-letter shard at a time (a few KB gzipped), only once someone types.
  const shards = new Map<string, PlaceIndex | Promise<void>>();
  function cityIndex(letter: string): PlaceIndex | null {
    const have = shards.get(letter);
    if (Array.isArray(have)) return have;
    if (!have)
      shards.set(
        letter,
        fetch(`/data/places/${letter}.json`)
          .then((r) => (r.ok ? (r.json() as Promise<PlaceRow[]>) : []))
          .then((rows) => {
            shards.set(
              letter,
              rows.map(([name, st, path, , county]) => ({ name, st, path, county, words: words(name), stWords: [st.toLowerCase(), ...words(stateNames[st] ?? st)] })),
            );
            render();
          })
          .catch(() => void shards.delete(letter)),
      );
    return null;
  }

  function cityHitsFor(q: string[]) {
    const letter = q[0]?.[0];
    const idx = letter ? cityIndex(/[a-z]/.test(letter) ? letter : "0") : null;
    if (!idx) return { list: [] as PlaceIndex, total: 0 };
    const found = idx.filter((c) => c.words.some((w) => w.startsWith(q[0])) && matches(q, [...c.words, ...c.stWords]));
    const lead = q.join(" ");
    // Prefix matches first; otherwise keep the shard's population order.
    const sorted = [...found].sort((a, b) => Number(!a.name.toLowerCase().startsWith(lead)) - Number(!b.name.toLowerCase().startsWith(lead)));
    return { list: sorted.slice(0, CITY_HITS), total: found.length };
  }

  function countyHits(q: string[]) {
    if (!index || !q.length) return { list: [] as CountyIndex, total: 0 };
    // The first word must hit the county name so "texas" doesn't list all 254 Texas counties.
    const found = index.filter((c) => c.words.some((w) => w.startsWith(q[0])) && matches(q, [...c.words, ...c.stWords]));
    const lead = q.join(" ");
    found.sort((a, b) => Number(!a.name.toLowerCase().startsWith(lead)) - Number(!b.name.toLowerCase().startsWith(lead)) || a.name.localeCompare(b.name) || a.st.localeCompare(b.st));
    return { list: found.slice(0, COUNTY_HITS), total: found.length };
  }

  function render() {
    const q = words(input!.value);
    document.body.toggleAttribute("data-filtering", q.length > 0);
    const states = filterRows(list!, q);
    const { list: found, total } = countyHits(q);
    const { list: cities, total: cityTotal } = cityHitsFor(q);
    cityList.replaceChildren(...cities.map((c) => hitRow(c.name, c.path, `${c.county}, ${stateNames[c.st] ?? c.st}`, "row--city")));
    cityHits!.hidden = cities.length === 0;
    hitList.replaceChildren(...found.map((c) => hitRow(c.name, `/us/${c.st.toLowerCase()}/${countySlug(c.name)}/`, c.stName, "row--county")));
    more.textContent = total > found.length ? `${total - found.length} more. Keep typing to narrow it down.` : "";
    hits!.hidden = found.length === 0;
    if (!q.length) return say("");
    if (!index) return say(plural(states, "state", "states"));
    if (!states && !total && !cityTotal) return say("No matches. Try “Use my location”.");
    say(`${plural(states, "state", "states")}, ${plural(cityTotal, "city or town", "cities and towns")}, ${plural(total, "county", "counties")}`);
  }

  input.addEventListener("focus", load, { once: true });
  input.addEventListener("input", () => {
    void load();
    render();
  });
  goFirst(form, document);
  if (input.value) {
    void load();
    render();
  }
  initLocate(say);
}

/** "Use my location": straight to the county page, no sheet needed. */
function initLocate(say: (t: string) => void) {
  const btn = document.querySelector<HTMLButtonElement>("[data-locate]");
  const msg = document.querySelector<HTMLElement>("[data-locate-msg]");
  if (!btn) return;
  const show = (t: string) => (msg ? (msg.textContent = t) : say(t));
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    show("Finding you…");
    try {
      const { lat, lon } = await locate();
      const r = (await lookupStatus({ lat, lon })).results?.[0];
      if (!r?.url) throw new Error("none");
      show(`Opening ${r.county}, ${r.state}…`);
      location.href = r.url;
    } catch (err) {
      show(
        err instanceof GeolocationPositionError || (err as Error)?.message === "unsupported"
          ? "Location is off. Type your state or county instead."
          : (err as Error)?.message === "none"
            ? "We couldn't find a US county there."
            : "Lookup failed. Try again in a minute.",
      );
      btn.disabled = false;
    }
  });
}

// ---------- /us/{st}/ ----------

type BanRow = { fips: string; county: string; status: string };

export function initCountyFinder(): void {
  const list = document.querySelector<HTMLElement>("[data-county-list]");
  if (!list) return;
  loadBans(list);
  const form = document.querySelector<HTMLFormElement>("[data-finder]");
  const input = form?.querySelector<HTMLInputElement>("input[type=search]");
  if (!form || !input) return;
  const say = announcer(document.querySelector<HTMLElement>("[data-finder-status]"));
  const unit = list.dataset.unit ?? "counties";
  const one = list.dataset.unitOne ?? "county";

  input.addEventListener("input", () => {
    const q = words(input.value);
    document.body.toggleAttribute("data-filtering", q.length > 0);
    const n = filterRows(list, q);
    say(!q.length ? "" : n ? plural(n, one, unit) : `No ${unit} match.`);
  });
  goFirst(form, list);
}

function loadBans(list: HTMLElement) {
  const count = document.querySelector<HTMLElement>("[data-ban-count]");
  const box = document.querySelector<HTMLDetailsElement>("[data-banned]");
  if (!count || !box) return;
  // With nothing to expand, the disclosure becomes a plain sentence.
  const flatten = (text: string, strong = true) => {
    const p = document.createElement("p");
    p.setAttribute("aria-live", "polite");
    const t = document.createElement(strong ? "strong" : "span");
    t.textContent = text;
    p.appendChild(t);
    box.replaceWith(p);
  };
  fetch(`/api/v1/bans?state=${count.dataset.state}`)
    .then((r) => (r.ok ? (r.json() as Promise<{ counties: BanRow[] }>) : Promise.reject()))
    .then((d) => {
      const bans = d.counties.filter((c) => c.status === "ban");
      const restricted = d.counties.filter((c) => c.status === "restricted");
      const parts = [`${plural(bans.length, "county", "counties")} under a burn ban right now`];
      if (restricted.length) parts.push(`${restricted.length} with restrictions`);
      const sentence = parts.join(", ") + ".";

      const rows = new Map([...list.querySelectorAll<HTMLElement>("[data-fips]")].map((li) => [li.dataset.fips!, li]));
      const top: HTMLElement[] = [];
      for (const c of [...bans, ...restricted]) {
        const li = rows.get(c.fips);
        if (!li) continue;
        const tag = document.createElement("span");
        tag.className = `tag tag--${c.status}`;
        tag.textContent = c.status === "ban" ? "Burn ban" : "Restricted";
        li.querySelector("a")?.appendChild(tag);
        const copy = li.cloneNode(true) as HTMLElement;
        copy.removeAttribute("data-row");
        copy.removeAttribute("data-fips");
        top.push(copy);
      }
      if (!top.length) return flatten(sentence);
      const strong = document.createElement("strong");
      strong.textContent = sentence;
      const hint = document.createElement("span");
      hint.className = "banned-hint";
      hint.textContent = "Show them";
      count.replaceChildren(strong, hint);
      box.querySelector("ul")?.replaceChildren(...top);
      // A short list is worth showing outright; a long one stays one tap away (every row is also tagged below).
      box.open = top.length <= 8;
    })
    .catch(() => flatten("Live counts are unavailable right now.", false));
}
