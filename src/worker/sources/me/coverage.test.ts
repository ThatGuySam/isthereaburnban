// @ts-nocheck -- bun test types are not installed; this file runs under Bun.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mergeSources } from "../merge";
import { parseNwsAlerts } from "../nws/alerts";
import { SOURCES } from "../registry";
import { meOpenBurningPermits, parseMaineOpenBurning } from "./open-burning";
import { meTownPermitHolds, parseMaineTownPermits } from "./town-permits";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const classes = fixture("class-days-2026-11-24.json");
const statute = fixture("open-burning-2026-11-24.html");
const warnings = fixture("red-flag-2026-11-24.json");
const now = new Date("2026-11-24T15:02:56Z");
const checked = now.toISOString();

function withCodes(codes) {
  const data = JSON.parse(classes);
  Object.assign(data.classdays, codes);
  return JSON.stringify(data);
}

test("Maine reports the statewide permit rule and no temporary status from the captured November 24 feeds", async () => {
  expect(SOURCES).toContain(meOpenBurningPermits);
  expect(SOURCES).toContain(meTownPermitHolds);
  expect(meOpenBurningPermits).toMatchObject({ recurring: true, mode: "positive-only", coverage: "restrictions" });
  expect(parseMaineTownPermits(classes, now)).toEqual([]);
  expect(parseNwsAlerts(JSON.parse(warnings), now)).toEqual([]);
  const rows = await parseMaineOpenBurning(statute, now);
  expect(rows).toHaveLength(16);
  expect(rows.every((row) => row.scope === "state" && row.status === "restricted")).toBe(true);
  expect(rows.find(({ fips }) => fips === "23013")).toMatchObject({
    label: "Permit required for covered open burning",
    validFrom: "2026-11-24T05:00:00.000Z", validUntil: "2026-11-26T05:00:00.000Z",
  });
});

test("Maine decodes map colors into class days and preserves town scope and permitting differences", async () => {
  const rows = parseMaineTownPermits(withCodes({ 9: "4", 10: "4", 11: "4" }), now);
  expect(rows.map(({ fips, label, scopeNote }) => [fips, label, scopeNote])).toEqual([
    ["23013", "Open burning permits suspended", "Town of Union, permitted open burning"],
    ["23013", "Burn permits from fire wardens only", "Town of South Thomaston, permitted open burning"],
    ["23005", "Open burning permits suspended", "Town of Cumberland, permitted open burning"],
    ["23005", "Open burning permits suspended", "Town of Windham, permitted open burning"],
  ]);
  expect(rows.every(({ scope, status, sourceUpdated, validFrom, validUntil }) =>
    scope === "part" && status === "restricted" && sourceUpdated === "2026-11-24T13:00:00.000Z" &&
    validFrom === sourceUpdated && validUntil === "2026-11-25T05:00:00.000Z")).toBe(true);
  const statewide = await parseMaineOpenBurning(statute, now);
  const { snapshot } = mergeSources(null, [
    { source: meTownPermitHolds, rows, checked },
    { source: meOpenBurningPermits, rows: statewide, checked },
  ], now);
  expect(snapshot.counties["23013"].orders.map(({ scopeNote }) => scopeNote)).toEqual([
    "Town of Union, permitted open burning", "Town of South Thomaston, permitted open burning",
  ]);
  expect(snapshot.counties["23009"].orders).toBeUndefined();
  expect(parseMaineTownPermits(withCodes({ 9: "5", 10: "1", 11: "6" }), now).map(({ scopeNote, label }) => [scopeNote, label])).toEqual([
    ["Town of Union, permitted open burning", "Open burning permits suspended"],
    ["Town of South Thomaston, permitted open burning", "Open burning permits suspended"],
  ]);
});

test("Maine rejects bad dates, incomplete feeds, unknown codes and changed statute text", async () => {
  expect(() => parseMaineTownPermits(classes, new Date("2026-11-25T05:00:00Z"))).toThrow("current Eastern class-day timestamp");
  expect(() => parseMaineTownPermits(classes, new Date("2026-11-24T12:59:00Z"))).toThrow("current Eastern class-day timestamp");
  expect(() => parseMaineTownPermits(classes.replace("08:00:00", "08:70:00"), now)).toThrow("current Eastern class-day timestamp");
  expect(() => parseMaineTownPermits(classes.replace(/"11":"3",/, ""), now)).toThrow("Unexpected JSON feed shape");
  expect(() => parseMaineTownPermits(withCodes({ 11: "8" }), now)).toThrow("Unexpected JSON feed shape");
  expect(parseMaineTownPermits(withCodes({ 9: "0", 10: "1", 11: "3" }), now)).toEqual([]);
  await expect(parseMaineOpenBurning(statute.replace("leaves, brush", "leaves"), now)).rejects.toThrow("statute changed");
});

test("Maine fixture parsers stay below 4 ms p95 thread CPU", async () => {
  for (const parse of [() => parseMaineTownPermits(classes, now), () => parseMaineOpenBurning(statute, now)]) {
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
