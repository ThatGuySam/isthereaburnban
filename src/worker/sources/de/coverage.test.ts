// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseAirNowReportingAreas } from "../lib/airnow";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { deActionDays, parseDeActionDays } from "./air-quality";
import { deOpenBurning, parseDeOpenBurning } from "./open-burning";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const guidance = fixture("dnrec-open-burning-2026-11-24.json");
const currentAir = fixture("airnow-2026-11-24.dat");
const historicAir = fixture("airnow-2026-07-16.dat");
const captured = new Date("2026-11-24T14:16:32Z");
const historic = new Date("2026-07-17T15:00:00Z");
const FIPS = ["10001", "10003", "10005"];

test("Delaware has standing residential limits in all three counties today", async () => {
  const rows = await parseDeOpenBurning(JSON.parse(guidance), captured);
  expect(rows).toEqual(FIPS.map((fips) => expect.objectContaining({
    fips, status: "restricted", scope: "state", label: "Residential brush-burning limits",
    validFrom: "2026-11-24T05:00:00.000Z", validUntil: "2026-11-26T05:00:00.000Z",
    since: "2026-10-01", expires: "2027-04-30", sourceUpdated: "2025-07-29T20:07:46Z",
    note: expect.stringContaining("from 8 a.m. to 4 p.m."),
  })));
  expect(parseDeActionDays(currentAir, captured)).toEqual([]);
  expect(SOURCES).toEqual(expect.arrayContaining([deOpenBurning, deActionDays]));
  expect(deOpenBurning).toMatchObject({ recurring: true, mode: "positive-only" });
  expect(deActionDays.mode).toBe("positive-only");
});

test("the ozone-season rule takes effect and ends at Eastern midnight", async () => {
  const statusesAt = async (at: string) => {
    const now = new Date(at);
    const rows = await parseDeOpenBurning(JSON.parse(guidance), now);
    const { snapshot } = mergeSources(null, [{ source: deOpenBurning, rows, checked: now.toISOString() }], now);
    return Object.values(snapshot.counties).map(({ label }) => label);
  };
  expect(await statusesAt("2027-05-01T03:59:59Z")).toEqual(Array(3).fill("Residential brush-burning limits"));
  expect(await statusesAt("2027-05-01T04:00:00Z")).toEqual(Array(3).fill("Ozone-season open-burning restriction"));
  expect(await statusesAt("2027-10-01T03:59:59Z")).toEqual(Array(3).fill("Ozone-season open-burning restriction"));
  expect(await statusesAt("2027-10-01T04:00:00Z")).toEqual(Array(3).fill("Residential brush-burning limits"));
});

test("missing or changed WordPress guidance cannot refresh the calendar", async () => {
  await expect(parseDeOpenBurning(JSON.parse(guidance.replace("4:00 p.m.", "5:00 p.m.")), captured))
    .rejects.toThrow("reviewed open-burning guidance changed");
  await expect(parseDeOpenBurning(JSON.parse(guidance.replace("May 1 through September 30", "May 15 through September 30")), captured))
    .rejects.toThrow("reviewed open-burning guidance changed");
  await expect(parseDeOpenBurning(JSON.parse(guidance).slice(0, 1), captured)).rejects.toThrow("Incomplete WordPress page collection");
  await expect(parseDeOpenBurning(JSON.parse(guidance), new Date("2026-04-01T05:00:00Z")))
    .rejects.toThrow("Future WordPress page update");
});

