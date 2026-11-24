// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { nyDecBrushBurning, parseDecBrushBurning } from "./dec-brush-burning";
import { nyNycBarbecuing, parseNycBarbecuing } from "./nyc-barbecuing";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.html`, import.meta.url), "utf8");
const dec = fixture("dec-open-burning");
const nyc = fixture("nyc-311-barbecuing");
const now = new Date("2026-11-24T12:46:14Z");
const decAt = async (date = now, html = dec) => parseDecBrushBurning(await extractHtml(html), date);
const nycAt = async (date = now, html = nyc) => parseNycBarbecuing(await extractHtml(html), date);

test("NY DEC publishes written brush permits only for designated Fire Towns outside spring", async () => {
  const rows = await decAt();
  expect(rows.every(({ status, scope, sourceUpdated }) =>
    status === "restricted" && scope === "part" && sourceUpdated === null)).toBe(true);
  expect([...new Set(rows.map(({ fips }) => fips))].sort()).toEqual([
    "36019", "36025", "36031", "36033", "36035", "36039", "36041", "36043",
    "36049", "36065", "36089", "36091", "36105", "36111", "36113", "36115",
  ]);
  expect(rows.find(({ fips }) => fips === "36031")).toMatchObject({ scopeNote: "All towns in Essex County" });
  expect(rows.filter(({ fips }) => fips === "36033").map(({ scopeNote }) => scopeNote))
    .toContain("Town of Tupper Lake");
  expect(rows.filter(({ fips }) => fips === "36019").map(({ scopeNote }) => scopeNote)).toEqual([
    "Town of Altona", "Town of Au Sable", "Town of Black Brook", "Town of Dannemora", "Town of Ellenburg", "Town of Saranac",
  ]);
});

test("NY spring brush restriction starts March 16 and ends after May 14 Eastern", async () => {
  const march = new Date("2026-03-16T03:59:59Z");
  const upcoming = (await decAt(march)).find(({ fips, scope }) => fips === "36001" && scope === "state");
  expect(upcoming).toMatchObject({ validFrom: "2026-03-16T04:00:00.000Z", status: "restricted" });
  const may = new Date("2026-05-15T03:59:59Z");
  const spring = (await decAt(may)).filter(({ scope }) => scope === "state");
  expect(spring).toHaveLength(62);
  expect(spring.every(({ validUntil, status }) => validUntil === "2026-05-15T04:00:00.000Z" &&
    status === "restricted")).toBe(true);
  const after = await decAt(new Date("2026-05-15T04:00:00Z"));
  expect(after.some(({ scope }) => scope === "state")).toBe(false);
  expect(after.find(({ fips }) => fips === "36111")).toMatchObject({ scope: "part", status: "restricted" });
});

test("NY parsers reject changed terms, an unknown geography and missing NYC rules", async () => {
  await expect(decAt(now, dec.replace("March 16 through May 14", "March 16 through May 20")))
    .rejects.toThrow("rules or Fire Town permit list changed");
  await expect(decAt(now, dec.replace("Washington County, the towns of", "Unknown County, the towns of")))
    .rejects.toThrow("rules or Fire Town permit list changed");
  await expect(nycAt(now, nyc.replace("only allowed in designated areas", "allowed anywhere")))
    .rejects.toThrow("barbecuing rules changed");
  await expect(nycAt(now, "<h1>Barbecuing</h1>")).rejects.toThrow("barbecuing rules changed");
});

test("NYC standing barbecue limits cover the five boroughs as scoped rows", async () => {
  const rows = await nycAt();
  expect(rows.map(({ fips }) => fips)).toEqual(["36005", "36047", "36061", "36081", "36085"]);
  expect(rows.every(({ scope, scopeNote, status }) =>
    scope === "part" && scopeNote === "New York City outdoor barbecuing" && status === "restricted")).toBe(true);
  expect(rows[0]).toMatchObject({ validFrom: "2026-11-24T05:00:00.000Z", validUntil: "2026-11-26T05:00:00.000Z" });
});

test("NY November statuses stay scoped, and missed polls expire without transitions or all-clears", async () => {
  const inputs = [
    { source: nyDecBrushBurning, rows: await decAt(), checked: now.toISOString() },
    { source: nyNycBarbecuing, rows: await nycAt(), checked: now.toISOString() },
  ];
  expect(inputs.every(({ source }) => source.recurring && source.mode === "positive-only")).toBe(true);
  const { snapshot } = mergeSources(null, inputs, now);
  const counts = Object.groupBy(countiesInState("NY"), ({ fips }) => snapshot.counties[fips]?.status ?? "unknown");
  expect(Object.fromEntries(Object.entries(counts).map(([status, counties]) => [status, counties.length])))
    .toEqual({ restricted: 21, unknown: 41 });
  expect(snapshot.counties["36019"].orders).toHaveLength(6);
  const stale = mergeSources(snapshot, inputs, new Date("2026-11-26T05:00:00Z"));
  expect(stale.snapshot.counties).toEqual({});
  expect(stale.transitions).toEqual([]);
});

test("NY HTML and calendar fixtures parse below 4 ms p95 thread CPU", async () => {
  const run = async () => {
    await decAt();
    await nycAt();
  };
  for (let index = 0; index < 15; index++) await run();
  const samples = [];
  for (let index = 0; index < 60; index++) {
    const start = process.threadCpuUsage();
    await run();
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
});
