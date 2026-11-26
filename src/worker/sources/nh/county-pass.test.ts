// @ts-nocheck -- bun test types are not installed; this file runs under Bun.
import { expect, test } from "bun:test";
import { countyDecision } from "../../county-decision";
import { countiesInState } from "../../counties";
import { projectMapStatus } from "../../map-status";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { nhLocalRules } from "./local-rules";
import { nhMunicipalStatus } from "./municipal-status";
import { nhOpenBurningPermits, parseNhOpenBurning } from "./open-burning";
import { nhTownHallRoad, parseTownHallRoad } from "./town-hall-road";

const now = new Date("2026-11-26T13:20:00Z");
const checked = now.toISOString();
const file = (name) => Bun.file(new URL(`./fixtures/${name}`, import.meta.url));
const entries = [...nhLocalRules, ...nhMunicipalStatus];

test("NH municipal rules retain one precise local scope per source and cover all ten counties", async () => {
  const inputs = await Promise.all(nhLocalRules.map(async ({ source, parse, fixture }) => {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ state: "NH", scope: "part", mode: "positive-only", recurring: true });
    const rows = await parse(new Response(await file(fixture).arrayBuffer()), now);
    expect(rows.map(({ fips }) => fips)).toEqual(source.reportingFips);
    expect(rows[0]).toMatchObject({
      sourceId: source.id, status: "restricted", scope: "part", officialUrl: source.officialUrl,
      validFrom: "2026-11-26T05:00:00.000Z", validUntil: "2026-11-28T05:00:00.000Z",
    });
    for (const { scopeNote, label, note } of rows) {
      expect([scopeNote, label, note].every((value) => typeof value === "string" && value.length > 0)).toBe(true);
    }
    await expect(parse(new Response("<p>Rule withdrawn</p>"), now)).rejects.toThrow();
    return { source, rows, checked };
  }));
  const withoutState = mergeSources(null, inputs, now).snapshot;
  const withState = mergeSources(null, [
    { source: nhOpenBurningPermits, checked, rows: await parseNhOpenBurning(await file("rsa-227-l-17-2026-11-24.html").text(), now) },
    {
      source: nhTownHallRoad, checked,
      rows: await parseTownHallRoad(await file("usfs-alerts-2026-11-24.html").text(),
        () => file("usfs-town-hall-road-2026-11-24.html").text(), now),
    },
    ...inputs,
  ], now).snapshot;
  const counties = countiesInState("NH");
  expect(Object.keys(withoutState.counties).sort()).toEqual(counties.map(({ fips }) => fips).sort());
  const expectedMap = Object.fromEntries(counties.map(({ fips }) => [fips, "restricted"]));
  for (const snapshot of [withoutState, withState]) {
    expect(projectMapStatus("nh-fixture", [snapshot], now.getTime()).counties).toEqual(expectedMap);
  }
  for (const { fips } of counties) {
    expect(countyDecision(withoutState.counties[fips], now.getTime())).toMatchObject({ status: "restricted", scope: "part" });
    expect(countyDecision(withState.counties[fips], now.getTime())).toMatchObject({ status: "restricted", scope: "state" });
    expect(withState.counties[fips].orders.some(({ sourceId }) => inputs.some(({ source }) => source.id === sourceId))).toBe(true);
  }
  expect(withState.counties["33003"].orders).toHaveLength(2);
  expect(withState.counties["33011"].orders).toHaveLength(2);
});

test("NH fingerprints require review if the reported rule or affected streets change", async () => {
  const cases = [
    ["nh-concord-setback-rule", "minimum of 50 feet", "minimum of 25 feet"],
    ["nh-portsmouth-streets-rule", "PLEASANT ST TO MARCY ST", "PLEASANT ST TO STATE ST"],
  ];
  for (const [id, before, after] of cases) {
    const { parse, fixture } = nhLocalRules.find(({ source }) => source.id === id);
    const html = await file(fixture).text();
    expect(html).toContain(before);
    await expect(parse(new Response(html.replace(before, after)), now)).rejects.toThrow("rule changed");
  }
  const { parse, fixture } = nhLocalRules.find(({ source }) => source.id === "nh-sullivan-warden-rule");
  const document = await file(fixture).arrayBuffer();
  const bytes = new Uint8Array(document);
  bytes[bytes.length - 1] ^= 1;
  await expect(parse(new Response(bytes), now)).rejects.toThrow("rule changed");
});

test("NH county-pass fixtures parse below 4 ms p95 thread CPU per publisher", async () => {
  let slowest = { id: "", p95: 0 };
  for (const { source, parse, fixture } of entries) {
    const body = await file(fixture).arrayBuffer();
    const run = () => parse(new Response(body), now);
    for (let i = 0; i < 10; i++) await run();
    const samples = [];
    for (let i = 0; i < 60; i++) {
      const start = process.threadCpuUsage();
      await run();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
    if (p95 > slowest.p95) slowest = { id: source.id, p95 };
    expect(p95).toBeLessThan(4);
  }
  console.log(`NH county fixture p95 max ${slowest.p95.toFixed(3)} ms thread CPU (${slowest.id})`);
});
