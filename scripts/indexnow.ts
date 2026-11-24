// Submit the sitemap's URLs to IndexNow (Bing, Yandex, Seznam, Naver, Yep and others share submissions).
//
//   bun run indexnow                 dry run: print the payload(s), send nothing
//   bun run indexnow --core          only the core sitemap (home, map, hubs, developers, data)
//   bun run indexnow --send          POST to api.indexnow.org (only after the key file is live on the domain)
//
// URLs mirror src/worker/pages.ts handleSitemap. City pages come from dist/data/cities/, so run `bun run build` first.
// A 403 right after deploy (key not yet verified) is normal; retry later. 200/202 mean received, not indexed.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import counties from "../src/data/counties.json";
import { STATES } from "../src/shared/states-fips";
import { CORE_PATHS } from "../src/worker/pages";

const HOST = "isthereaburnban.com";
const ORIGIN = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS = 10_000; // IndexNow limit per POST

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const send = args.has("--send");
const coreOnly = args.has("--core");

const keyFiles = readdirSync(join(root, "public")).filter((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (keyFiles.length !== 1) throw new Error(`expected exactly one IndexNow key file in public/, found ${keyFiles.length}`);
const key = readFileSync(join(root, "public", keyFiles[0]), "utf8").trim();
if (`${key}.txt` !== keyFiles[0]) throw new Error("key file name and contents differ");

function cityRows(st: string): [string, string[]][] {
  const file = join(root, "dist", "data", "cities", `${st}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as [string, string[]][]) : [];
}

if (!existsSync(join(root, "dist", "data", "cities"))) console.error("warning: dist/data/cities missing; run `bun run build` to include city pages");

const paths: string[] = [...CORE_PATHS];
for (const s of STATES) {
  const st = s.abbr.toLowerCase();
  paths.push(`/us/${st}/`);
  if (cityRows(st).length) paths.push(`/us/${st}/city/`);
}
if (!coreOnly) {
  for (const s of STATES) {
    const st = s.abbr.toLowerCase();
    const mine = (counties as { state: string; slug: string }[]).filter((c) => c.state === s.abbr).sort((a, b) => a.slug.localeCompare(b.slug));
    for (const c of mine) paths.push(`/us/${st}/${c.slug}/`);
    for (const [slug] of cityRows(st)) paths.push(`/us/${st}/city/${slug}/`);
  }
}

const urls = [...new Set(paths)].map((p) => ORIGIN + p);
const batches: string[][] = [];
for (let i = 0; i < urls.length; i += MAX_URLS) batches.push(urls.slice(i, i + MAX_URLS));

for (const [i, urlList] of batches.entries()) {
  const payload = { host: HOST, key, keyLocation: `${ORIGIN}/${key}.txt`, urlList };
  if (!send) {
    console.log(JSON.stringify(payload, null, 2));
    continue;
  }
  const res = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(payload) });
  console.error(`batch ${i + 1}/${batches.length}: ${urlList.length} URLs -> HTTP ${res.status} ${await res.text()}`);
}
console.error(`${send ? "sent" : "dry run, nothing sent:"} ${urls.length} URLs in ${batches.length} batch(es) for ${HOST}${send ? "" : " (add --send to submit)"}`);
