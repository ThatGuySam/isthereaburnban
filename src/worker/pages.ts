// Server side of the static pages: inject live status into prerendered county pages, and build sitemaps.
import countiesData from "../data/counties.json";
import cityStates from "../data/places-states.json";
import { answerMeta, escapeHtml, heroStyle, localDate, renderStatusHtml, renderStatusLine, statusTheme } from "../shared/render";
import { STATES, STATE_BY_ABBR } from "../shared/states-fips";
import type { CountyStatus, SnapshotData } from "../shared/types";
import { statusFor } from "./lookup";
import type { Env } from "./env";
import type { SnapshotReader } from "./snapshot";
import { latest } from "./snapshot-v2";

type County = { fips: string; state: string; stateFips: string; name: string; slug: string };

const COUNTIES = countiesData as County[];
const BY_PATH = new Map(COUNTIES.map((c) => [`${c.state.toLowerCase()}/${c.slug}`, c]));

const PAGE_CACHE = "public, max-age=300";

function countyStatus(snapshot: SnapshotData, c: County): CountyStatus {
  return statusFor(snapshot, c.fips);
}

/** Collects a text node across chunks and replaces it once complete. */
class JsonLdDateModified {
  private buf = "";
  constructor(private readonly dateModified: string | undefined) {}
  text(chunk: Text) {
    this.buf += chunk.text;
    if (!chunk.lastInTextNode) {
      chunk.remove();
      return;
    }
    let out = this.buf;
    try {
      const data = JSON.parse(this.buf) as Record<string, unknown>;
      if (this.dateModified) data.dateModified = this.dateModified;
      out = JSON.stringify(data).replace(/</g, "\\u003c");
    } catch {
      /* leave the original JSON untouched */
    }
    chunk.replace(out, { html: true });
    this.buf = "";
  }
}

const COUNTY_BY_FIPS = new Map(COUNTIES.map((c) => [c.fips, c]));

/** Answer for the page's counties, read from <html data-answer-fips> before the head streams by. */
type PageAnswer = { list: CountyStatus[]; changed?: string; meta: { title: string; description: string } | null };

function pageAnswer(snapshot: SnapshotData, question: string, fipsAttr: string, city: string | null): PageAnswer | null {
  const list = fipsAttr
    .split(",")
    .map((f) => COUNTY_BY_FIPS.get(f.trim()))
    .filter((c): c is County => Boolean(c))
    .map((c) => countyStatus(snapshot, c));
  if (!list.length) return null;
  const changed = latest(list.map((c) => snapshot.changed?.[c.fips]));
  return { list, changed, meta: answerMeta(question, list, city ?? undefined) };
}

/** `Link` header pointing agents at the JSON for this page. */
function apiLink(path: string): string | null {
  const city = path.match(/^\/us\/([a-z]{2})\/city\/([a-z0-9-]+)\/$/);
  if (city) return `</api/v1/status?city=${city[2]}&state=${city[1].toUpperCase()}>; rel="alternate"; type="application/json"`;
  const m = path.match(/^\/us\/([a-z]{2})\/([a-z0-9-]+)\/$/);
  const c = m ? BY_PATH.get(`${m[1]}/${m[2]}`) : undefined;
  return c ? `</api/v1/status?fips=${c.fips}>; rel="alternate"; type="application/json"` : null;
}

export async function handlePage(request: Request, env: Env, snapshots: SnapshotReader): Promise<Response> {
  const url = new URL(request.url);
  // Static assets handle trailing-slash redirects (/us/ok/tulsa-county -> /us/ok/tulsa-county/) and 404s.
  const asset = await env.ASSETS.fetch(request);
  const type = asset.headers.get("content-type") ?? "";
  if (asset.status !== 200 || !type.includes("text/html")) return asset;

  const headers = new Headers(asset.headers);
  headers.set("cache-control", PAGE_CACHE);
  headers.delete("etag");
  headers.delete("content-length");
  const link = apiLink(url.pathname);
  if (link) headers.append("link", link);
  const state = url.pathname.split("/")[2]?.toUpperCase();
  const snapshot = link && state && STATE_BY_ABBR[state] ? await snapshots.state(state) : null;

  const now = Date.now();
  let answer: PageAnswer | null = null;
  let ldFor: JsonLdDateModified | undefined;
  const setMeta = (value: (a: PageAnswer) => string | undefined) => ({
    element(el: Element) {
      const v = answer?.meta ? value(answer) : undefined;
      if (v) el.setAttribute("content", v);
    },
  });

  const rewriter = new HTMLRewriter()
    .on("html", {
      element(el) {
        const fips = el.getAttribute("data-answer-fips");
        if (fips && snapshot) answer = pageAnswer(snapshot, el.getAttribute("data-q") ?? "", fips, el.getAttribute("data-city"));
      },
    })
    .on("title", {
      element(el) {
        if (answer?.meta) el.setInnerContent(answer.meta.title);
      },
    })
    .on('meta[name="description"]', setMeta((a) => a.meta?.description))
    .on('meta[property="og:title"]', setMeta((a) => a.meta?.title))
    .on('meta[property="og:description"]', setMeta((a) => a.meta?.description))
    .on('meta[name="theme-color"]', {
      element(el) {
        if (answer) el.setAttribute("content", statusTheme(answer.list[0].status).color);
      },
    })
    .on('script[data-ld="WebPage"]', {
      text(chunk) {
        // Delegate lazily: the answer (and its change date) is known by the time the head's scripts stream by.
        ldFor ??= new JsonLdDateModified(answer?.changed);
        ldFor.text(chunk);
      },
    })
    .on("[data-hero]", {
      element(el) {
        if (!answer) return;
        el.setAttribute("data-status", answer.list[0].status);
        el.setAttribute("style", heroStyle(answer.list[0].status));
      },
    })
    .on("[data-status-slot]", {
      element(el) {
        const c = COUNTY_BY_FIPS.get(el.getAttribute("data-fips") ?? "");
        if (!c || !snapshot) return;
        const note = el.getAttribute("data-note") ?? undefined;
        el.setInnerContent(renderStatusHtml(countyStatus(snapshot, c), { relativeTimeBase: now, note }), { html: true });
      },
    })
    .on("[data-status-line]", {
      element(el) {
        const c = COUNTY_BY_FIPS.get(el.getAttribute("data-fips") ?? "");
        if (c && snapshot) el.setInnerContent(renderStatusLine(countyStatus(snapshot, c)), { html: true });
      },
    })
    .on("[data-status-changed]", {
      element(el) {
        if (!answer) return;
        const first = answer.list[0];
        const parts: string[] = [];
        // Absolute dates in the HTML, for readers and agents that never run the relative-time script.
        if (first.sourceUrl && first.checked) parts.push(`Checked <time datetime="${escapeHtml(first.checked)}">${escapeHtml(localDate(first.checked, first.state))}</time>.`);
        if (answer.changed) parts.push(`Status last changed <time datetime="${escapeHtml(answer.changed)}">${escapeHtml(localDate(answer.changed, first.state))}</time>.`);
        if (!parts.length) return;
        el.removeAttribute("hidden");
        el.setInnerContent(parts.join(" "), { html: true });
      },
    });

  return rewriter.transform(new Response(asset.body, { status: asset.status, headers }));
}

