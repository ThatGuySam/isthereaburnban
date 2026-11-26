// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { countiesInState } from "../../counties";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { nyDecBrushBurning, parseDecBrushBurning } from "./dec-brush-burning";
import { nyCountyCalendars } from "./local-rules";
import { nyNycBarbecuing, parseNycBarbecuing } from "./nyc-barbecuing";

const now = new Date("2026-11-24T17:00:00Z");
const fixtureFile = (path) => Bun.file(new URL(`./fixtures/${path}`, import.meta.url));
const countyFixture = (fixture) => fixtureFile(`county-pass/${fixture}`);

async function fixtureResponse(fixture) {
  return fixture.endsWith(".headers.json")
    ? new Response(null, { headers: await countyFixture(fixture).json() })
    : new Response(await countyFixture(fixture).arrayBuffer());
}

test("NY publishes scoped, recurring local restrictions and retains distinct jurisdictions", async () => {
  const checked = now.toISOString();
  const dec = await fixtureFile("dec-open-burning-2026-11-24.html").text();
  const nyc = await fixtureFile("nyc-311-barbecuing-2026-11-24.html").text();
  const baseline = [
    { source: nyDecBrushBurning, rows: await parseDecBrushBurning(await extractHtml(dec), now), checked },
    { source: nyNycBarbecuing, rows: await parseNycBarbecuing(await extractHtml(nyc), now), checked },
  ];
  const local = await Promise.all(nyCountyCalendars.map(async ({ source, parse, fixture }) => {
    const rows = await parse(await fixtureResponse(fixture), now);
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ mode: "positive-only", coverage: "restrictions", recurring: true });
    expect(rows.map(({ fips }) => fips)).toEqual(source.reportingFips);
    for (const row of rows) {
      expect(row).toMatchObject({
        state: "NY", scope: source.scope, standing: true, status: "restricted",
        officialUrl: source.officialUrl, sourceUpdated: null,
        validFrom: "2026-11-24T05:00:00.000Z", validUntil: "2026-11-26T05:00:00.000Z",
      });
    }
    return { source, rows, checked };
  }));
  const previous = mergeSources(null, baseline, now).snapshot;
  const { snapshot, transitions } = mergeSources(previous, [...baseline, ...local], now);
  const all = countiesInState("NY");
  const moved = all.filter(({ fips }) => !previous.counties[fips] && snapshot.counties[fips]?.status === "restricted");
  expect(moved).toHaveLength(41);
  expect(Object.keys(snapshot.counties)).toHaveLength(62);
  expect(Object.values(snapshot.counties).every(({ status }) => status === "restricted")).toBe(true);
  expect(snapshot.counties["36059"]).toMatchObject({ scope: "part", status: "restricted" });
  expect(snapshot.counties["36055"]).toMatchObject({ scope: "county", status: "restricted" });
  expect(snapshot.counties["36037"].orders.map(({ scopeNote }) => scopeNote).sort())
    .toEqual(["City of Batavia", "Village of Attica"]);
  expect(snapshot.counties["36121"]).toMatchObject({ scope: "part", status: "restricted",
    orders: [{ scopeNote: "Village of Attica" }],
  });
  expect(snapshot.counties["36103"].orders.map(({ scopeNote }) => scopeNote).sort())
    .toEqual(["Town of Huntington", "Town of Islip"]);
  expect(transitions).toEqual([]);

  const expired = mergeSources(snapshot, [...baseline, ...local], new Date("2026-11-26T05:00:00Z"));
  expect(expired.snapshot.counties).toEqual({});
  expect(expired.transitions).toEqual([]);
});

test("NY rule verification rejects substantive ordinance edits and a changed PDF edition", async () => {
  const batavia = nyCountyCalendars.find(({ source }) => source.id === "ny-batavia-burning");
  const html = await countyFixture(batavia.fixture).text();
  await expect(batavia.parse(new Response(html.replace("shall be prohibited", "shall be permitted")), now))
    .rejects.toThrow("reviewed local burning rule changed");

  const niagara = nyCountyCalendars.find(({ source }) => source.id === "ny-niagara-sanitary-code");
  const headers = await countyFixture(niagara.fixture).json();
  await expect(niagara.parse(new Response(null, { headers: { ...headers, etag: '"changed"' } }), now))
    .rejects.toThrow("reviewed local burning rule changed");
});

test("NY local rule fixtures parse below 6 ms p95 thread CPU", async () => {
  let slowest = { id: "", p95: 0 };
  for (const { source, parse, fixture } of nyCountyCalendars) {
    const file = countyFixture(fixture);
    const headers = fixture.endsWith(".headers.json") ? await file.json() : undefined;
    const bytes = headers ? null : await file.arrayBuffer();
    const run = () => parse(new Response(bytes, { headers }), now);
    for (let i = 0; i < 5; i++) await run();
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const start = process.threadCpuUsage();
      await run();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
    if (p95 > slowest.p95) slowest = { id: source.id, p95 };
  }
  console.log(`NY local rule parse p95 max ${slowest.p95.toFixed(3)} ms thread CPU (${slowest.id})`);
  expect(slowest.p95).toBeLessThan(6);
});
