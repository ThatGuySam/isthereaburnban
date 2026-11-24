// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { parseRiDemRule, riDemForest, riDemParks } from "./dem-rules";
import { parseRiTownRule, riTownSources } from "./town-rules";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.html`, import.meta.url), "utf8");
const forest = fixture("rules-forest");
const parks = fixture("rules-parks");
const now = new Date("2026-11-24T16:46:44Z");
const spring = new Date("2027-04-01T14:00:00Z");
const towns = Object.entries(riTownSources).map(([town, source]) => ({ town, source, html: fixture(town) }));

test("Rhode Island publishes five scoped county summaries with municipal rules only in Washington County", async () => {
  const checked = now.toISOString();
  const inputs = [
    { source: riDemForest, rows: await parseRiDemRule(forest, now, "forest"), checked },
    { source: riDemParks, rows: await parseRiDemRule(parks, now, "parks"), checked },
    ...await Promise.all(towns.map(async ({ town, source, html }) => ({
      source, rows: await parseRiTownRule(html, now, town), checked,
    }))),
  ];
  for (const { source, rows } of inputs) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ recurring: true, coverage: "restrictions", mode: "positive-only" });
    expect(rows).toHaveLength(source.id.startsWith("ri-dem-") ? 5 : 1);
    expect(rows.every(({ status, scope, expires, validUntil }) => status === "restricted" &&
      scope === "part" && expires === null && validUntil === "2026-11-26T05:00:00.000Z")).toBe(true);
  }
  const { snapshot, transitions } = mergeSources(null, inputs, now);
  expect(Object.keys(snapshot.counties).sort()).toEqual(["44001", "44003", "44005", "44007", "44009"]);
  expect(Object.values(snapshot.counties).every(({ status, scope }) => status === "restricted" && scope === "part")).toBe(true);
  expect(snapshot.counties["44001"].orders.map(({ sourceId }) => sourceId)).toEqual([riDemForest.id, riDemParks.id]);
  expect(snapshot.counties["44009"].orders.slice(2).map(({ scopeNote }) => scopeNote)).toEqual([
    "Town of Narragansett", "Town of North Kingstown", "Town of South Kingstown",
  ]);
  expect(transitions).toEqual([]);
  const expired = mergeSources(snapshot, inputs, new Date("2026-11-26T05:00:00Z"));
  expect(expired.snapshot.counties).toEqual({});
  expect(expired.transitions).toEqual([]);
});

test("Rhode Island spring permit windows follow Eastern dates and hours", async () => {
  for (const [input, regulation, scope] of [[forest, "forest", "state"], [parks, "parks", "part"]]) {
    const seasonal = async (date) => (await parseRiDemRule(input, new Date(date), regulation))
      .filter(({ since }) => since !== null);
    expect(await seasonal("2027-03-13T23:00:00Z")).toEqual([]);
    const rows = await seasonal("2027-03-15T14:00:00Z");
    expect(rows.find(({ fips }) => fips === "44009")).toMatchObject({
      scope, status: "restricted", since: "2027-03-15", expires: "2027-05-15",
      validFrom: "2027-03-15T14:00:00.000Z", validUntil: "2027-03-15T21:00:00.000Z",
    });
    expect(await seasonal("2027-05-15T21:00:00Z")).toEqual([]);
  }
  const north = fixture("northkingstown");
  const seasonalNorth = async (date) => (await parseRiTownRule(north, new Date(date), "northkingstown"))
    .filter(({ since }) => since !== null);
  expect(await seasonalNorth("2027-03-30T16:00:00Z")).toEqual([]);
  expect(await seasonalNorth("2027-03-31T23:59:59Z")).toMatchObject([{
    fips: "44009", scope: "part", scopeNote: "Town of North Kingstown", status: "restricted",
    since: "2027-04-01", expires: "2027-05-31", validFrom: "2027-04-01T04:00:00.000Z",
  }]);
  expect(await seasonalNorth("2027-06-01T04:00:00Z")).toEqual([]);
});

test("DEM rules reject inactive, revised, unknown, duplicate or missing source text", async () => {
  expect(await parseRiDemRule(forest, new Date("2022-01-04T04:59:59Z"), "forest")).toEqual([]);
  expect(await parseRiDemRule(parks, new Date("2025-05-12T03:59:59Z"), "parks")).toEqual([]);
  for (const changed of [
    forest.replace("ACTIVE RULE", "INACTIVE RULE"),
    forest.replace("01/04/2022", "12/01/2026"),
    forest.replace("01/04/2022", "Unknown"),
    forest.replace("requires a written permit", "can proceed with verbal approval"),
    forest + forest,
  ]) {
    await expect(parseRiDemRule(changed, now, "forest")).rejects.toThrow("active rule text or effective date changed");
  }
  await expect(parseRiDemRule(parks.replace("in designated areas", "in any area"), now, "parks"))
    .rejects.toThrow("active rule text or effective date changed");
  await expect(parseRiDemRule("<h1>Unavailable</h1>", now, "parks"))
    .rejects.toThrow("active rule text or effective date changed");
});

test("town rules reject a wrong municipality page or an unreviewed revision", async () => {
  const north = fixture("northkingstown");
  await expect(parseRiTownRule(north, now, "narragansett")).rejects.toThrow("CivicPlus content page");
  await expect(parseRiTownRule(north.replace("April/May", "May/June"), now, "northkingstown"))
    .rejects.toThrow("reviewed open-burning rules changed");
});

test("Rhode Island fixtures stay below 4 ms p95 thread CPU", async () => {
  const parsers = [
    () => parseRiDemRule(forest, spring, "forest"),
    () => parseRiDemRule(parks, spring, "parks"),
    ...towns.map(({ town, html }) => () => parseRiTownRule(html, spring, town)),
  ];
  for (const parse of parsers) {
    for (let i = 0; i < 10; i++) await parse();
    const samples = [];
    for (let i = 0; i < 60; i++) {
      const start = process.threadCpuUsage();
      await parse();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    samples.sort((a, b) => a - b);
    expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
  }
});
