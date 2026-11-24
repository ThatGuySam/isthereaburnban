import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import states from "../src/data/states.json";
import { attributes } from "../src/worker/sources/lib/html";
import { BlockedError, fetchSource, HttpError, type HttpFetch } from "../src/worker/sources/lib/http";
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

export async function checkLink(url: string, fetcher?: HttpFetch) {
  try {
    // Use GET because several government publishers reject HEAD but serve the page.
    const reply = await fetchSource(url, { fetchImpl: fetcher, timeoutMs: 12_000, attempts: 1 });
    if (reply.notModified) return { kind: "failed", detail: "Unexpected HTTP 304" } as const;
    await reply.response.body?.cancel();
    if (reply.response.status !== 200) return { kind: "failed", detail: `HTTP ${reply.response.status}` } as const;
    return { kind: "ok", detail: "HTTP 200" } as const;
  } catch (reason) {
    if (reason instanceof BlockedError) return { kind: "blocked", detail: reason.message } as const;
    if (reason instanceof HttpError) return { kind: "failed", detail: `HTTP ${reason.status} at ${reason.url}` } as const;
    const detail = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
    const code = (reason as { code?: string; cause?: { code?: string } })?.code ??
      (reason as { cause?: { code?: string } })?.cause?.code;
    return { kind: "failed", detail: code ? `${code}: ${detail}` : detail } as const;
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
  const counts = { ok: 0, blocked: 0, failed: 0 };
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
        results.push(`${outcome.kind.toUpperCase()} ${link.url} | ${outcome.detail} | ${examples}`);
      }
    }
  }));
  for (const line of results.sort()) console.log(line);
  console.log(`${links.size} URLs checked. ${counts.ok} OK, ${counts.blocked} blocked, ${counts.failed} failed.`);
  return counts.failed ? 1 : 0;
}

const entry = import.meta;
if ("main" in entry && entry.main) process.exitCode = await main();
