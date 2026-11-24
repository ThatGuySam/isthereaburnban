import { readFileSync } from "node:fs";
import type { CountyStatus } from "../src/shared/types";
import { ADAPTERS } from "../src/worker/adapters";
import { parse as parseFl } from "../src/worker/adapters/fl";
import { parse as parseIa } from "../src/worker/adapters/ia";
import { parse as parseIn } from "../src/worker/adapters/in";
import { parse as parseLa } from "../src/worker/adapters/la";
import { parse as parseMs } from "../src/worker/adapters/ms";
import { parse as parseOk } from "../src/worker/adapters/ok";
import { parse as parseTx, parseTxt } from "../src/worker/adapters/tx";
import { COUNTIES } from "../src/worker/counties";
import { parsePfirs, pfirs } from "../src/worker/sources/ca/pfirs";
import { codedDomains, dataLastEditDate, findOperationalLayers } from "../src/worker/sources/lib/arcgis";
import { webFormsPost } from "../src/worker/sources/lib/aspnet";
import { activeRule, CALENDAR_RULES } from "../src/worker/sources/lib/calendar";
import { civicPlusNotices } from "../src/worker/sources/lib/civicplus";
import { decodeFeed, parseCsv, parseFeed, parseJson } from "../src/worker/sources/lib/feeds";
import { blockAfterHeading, parseHtml } from "../src/worker/sources/lib/html";
import { BlockedError, fetchSource } from "../src/worker/sources/lib/http";
import { manualPdf } from "../src/worker/sources/lib/pdf";
import { sharePointListItems } from "../src/worker/sources/lib/sharepoint";
import { parseNinjaRows, parseWpItems } from "../src/worker/sources/lib/wordpress";
import { mergeSources, type SourceInput } from "../src/worker/sources/merge";
import { miPermits, parseMichiganPermits } from "../src/worker/sources/mi/permits";
import { mnRestrictions, parseMinnesotaRestrictions } from "../src/worker/sources/mn/restrictions";
import { njRestrictions, parseNjRestrictions } from "../src/worker/sources/nj/restrictions";
import { ohSeasonal, parseOhioSeasonal } from "../src/worker/sources/oh/seasonal";
import { parseWisconsinPermits, wiPermits } from "../src/worker/sources/wi/permits";

const sourceUrl = new URL("../src/worker/sources/", import.meta.url);
const from = (path: string) => readFileSync(new URL(path, sourceUrl));
const utf8 = (path: string) => from(path).toString("utf8");
const fixture = (name: string) => utf8(`lib/fixtures/${name}`);
const adapter = (name: string) => utf8(`../adapters/fixtures/${name}.json`);
const raw = (path: string) => Uint8Array.from(from(path)).buffer;
const now = new Date("2026-11-24T05:00:52Z");
const checked = now.toISOString();
const [ok, tx, fl, ind, la, ms, ia] = ["ok", "tx", "fl", "in", "la", "ms", "ia"].map(adapter);
const txText = raw("../adapters/fixtures/tx.txt");
const pfirsHtml = utf8("ca/fixtures/pfirs.html");
const miMap = utf8("mi/fixtures/permits-2026-11-24.json");
const njDivisions = utf8("nj/fixtures/divisions-2026-11-24.json");
const njCounties = utf8("nj/fixtures/counties-2026-11-24.json");
const wiPermitsJson = utf8("wi/fixtures/permits-2026-11-24.json");
const mnRestrictionsJson = utf8("mn/fixtures/restrictions-2026-11-24.json");
const ohStatute = utf8("oh/fixtures/section-1503.18-2026-11-24.html");
const michigan = fixture("michigan-form.html");
const kentucky = fixture("kentucky-list.html");
const placer = fixture("placer-newsflash.html");
const akamai = fixture("akamai.html");
const faulkner = fixture("faulkner-search.json");
const layer = fixture("alaska-layer.json");
const dashboard = fixture("fl-dashboard.json");
const webmap = fixture("fl-webmap.json");
const csv = fixture("wisconsin.csv");
const json = fixture("wisconsin.json");
const rss = raw("lib/fixtures/texas-rss.xml");
const pdf = raw("lib/fixtures/faulkner-rescind.pdf");
const parseCaFixture = () => parsePfirs(parseHtml(pfirsHtml), now);
const parseMiFixture = () => parseMichiganPermits(JSON.parse(miMap), now);
const parseNjFixture = () => parseNjRestrictions(JSON.parse(njDivisions), JSON.parse(njCounties), now);
const parseWiFixture = () => parseWisconsinPermits(wiPermitsJson, now);
const parseMnFixture = () => parseMinnesotaRestrictions(mnRestrictionsJson, now);
const parseOhFixture = () => parseOhioSeasonal(parseHtml(ohStatute), now);

