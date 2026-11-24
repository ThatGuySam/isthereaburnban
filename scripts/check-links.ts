import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import states from "../src/data/states.json";
import { attributes } from "../src/worker/sources/lib/html";
import { BlockedError, fetchSource, HttpError, SourceNetworkError, type HttpFetch } from "../src/worker/sources/lib/http";
import { SOURCES } from "../src/worker/sources/registry";

type Link = { url: string; contexts: Set<string> };

export function htmlLinks(html: string): string[] {
  const links: string[] = [];
  for (const [, tag, attrs] of html.matchAll(/<(a|iframe)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)) {
    const fields = attributes(attrs);
    const url = tag.toLowerCase() === "a" ? fields.href : fields.src;
    if (url && /^(?:https?:)?\/\//i.test(url)) links.push(url.startsWith("//") ? "https:" + url : url);
  }
  return links;
}

async function scan(directory: string, add: (url: string, context: string) => void) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (reason) {
    if (directory === "dist" && (reason as { code?: string })?.code === "ENOENT") return;
    throw reason;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path, add);
    else if (entry.isFile() && path.endsWith(".html")) {
      for (const url of new Set(htmlLinks(await readFile(path, "utf8")))) add(url, path);
    }
  }
}

const ARKANSAS_REPORT = "https://mip.agri.arkansas.gov/agtools/Forestry/Fire_Info/Burn_Bans";
const TENNESSEE_BASE = "https://www.tn.gov/tnwildlandfire/prevention/safe-debris-burning/";
type KnownIssue = { expires: string; reason: string; matches: RegExp };

const tennesseeReset: KnownIssue = {
  expires: "2026-12-24",
  reason: "Tennessee’s AEM origin intermittently resets HTTPS connections",
  matches: /\b(?:ECONNRESET|Connection reset by peer)\b/i,
};

const arkansasChain: KnownIssue = {
  expires: "2026-12-24",
  reason: "Arkansas AgTools serves its leaf without the Sectigo OV R36 intermediate",
  matches: /\b(?:UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|unable to verify the first certificate|unable to get local issuer certificate)\b/i,
};

const knownFlaky = new Map<string, KnownIssue>([
  [ARKANSAS_REPORT, arkansasChain],
  [ARKANSAS_REPORT + "?show_districts=False", arkansasChain],
  [TENNESSEE_BASE + "burn-bans.html", tennesseeReset],
  [TENNESSEE_BASE + "permits.html", tennesseeReset],
]);

function networkDetail(reason: unknown) {
  const failure = reason instanceof SourceNetworkError ? reason.cause : reason;
  const detail = failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);
  const code = (value: unknown) => typeof value === "object" && value !== null && "code" in value &&
    typeof value.code === "string" ? value.code : undefined;
  const tag = code(failure) ?? code(failure instanceof Error ? failure.cause : undefined);
  return tag ? `${tag}: ${detail}` : detail;
}

export async function checkLink(url: string, fetcher?: HttpFetch, today = new Date().toISOString().slice(0, 10)) {
  for (let attempt = 0; ; attempt++) {
    try {
      // Use GET because several government publishers reject HEAD but serve the page.
      const reply = await fetchSource(url, { fetchImpl: fetcher, timeoutMs: 12_000, attempts: 1 });
      if (reply.notModified) return { kind: "failed", detail: "Unexpected HTTP 304" } as const;
      await reply.response.body?.cancel();
      if (reply.response.status !== 200) return { kind: "failed", detail: `HTTP ${reply.response.status}` } as const;
      return { kind: "ok", detail: "HTTP 200" } as const;
    } catch (reason) {
      if (reason instanceof BlockedError) return { kind: "blocked", detail: reason.message } as const;
      const detail = reason instanceof HttpError ? `HTTP ${reason.status} at ${reason.url}` : networkDetail(reason);
      const known = knownFlaky.get(url);
      if (known?.matches.test(detail)) {
        if (today < known.expires) {
          return { kind: "knownFlaky", detail: `${detail} | ${known.reason} (expires ${known.expires})` } as const;
        }
        return { kind: "failed", detail: `${detail} | allowlist expired ${known.expires}: ${known.reason}` } as const;
      }
      const transient = reason instanceof HttpError
        ? reason.status === 408 || reason.status === 429 || reason.status >= 500
        : /TimeoutError|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(detail);
      if (attempt || !transient) return { kind: "failed", detail } as const;
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    }
  }
}

async function main(): Promise<number> {
  const links = new Map<string, Link>();
  const add = (raw: string, context: string) => {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`Invalid HTTP link in ${context}`);
    parsed.hash = "";
    const link = links.get(parsed.href) ?? { url: parsed.href, contexts: new Set<string>() };
    link.contexts.add(context);
    links.set(parsed.href, link);
  };
  for (const state of states) {
    add(state.officialUrl, `states.json ${state.abbr}`);
    for (const extra of state.extraUrls ?? []) add(extra.url, `states.json ${state.abbr} / ${extra.label}`);
  }
  for (const source of SOURCES) {
    add(source.officialUrl, `registry ${source.id} official`);
    add(source.sourceUrl, `registry ${source.id} feed`);
  }
  await scan("dist", add);

  const domains = new Map<string, Link[]>();
  for (const link of links.values()) {
    const host = new URL(link.url).hostname;
    const list = domains.get(host) ?? [];
    list.push(link);
    domains.set(host, list);
  }
  const remaining = domains.values();
  const counts = { ok: 0, blocked: 0, knownFlaky: 0, failed: 0 };
  const results: string[] = [];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (const group of remaining) {
      let nextStart = 0;
      for (const link of group) {
        const pause = nextStart - Date.now();
        if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
        nextStart = Date.now() + 1100;
        const outcome = await checkLink(link.url);
        counts[outcome.kind]++;
        if (outcome.kind === "ok") continue;
        const contexts = [...link.contexts];
        const examples = contexts.slice(0, 4).join(", ") + (contexts.length > 4 ? ` and ${contexts.length - 4} more` : "");
        results.push(`${outcome.kind === "knownFlaky" ? "KNOWN-FLAKY" : outcome.kind.toUpperCase()} ${link.url} | ${outcome.detail} | ${examples}`);
      }
    }
  }));
  for (const line of results.sort()) console.log(line);
  console.log(`${links.size} URLs checked. ${counts.ok} OK, ${counts.blocked} blocked, ${counts.knownFlaky} known-flaky, ${counts.failed} failed.`);
  return counts.failed ? 1 : 0;
}

const entry = import.meta;
if ("main" in entry && entry.main) process.exitCode = await main();
