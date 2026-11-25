// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseChesterfieldBurnStatus } from "./chesterfield";

const json = readFileSync(new URL("./fixtures/county-pass/chesterfield-status-2026-11-25.json", import.meta.url), "utf8");
const current = JSON.parse(json);
const now = new Date("2026-11-25T18:57:10Z");

test("the fire department's wind closure is scoped to township permits and expires from the observation time", () => {
  expect(parseChesterfieldBurnStatus(current, now)).toEqual([expect.objectContaining({
    fips: "26099", status: "restricted", scope: "part", scopeNote: "Chesterfield Township open burning permits",
    sourceUpdated: "2026-11-25T18:57:00.000Z", validUntil: "2026-11-25T19:56:00.000Z",
    officialUrl: "https://chesterfieldfire.org/how-do-i/request-an-open-burn-permit/",
  })]);
  expect(() => parseChesterfieldBurnStatus(current, new Date("2026-11-25T18:56:00Z"))).toThrow("report time");
  expect(() => parseChesterfieldBurnStatus(current, new Date("2026-11-25T19:56:00Z"))).toThrow("observation");
});

test("an administrative permit ban remains scoped, and open, absent or invalid flags confer no clearance", () => {
  expect(parseChesterfieldBurnStatus({ ban: true }, now)).toEqual([expect.objectContaining({
    status: "restricted", scope: "part", label: expect.stringContaining("burn ban"),
  })]);
  expect(parseChesterfieldBurnStatus({ ...current, weather: { ...current.weather, closed: false } }, now)).toEqual([]);
  expect(parseChesterfieldBurnStatus({ ban: false }, now)).toEqual([]);
  expect(() => parseChesterfieldBurnStatus({ ban: "false" }, now)).toThrow();
  expect(() => parseChesterfieldBurnStatus({ ...current, weather: { ...current.weather, wind: 1, gust: 1 } }, now))
    .toThrow("observation");
});

test("Chesterfield JSON and mapping parse below 2 ms p95", () => {
  parseChesterfieldBurnStatus(current, now);
  const timings = Array.from({ length: 30 }, () => {
    const start = performance.now();
    parseChesterfieldBurnStatus(JSON.parse(json), now);
    return performance.now() - start;
  });
  expect(timings.sort((a, b) => a - b)[28]).toBeLessThan(2);
});
