// @ts-nocheck -- bun test types are not installed; this file runs under Bun.
import { expect, test } from "bun:test";
import { countyDecision } from "../../county-decision";
import { countiesInState } from "../../counties";
import { projectMapStatus } from "../../map-status";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { ctLocalRules } from "./local-rules";
import { ctDeepFireDanger, parseCtFireDanger } from "./fire-danger";

const now = new Date("2026-11-24T16:00:00Z");
const read = (name) => Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).text();
const current = (rows, at) => rows.filter((row) => row.validFrom <= at.toISOString() && at.toISOString() < row.validUntil);

test("CT municipal rules give eight scoped map results and preserve DEEP evidence", async () => {
  const checked = now.toISOString();
  const locals = await Promise.all(ctLocalRules.map(async ({ source, parse, fixture }) => {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ state: "CT", scope: "part", coverage: "restrictions", mode: "positive-only", recurring: true });
    const rows = await parse(new Response(await read(fixture)), now);
    expect(rows.map(({ fips }) => fips)).toEqual(source.reportingFips);
    expect(rows[0]).toMatchObject({
      sourceId: source.id, scope: "part", status: "restricted", officialUrl: source.officialUrl,
      validFrom: "2026-11-24T05:00:00.000Z", validUntil: "2026-11-26T05:00:00.000Z",
    });
    expect(rows[0].scopeNote).toBeTruthy();
    return { source, rows, checked };
  }));
  const statewide = {
    source: ctDeepFireDanger,
    rows: await parseCtFireDanger(await read("fire-danger-2026-11-24.html"), now),
    checked,
  };
  const municipal = mergeSources(null, locals, now).snapshot;
  const combined = mergeSources(null, [statewide, ...locals], now);
  expect(combined.transitions).toEqual([]);
  const counties = countiesInState("CT");
  expect(counties).toHaveLength(8);
  const expectedMap = Object.fromEntries(counties.map(({ fips }) => [fips, "restricted"]));
  for (const snapshot of [municipal, combined.snapshot]) {
    expect(projectMapStatus("ct-fixture", [snapshot], now.getTime()).counties).toEqual(expectedMap);
  }
  for (const { fips } of counties) {
    expect(countyDecision(municipal.counties[fips], now.getTime())).toMatchObject({ status: "restricted", scope: "part" });
    expect(combined.snapshot.counties[fips].orders.some((order) => order.sourceId === statewide.source.id)).toBe(true);
    expect(combined.snapshot.counties[fips].orders.some((order) => locals.some(({ source }) => source.id === order.sourceId))).toBe(true);
  }
  const expired = new Date("2026-11-26T05:01:00Z");
  expect(countyDecision(municipal.counties["09011"], expired.getTime()).status).toBe("unknown");
});

test("CT seasonal rules distinguish an open-burning closure from a permit issuance pause", async () => {
  const testWindow = async (id, label, cases) => {
    const { parse, fixture } = ctLocalRules.find(({ source }) => source.id === id);
    const body = await read(fixture);
    for (const [time, county, seasonal] of cases) {
      const at = new Date(time);
      const active = current(await parse(new Response(body), at), at);
      expect(active.every((row) => row.fips === county && row.scope === "part" && row.status === "restricted")).toBe(true);
      expect(active).toHaveLength(seasonal ? 2 : 1);
      expect(active.some((row) => row.label === label)).toBe(seasonal);
    }
  };
  await testWindow("ct-harwinton-open-burning", "Harwinton seasonal open-burning closure", [
    ["2027-06-01T04:00:00Z", "09005", false],
    ["2027-06-01T04:01:00Z", "09005", true],
    ["2027-10-01T03:58:59Z", "09005", true],
    ["2027-10-01T03:59:00Z", "09005", false],
  ]);
  await testWindow("ct-north-stonington-brush-permits", "North Stonington brush permit issuance paused", [
    ["2027-06-15T16:00:00Z", "09011", false],
    ["2027-06-16T04:00:00Z", "09011", true],
    ["2027-09-15T03:59:59Z", "09011", true],
    ["2027-09-15T04:00:00Z", "09011", false],
  ]);
});

test("CT rule checks reject changed ordinance terms or CivicPlus permit instructions", async () => {
  for (const [id, original, changed] of [
    ["ct-old-saybrook-open-burning", "Daily verbal permission", "Weekly verbal permission"],
    ["ct-north-stonington-brush-permits", "September 15th", "October 15th"],
    ["ct-trumbull-open-burning", "Burn Permits", "Drilling Permits"],
  ]) {
    const { fixture, parse } = ctLocalRules.find(({ source }) => source.id === id);
    const html = await read(fixture);
    expect(html).toContain(original);
    const updated = html.replaceAll(original, changed);
    await expect(parse(new Response(updated), now)).rejects.toThrow();
  }
  const { parse } = ctLocalRules.find(({ source }) => source.id === "ct-trumbull-open-burning");
  await expect(parse(new Response("<p>Open Burn Permits</p>"), now)).rejects.toThrow();
});

test("CT municipal fixtures parse below 4 ms p95 thread CPU per publisher", async () => {
  let slowest = { id: "", p95: 0 };
  for (const { source, parse, fixture } of ctLocalRules) {
    const body = await read(fixture);
    const run = () => parse(new Response(body), now);
    for (let i = 0; i < 10; i++) await run();
    const samples = [];
    for (let i = 0; i < 60; i++) {
      const start = process.threadCpuUsage();
      await run();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1_000);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
    if (p95 > slowest.p95) slowest = { id: source.id, p95 };
    expect(p95).toBeLessThan(4);
  }
  console.log(`CT municipal fixture p95 max ${slowest.p95.toFixed(3)} ms thread CPU (${slowest.id})`);
});