// ---------- Sitemaps ----------

/** Site-wide pages listed first in /sitemaps/core.xml (state hubs and city indexes follow). Also used by scripts/indexnow.ts. */
export const CORE_PATHS = ["/", "/map/", "/us/", "/developers/", "/data/"];

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

function xml(body: string, status = 200): Response {
  return new Response(XML_HEAD + body, {
    status,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

function urlEntry(loc: string, lastmod?: string): string {
  return `<url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${escapeHtml(lastmod)}</lastmod>` : ""}</url>`;
}

/** [[slug, county FIPS[]]] for a state's city pages (static asset from src/pages/data/cities/[st].json.ts). */
async function cityRows(env: Env, st: string): Promise<[string, string[]][]> {
  const res = await env.ASSETS.fetch(new Request(`https://assets.local/data/cities/${st.toLowerCase()}.json`));
  return res.ok ? ((await res.json()) as [string, string[]][]) : [];
}

/** /sitemap.xml (index), /sitemaps/core.xml, /sitemaps/<st>.xml (counties + cities). lastmod only when a status change is known. */
const CITY_STATES = new Set(cityStates);

export async function handleSitemap(request: Request, env: Env, snapshots: SnapshotReader): Promise<Response> {
  const url = new URL(request.url);
  const origin = (env.SITE_URL || url.origin).replace(/\/+$/, "");
  const path = url.pathname;

  if (path === "/sitemap.xml") {
    const changed = await snapshots.lastChanged();
    const entries = [`<sitemap><loc>${escapeHtml(`${origin}/sitemaps/core.xml`)}</loc></sitemap>`];
    for (const s of STATES) {
      const last = changed[s.abbr];
      entries.push(
        `<sitemap><loc>${escapeHtml(`${origin}/sitemaps/${s.abbr.toLowerCase()}.xml`)}</loc>${last ? `<lastmod>${escapeHtml(last)}</lastmod>` : ""}</sitemap>`,
      );
    }
    return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</sitemapindex>`);
  }

  if (path === "/sitemaps/core.xml") {
    const cityIndexes = STATES.filter((s) => CITY_STATES.has(s.abbr)).map((s) => `/us/${s.abbr.toLowerCase()}/city/`);
    const paths = [...CORE_PATHS, ...STATES.map((s) => `/us/${s.abbr.toLowerCase()}/`), ...cityIndexes];
    return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => urlEntry(origin + p)).join("")}</urlset>`);
  }

  const m = path.match(/^\/sitemaps\/([a-z]{2})\.xml$/);
  if (m && STATE_BY_ABBR[m[1].toUpperCase()]) {
    const st = m[1];
    const [snapshot, cities] = await Promise.all([snapshots.state(st.toUpperCase(), { checks: false, weather: false }), cityRows(env, st)]);
    const changed = snapshot.changed ?? {};
    const entries = COUNTIES.filter((c) => c.state.toLowerCase() === st)
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((c) => urlEntry(`${origin}/us/${st}/${c.slug}/`, changed[c.fips]));
    // City pages change when any county they sit in changes.
    for (const [slug, fips] of cities) {
      entries.push(urlEntry(`${origin}/us/${st}/city/${slug}/`, latest(fips.map((f) => changed[f]))));
    }
    return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`);
  }

  return xml("<error>not found</error>", 404);
}
