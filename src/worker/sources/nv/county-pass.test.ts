// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { statusFor } from "../../lookup";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { nvCentralLyonBurnStatus } from "./central-lyon";
import { nvLocalBurningRules } from "./local-rules";
import { nvTmfpdPileBurning, parseTmfpdPileBurning } from "./tmfpd";
import { nvUsfsSpringMountains, parseSpringMountainsOrder } from "./usfs";

const asOf = new Date("2026-11-24T17:00:00Z");
const captured = new Date("2026-11-26T12:03:58Z");
const read = (path) => readFileSync(new URL(`./fixtures/${path}`, import.meta.url));
const fixture = (filename) => read(`county-pass/${filename}`);
const centralLyon = fixture("central-lyon-zone.html").toString();
const stand = nvLocalBurningRules.map(({ source, parse, fixture: filename }) => {
  const body = fixture(filename);
  const contentType = filename.endsWith(".pdf") ? "application/pdf" : "text/html";
  return { source, parse: (now = asOf) => parse(new Response(body, { headers: { "content-type": contentType } }), now) };
});

test("Central Lyon maps the current local decision into one scoped district row", async () => {
  const parse = (html) => nvCentralLyonBurnStatus.parse(new Response(html), captured);
  expect(SOURCES).toContain(nvCentralLyonBurnStatus.source);
  expect(nvCentralLyonBurnStatus.source).toMatchObject({ mode: "positive-only", reportingFips: ["32019"] });
  expect(await parse(centralLyon)).toEqual([expect.objectContaining({
    fips: "32019", status: "restricted", scope: "part",
    officialUrl: "https://beforeyouburn.com/a/central-lyon-fire/areas",
    validFrom: "2026-11-26T08:00:00.000Z", validUntil: "2026-11-27T08:00:00.000Z",
  })]);
  const replaceStatus = (badge, statement) => centralLyon
    .replace(">Open</span>", `>${badge}</span>`)
    .replace("Open. Burn season through May 25", statement);
  expect(await parse(replaceStatus("Closed", "Closed. Burn season opens Oct 31")))
    .toEqual([expect.objectContaining({ status: "ban", scope: "part", fips: "32019" })]);
  expect(await parse(replaceStatus("Call Local Agency", "Call Local Agency."))).toEqual([]);
  await expect(parse(replaceStatus("Open", "Closed"))).rejects.toThrow("contradictory");
  await expect(parse(centralLyon.replace("Mark Twain (Lyon County)", "Mark Twain (Storey County)")))
    .rejects.toThrow("changed Before You Burn area");
});

test("Nevada standing restrictions stay scoped and require matching publisher evidence", async () => {
  for (const { source, parse } of stand) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ mode: "positive-only", recurring: true, coverage: "restrictions", scope: "part" });
    const rows = await parse();
    expect(rows.map(({ fips }) => fips)).toEqual(source.reportingFips);
    for (const row of rows) {
      expect(row).toMatchObject({
        scope: "part", standing: true, status: "restricted", officialUrl: source.officialUrl,
        validFrom: "2026-11-24T08:00:00.000Z", validUntil: "2026-11-26T08:00:00.000Z",
      });
      expect(row.scopeNote).toBeTruthy();
    }
  }

  const pahrump = nvLocalBurningRules.find(({ source }) => source.id === "nv-pahrump-residential-burning");
  const changed = fixture(pahrump.fixture).toString().replace("May 15th", "April 15th");
  await expect(pahrump.parse(new Response(changed), asOf)).rejects.toThrow("rule changed");

  const northLyon = stand.find(({ source }) => source.id === "nv-north-lyon-permit-season");
  expect(await northLyon.parse(new Date("2027-06-01T08:00:00Z"))).toEqual([]);

  const residential = nvLocalBurningRules.find(({ source }) => source.id === "nv-named-residential-burning-areas");
  const moved = fixture(residential.fixture).toString("latin1").replace("Battle Mountain", "Round Mountain");
  await expect(residential.parse(new Response(Buffer.from(moved, "latin1")), asOf)).rejects.toThrow("rule changed");
});

test("Nevada county replay adds 13 scoped restrictions to the existing Clark and Washoe results", async () => {
  const checked = asOf.toISOString();
  const before = [
    { source: nvTmfpdPileBurning, checked,
      rows: await parseTmfpdPileBurning(read("tmfpd-pile-burning-2026-11-24.html").toString(), asOf) },
    { source: nvUsfsSpringMountains, checked,
      rows: parseSpringMountainsOrder(await extractHtml(read("usfs-current-fire-restrictions-2026-11-24.html").toString(), { links: true }), asOf) },
  ];
  const added = await Promise.all(stand.map(async ({ source, parse }) => ({ source, checked, rows: await parse() })));
  const baseline = mergeSources(null, before, asOf).snapshot;
  const next = mergeSources(null, [...before, ...added], asOf).snapshot;
  const mapped = (snapshot, fips) => statusFor(snapshot, fips, asOf.getTime());
  const counties = countiesInState("NV");
  expect(counties.filter(({ fips }) => mapped(baseline, fips).status === "restricted").map(({ name }) => name))
    .toEqual(["Clark County", "Washoe County"]);
  const changed = counties.filter(({ fips }) => mapped(baseline, fips).status !== mapped(next, fips).status);
  expect(changed.map(({ name }) => name).sort()).toEqual([
    "Carson City", "Churchill County", "Douglas County", "Elko County", "Humboldt County", "Lander County",
    "Lincoln County", "Lyon County", "Mineral County", "Nye County", "Pershing County", "Storey County", "White Pine County",
  ]);
  for (const { fips } of changed) {
    expect(mapped(baseline, fips).status).toBe("unknown");
    expect(mapped(next, fips)).toMatchObject({ status: "restricted", scope: "part" });
  }
  expect(counties.filter(({ fips }) => mapped(next, fips).status === "unknown").map(({ name }) => name))
    .toEqual(["Esmeralda County", "Eureka County"]);
});

test("Nevada county fixture parsing stays below 4 ms p95 thread CPU", async () => {
  let slowest = { id: "", ms: 0 };
  const daily = { source: nvCentralLyonBurnStatus.source,
    parse: () => nvCentralLyonBurnStatus.parse(new Response(centralLyon), captured) };
  for (const { source, parse } of [daily, ...stand]) {
    for (let sample = 0; sample < 10; sample++) await parse();
    const timings = [];
    for (let sample = 0; sample < 40; sample++) {
      const start = process.threadCpuUsage();
      await parse();
      const { user, system } = process.threadCpuUsage(start);
      timings.push((user + system) / 1_000);
    }
    const p95 = timings.sort((a, b) => a - b)[37];
    if (p95 > slowest.ms) slowest = { id: source.id, ms: p95 };
  }
  console.log(`NV county fixture parse p95 max ${slowest.ms.toFixed(3)} ms thread CPU (${slowest.id})`);
  expect(slowest.ms).toBeLessThan(4);
});