test("AirNow's archived DNREC Code Red covers the four reporting areas for the forecast day", () => {
  const rows = parseDeActionDays(historicAir, historic);
  expect(rows.map(({ fips, scopeNote }) => [fips, scopeNote])).toEqual([
    ["10003", "AirNow reporting area: Greater New Castle County"],
    ["10001", "AirNow reporting area: Kent County"],
    ["10005", "AirNow reporting area: Sussex County"],
    ["10003", "AirNow reporting area: Wilmington Area"],
  ]);
  for (const row of rows) expect(row).toMatchObject({
    status: "ban", scope: "part", label: "Code Red Air Quality Action Day", sourceUpdated: "2026-07-16",
    validFrom: "2026-07-17T04:00:00.000Z", validUntil: "2026-07-18T04:00:00.000Z",
  });
  const previousDay = parseDeActionDays(historicAir, new Date("2026-07-16T23:00:00Z"));
  expect(previousDay.filter(({ validFrom }) => validFrom === "2026-07-17T04:00:00.000Z")).toHaveLength(4);
  expect(previousDay.filter(({ validUntil }) => validUntil === "2026-07-17T04:00:00.000Z")).toHaveLength(4);
  expect(parseDeActionDays(historicAir, new Date("2026-07-18T04:00:00Z"))).toEqual([]);
});

test("AirNow ignores observations, unknown areas and unflagged forecasts", () => {
  const flaggedObservation = currentAir.replace("|Good|No|", "|Unhealthy|Yes|");
  expect(parseDeActionDays(flaggedObservation, captured)).toEqual([]);
  const unmapped = historicAir.replaceAll("|Sussex County|DE|", "|Unmapped area|DE|");
  expect(parseDeActionDays(unmapped, historic).map(({ fips }) => fips)).toEqual(["10003", "10001", "10003"]);
  const unflagged = historicAir.replaceAll("|Unhealthy|Yes|", "|Unhealthy|No|");
  expect(parseDeActionDays(unflagged, historic)).toEqual([]);
  const kent = parseAirNowReportingAreas(historicAir.replaceAll("\n", "\r\n"), "DE")
    .find(({ area, actionDay }) => area === "Kent County" && actionDay);
  expect(kent).toMatchObject({ kind: "F", issued: "2026-07-16", category: "Unhealthy" });
  const unknownFlag = historicAir.replaceAll("|Unhealthy|Yes|", "|Unhealthy|Pending|");
  expect(() => parseDeActionDays(unknownFlag, historic)).toThrow("Invalid AirNow reporting-area record");
  const unknownCategory = historicAir.replaceAll("|Unhealthy|Yes|", "|Undocumented category|Yes|");
  expect(() => parseDeActionDays(unknownCategory, historic)).toThrow("unrecognized Delaware category");
  expect(() => parseDeActionDays("<html>Unavailable</html>", historic)).toThrow("Invalid AirNow reporting-area feed");
  expect(() => parseDeActionDays(historicAir, captured)).toThrow("no recent Delaware DNREC records");
});

test("a scoped action day remains visible alongside the statewide rule", async () => {
  const standing = await parseDeOpenBurning(JSON.parse(guidance), historic);
  const checked = historic.toISOString();
  const { snapshot } = mergeSources(null, [
    { source: deOpenBurning, rows: standing, checked },
    { source: deActionDays, rows: parseDeActionDays(historicAir, historic), checked },
  ], historic);
  expect(snapshot.counties["10003"]).toMatchObject({
    status: "restricted", orders: [
      { status: "ban", label: "Code Red Air Quality Action Day", scope: "part", scopeNote: "AirNow reporting area: Greater New Castle County" },
      { status: "ban", label: "Code Red Air Quality Action Day", scope: "part", scopeNote: "AirNow reporting area: Wilmington Area" },
    ],
  });
});

for (const [name, parse] of [
  ["DNREC WordPress calendar", () => parseDeOpenBurning(JSON.parse(guidance), captured)],
  ["AirNow Code Red", () => parseDeActionDays(historicAir, historic)],
] as const) {
  test(`Delaware ${name} fixture uses less than 4 ms p95 thread CPU`, async () => {
    for (let i = 0; i < 15; i++) await parse();
    const samples = [];
    for (let i = 0; i < 60; i++) {
      const start = process.threadCpuUsage();
      await parse();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    samples.sort((a, b) => a - b);
    expect(samples[Math.ceil(0.95 * samples.length) - 1]).toBeLessThan(4);
  });
}
