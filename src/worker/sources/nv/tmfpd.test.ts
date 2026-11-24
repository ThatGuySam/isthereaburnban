// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { mergeSources } from "../merge";
import { nvTmfpdPileBurning, parseTmfpdPileBurning } from "./tmfpd";

const fixture = await Bun.file(new URL("./fixtures/tmfpd-pile-burning-2026-11-24.html", import.meta.url)).text();
const captured = new Date("2026-11-24T10:16:08Z");

test("the district's OPEN banner means permitted pile burning in part of Washoe County", async () => {
  const rows = await parseTmfpdPileBurning(fixture, captured);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "32031", county: "Washoe County", state: "NV", status: "restricted", scope: "part",
    scopeNote: "Pile burning within the Truckee Meadows Fire Protection District",
    since: "2026-11-24", sourceUpdated: null,
    validFrom: "2026-11-24T08:00:00.000Z", validUntil: "2026-11-25T08:00:00.000Z",
  });
  expect(rows[0].note).toContain("approved permit");
});

test("a CLOSED daily banner is a pile-burning prohibition within the district", async () => {
  const rows = await parseTmfpdPileBurning(fixture.replace(">OPEN</span>", ">CLOSED</span>"), captured);
  const { snapshot } = mergeSources(null, [
    { source: nvTmfpdPileBurning, rows, checked: captured.toISOString() },
  ], captured);
  expect(Object.keys(snapshot.counties)).toEqual(["32031"]);
  expect(snapshot.counties["32031"]).toMatchObject({ status: "restricted", orders: [{ status: "ban", scope: "part" }] });
});

test("the effective date must match today in Pacific time", async () => {
  const old = fixture.replace("November 24, 2026", "November 23, 2026");
  const future = fixture.replace("November 24, 2026", "November 25, 2026");
  await expect(parseTmfpdPileBurning(old, captured)).rejects.toThrow("effective date");
  await expect(parseTmfpdPileBurning(future, captured)).rejects.toThrow("effective date");
  await expect(parseTmfpdPileBurning(fixture, new Date("2026-11-25T07:59:59Z"))).resolves.toHaveLength(1);
  await expect(parseTmfpdPileBurning(fixture, new Date("2026-11-25T08:00:00Z"))).rejects.toThrow("effective date");
});

test("unknown status, duplicate banners and changed permit terms never yield a report", async () => {
  await expect(parseTmfpdPileBurning(fixture.replace(">OPEN</span>", ">STANDBY</span>"), captured)).rejects.toThrow("status");
  await expect(parseTmfpdPileBurning(fixture + fixture, captured)).rejects.toThrow("banner");
  await expect(parseTmfpdPileBurning(fixture.replace("with an approved permit", "without a permit"), captured)).rejects.toThrow("permit");
  await expect(parseTmfpdPileBurning(fixture.replace("11/1/26", "11/25/26"), captured)).rejects.toThrow("permit");
});

test("a last good report cannot extend into the next local date", async () => {
  const rows = await parseTmfpdPileBurning(fixture, captured);
  const { snapshot } = mergeSources(null, [
    { source: nvTmfpdPileBurning, rows, checked: captured.toISOString(), error: "District fetch failed" },
  ], new Date("2026-11-25T08:00:00Z"));
  expect(snapshot.counties["32031"]).toBeUndefined();
});

test("Truckee Meadows HTML parsing stays under 4 ms p95 on the captured banner", async () => {
  const run = () => parseTmfpdPileBurning(fixture, captured);
  for (let i = 0; i < 10; i++) await run();
  const timings: number[] = [];
  for (let i = 0; i < 60; i++) {
    const start = performance.now();
    await run();
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  expect(timings[Math.ceil(timings.length * 0.95) - 1]).toBeLessThan(4);
});