const adapters: Array<[string, () => CountyStatus[]]> = [
  ["OK ArcGIS", () => parseOk(JSON.parse(ok), checked)],
  ["TX ArcGIS", () => parseTx(JSON.parse(tx), checked)],
  ["TX UTF-16 fallback", () => parseTxt(txText, checked)],
  ["FL ArcGIS", () => parseFl(JSON.parse(fl), checked)],
  ["IN ArcGIS", () => parseIn(JSON.parse(ind), checked)],
  ["LA ArcGIS", () => parseLa(JSON.parse(la), checked)],
  ["MS Ninja Tables", () => parseMs(JSON.parse(ms), checked)],
  ["IA ArcGIS", () => parseIa(JSON.parse(ia), checked)],
];

const recordedInputs: SourceInput[] = ADAPTERS.map((source, index) => ({
  source, rows: adapters[index < 2 ? index : index + 1][1](), checked,
}));
recordedInputs.push(
  { source: pfirs, rows: parseCaFixture(), checked },
  { source: miPermits, rows: parseMiFixture(), checked },
  { source: njRestrictions, rows: parseNjFixture(), checked },
  { source: wiPermits, rows: parseWiFixture(), checked },
  { source: mnRestrictions, rows: parseMnFixture(), checked },
  { source: ohSeasonal, rows: await parseOhFixture(), checked },
);

const states = new Map<string, CountyStatus[]>();
for (const { state, fips, name } of COUNTIES) {
  const row: CountyStatus = {
    fips, state, county: name, status: "none", label: "No burn ban", checked, since: null,
    expires: null, sourceUpdated: null, sourceName: "Example forestry office",
    sourceUrl: "https://example.gov/feed", officialUrl: "https://example.gov/",
  };
  const rows = states.get(state);
  if (rows) rows.push(row);
  else states.set(state, [row]);
}
const fullInputs: SourceInput[] = [...states].map(([state, rows]) => ({
  source: { id: state.toLowerCase(), state, mode: "full", scope: "county" }, checked, rows,
}));
const serializedFull = fullInputs.map(({ rows }) => JSON.stringify(rows));

const jobs: Array<[string, () => unknown]> = [
  ["HTTP challenge sniff", async () => {
    try { await fetchSource("https://burnpermit.fire.ca.gov/", { fetchImpl: async () => new Response(akamai) }); }
    catch (err) { if (!(err instanceof BlockedError)) throw err; }
  }],
  ["ArcGIS domains and edit date", () => {
    const meta = JSON.parse(layer);
    return [codedDomains(meta), dataLastEditDate(meta)];
  }],
  ["ArcGIS Dashboard/WebMap", () => findOperationalLayers("1f6572c92f8d41ec860f461ea433819b", {
    read: async (url) => JSON.parse(url.includes("1f6572c92f8d41ec860f461ea433819b") ? dashboard : webmap),
  })],
  ["HTML extract", () => blockAfterHeading(parseHtml(pfirsHtml).blocks, /prescribed burn/i)],
  ["WordPress REST and Ninja", () => [parseWpItems(JSON.parse(faulkner)), parseNinjaRows(JSON.parse(ms))]],
  ["CivicPlus News Flash", () => civicPlusNotices(parseHtml(placer, { links: true }), "https://www.placer.ca.gov/")],
  ["ASP.NET WebForms", () => webFormsPost(michigan, "https://www2.dnr.state.mi.us/burnpermits/", "ctl00$ContentPlaceHolder1$CntyName")],
  ["SharePoint list", () => sharePointListItems(parseHtml(kentucky), /current burn bans/i)],
  ["Wisconsin CSV", () => parseCsv(csv)],
  ["Wisconsin JSON", () => parseJson(json, Array.isArray)],
  ["Texas UTF-16 RSS", () => parseFeed(decodeFeed(rss))],
  ["Manual PDF hash", () => manualPdf(new Response(pdf))],
  ["Calendar rules", () => Object.values(CALENDAR_RULES).map((rule) => activeRule(rule, now, "Gwinnett County"))],
  ...adapters,
  ["CA PFIRS", parseCaFixture],
  ["MI DNR ArcGIS", parseMiFixture],
  ["NJ Forest Fire Service ArcGIS", parseNjFixture],
  ["WI DNR permit feed", parseWiFixture],
  ["MN DNR restriction feed", parseMnFixture],
  ["OH statute and calendar", parseOhFixture],
  ["Merge and encode current sources", () => JSON.stringify(mergeSources(null, recordedInputs, now).snapshot)],
  ["Parse, merge, encode 51-area projection", () => JSON.stringify(mergeSources(null,
    fullInputs.map((input, index) => ({ ...input, rows: JSON.parse(serializedFull[index]) })), now).snapshot)],
];

console.log("Fixture timings in ms (Bun wall time, no network, 20 warmups and 120 samples per row).");
for (const [name, run] of jobs) {
  for (let i = 0; i < 20; i++) await run();
  const times: number[] = [];
  for (let i = 0; i < 120; i++) {
    const start = performance.now();
    await run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const percentile = (p: number) => times[Math.ceil(times.length * p) - 1];
  const p95 = percentile(0.95);
  console.log(`${name.padEnd(42)} p50 ${percentile(0.5).toFixed(3)}  p95 ${p95.toFixed(3)}${p95 >= 7 ? "  REVIEW CPU BUDGET" : ""}`);
}
