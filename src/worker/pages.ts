// Server side of the static pages: inject live status into prerendered county pages, and build sitemaps.
import countiesData from "../data/counties.json";
import statesData from "../data/states.json";
import { escapeHtml, heroStyle, renderStatusHtml, shortDate, statusTheme, unknownStatus } from "../shared/render";
import { STATES } from "../shared/states-fips";
import type { CountyStatus, Snapshot, StateDirectoryEntry } from "../shared/types";
import type { Env } from "./env";

type County = { fips: string; state: string; stateFips: string; name: string; slug: string };

const COUNTIES = countiesData as County[];
const STATE_DIR = new Map((statesData as StateDirectoryEntry[]).map((s) => [s.abbr, s]));
const BY_PATH = new Map(COUNTIES.map((c) => [`${c.state.toLowerCase()}/${c.slug}`, c]));

const PAGE_CACHE = "public, max-age=300";

function countyStatus(snapshot: Snapshot, c: County): CountyStatus {
  return snapshot.counties[c.fips] ?? unknownStatus(c, STATE_DIR.get(c.state), snapshot.generated);
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

export async function handlePage(request: Request, env: Env, snapshot: Snapshot): Promise<Response> {
  const url = new URL(request.url);
  // Static assets handle trailing-slash redirects (/us/ok/tulsa-county -> /us/ok/tulsa-county/) and 404s.
  const asset = await env.ASSETS.fetch(request);
  const type = asset.headers.get("content-type") ?? "";
  if (asset.status !== 200 || !type.includes("text/html")) return asset;

  const headers = new Headers(asset.headers);
  headers.set("cache-control", PAGE_CACHE);
  headers.delete("etag");
  headers.delete("content-length");

  const m = url.pathname.match(/^\/us\/([a-z]{2})\/([a-z0-9-]+)\/$/);
  const county = m ? BY_PATH.get(`${m[1]}/${m[2]}`) : undefined;
  if (!county) return new Response(asset.body, { status: asset.status, headers });

  const cs = countyStatus(snapshot, county);
  const changed = snapshot.changed?.[county.fips];
  const theme = statusTheme(cs.status);
  const now = Date.now();

  const rewriter = new HTMLRewriter()
    .on('meta[name="theme-color"]', {
      element(el) {
        el.setAttribute("content", theme.color);
      },
    })
    .on('script[data-ld="WebPage"]', new JsonLdDateModified(changed))
    .on("[data-hero]", {
      element(el) {
        el.setAttribute("data-status", cs.status);
        el.setAttribute("style", heroStyle(cs.status));
      },
    })
    .on("[data-status-slot]", {
      element(el) {
        el.setInnerContent(renderStatusHtml(cs, { relativeTimeBase: now }), { html: true });
      },
    })
    .on("[data-status-changed]", {
      element(el) {
        if (!changed) return;
        el.removeAttribute("hidden");
        el.setInnerContent(
          `Status last changed <time datetime="${escapeHtml(changed)}">${escapeHtml(shortDate(changed))}</time>.`,
          { html: true },
        );
      },
    });

  return rewriter.transform(new Response(asset.body, { status: asset.status, headers }));
}

// ---------- Sitemaps ----------

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

function latest(dates: (string | undefined)[]): string | undefined {
  let best: string | undefined;
  let bestT = -Infinity;
  for (const d of dates) {
    const t = d ? Date.parse(d) : NaN;
    if (!Number.isNaN(t) && t > bestT) {
      bestT = t;
      best = d;
    }
  }
  return best;
}

/** /sitemap.xml (index), /sitemaps/core.xml, /sitemaps/<st>.xml. lastmod only when a status change is known. */
export async function handleSitemap(request: Request, env: Env, snapshot: Snapshot): Promise<Response> {
  const url = new URL(request.url);
  const origin = (env.SITE_URL || url.origin).replace(/\/+$/, "");
  const changed = snapshot.changed ?? {};
  const path = url.pathname;

  if (path === "/sitemap.xml") {
    const entries = [`<sitemap><loc>${escapeHtml(`${origin}/sitemaps/core.xml`)}</loc></sitemap>`];
    for (const s of STATES) {
      const last = latest(COUNTIES.filter((c) => c.state === s.abbr).map((c) => changed[c.fips]));
      entries.push(
        `<sitemap><loc>${escapeHtml(`${origin}/sitemaps/${s.abbr.toLowerCase()}.xml`)}</loc>${last ? `<lastmod>${escapeHtml(last)}</lastmod>` : ""}</sitemap>`,
      );
    }
    return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</sitemapindex>`);
  }

  if (path === "/sitemaps/core.xml") {
    const paths = ["/", "/map/", "/us/", "/developers/", ...STATES.map((s) => `/us/${s.abbr.toLowerCase()}/`)];
    return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => urlEntry(origin + p)).join("")}</urlset>`);
  }

  const m = path.match(/^\/sitemaps\/([a-z]{2})\.xml$/);
  if (m && STATES.some((s) => s.abbr.toLowerCase() === m[1])) {
    const st = m[1];
    const entries = COUNTIES.filter((c) => c.state.toLowerCase() === st)
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((c) => urlEntry(`${origin}/us/${st}/${c.slug}/`, changed[c.fips]));
    return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`);
  }

  return xml("<error>not found</error>", 404);
}
