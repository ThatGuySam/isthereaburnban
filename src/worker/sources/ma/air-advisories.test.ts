// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { maAirAdvisories, parseMassDepAdvisories } from "./air-advisories";
import { maOpenBurning, parseMaOpenBurning } from "./open-burning";

const xml = gunzipSync(readFileSync(new URL("./fixtures/massdep-open-burning-2026-11-24.xml.gz", import.meta.url))).toString("utf8");
const guidance = readFileSync(new URL("./fixtures/woburn-open-burning-2026-11-24.json", import.meta.url), "utf8");
const statewide = new Date("2026-02-18T15:00:00Z");
const district = new Date("2023-04-14T16:00:00Z");
const parse = (now, input = xml) => parseMassDepAdvisories(input, now);

test("MassDEP statewide advisory withholds permits on its published Eastern date", async () => {
  expect(SOURCES.indexOf(maAirAdvisories)).toBeLessThan(SOURCES.indexOf(maOpenBurning));
  expect(maAirAdvisories).toMatchObject({ mode: "positive-only", coverage: "restrictions" });
  expect(maAirAdvisories.recurring).toBeUndefined();
  const rows = await parse(statewide);
  expect(rows).toHaveLength(14);
  expect(rows.every(({ status, scope }) => status === "restricted" && scope === "state")).toBe(true);
  expect(rows[0]).toMatchObject({
    sourceUpdated: "2026-02-18T13:26:02.000Z", validFrom: "2026-02-18T13:26:02.000Z",
    validUntil: "2026-02-19T05:00:00.000Z", since: "2026-02-18", expires: "2026-02-18",
  });
  const checked = statewide.toISOString();
  const { snapshot } = mergeSources(null, [
    { source: maAirAdvisories, rows, checked },
    { source: maOpenBurning, rows: await parseMaOpenBurning(JSON.parse(guidance), statewide), checked },
  ], statewide);
  expect(snapshot.counties["25027"]).toMatchObject({
    label: "MassDEP air-quality no-burn day",
    orders: [{ scopeNote: "Municipality of Worcester, Worcester County" }],
  });
});

test("MassDEP district order maps only the towns' counties and preserves each district's scope", async () => {
  const rows = await parse(district);
  const counties = [...new Set(rows.map(({ fips }) => fips))].sort();
  expect(counties).toEqual(["25003", "25011", "25013", "25015", "25017", "25027"]);
  expect(rows).toHaveLength(9);
  expect(rows.every(({ scope, validUntil }) => scope === "part" && validUntil === "2023-04-15T04:00:00.000Z")).toBe(true);
  expect(rows.filter(({ fips }) => fips === "25027").map(({ scopeNote }) => scopeNote)).toEqual([
    "Massachusetts Fire District 7 in Worcester County",
    "Massachusetts Fire District 8 in Worcester County",
    "Massachusetts Fire District 9 in Worcester County",
  ]);
  const preceding = await parse(new Date("2023-04-13T15:00:00Z"));
  expect(preceding).toHaveLength(14);
  expect(preceding.every(({ scope }) => scope === "state")).toBe(true);
});

test("MassDEP archive omissions, expired advisories, and acceptable air do not clear any county", async () => {
  for (const date of ["2026-11-24T14:46:36Z", "2026-02-19T05:00:00Z", "2021-04-14T16:00:00Z"]) {
    expect(await parse(new Date(date))).toEqual([]);
  }
});

test("MassDEP rejects a wrong feed, mismatched dates, unmapped geography, and unfamiliar decisions", async () => {
  await expect(parse(statewide, xml.replace("Open Burning Advisories Archive Feed", "Weather Forecast")))
    .rejects.toThrow("expected the open-burning advisory feed");
  await expect(parse(statewide, xml.replace("WEDNESDAY, FEBRUARY 18, 2026</span></span></h1>", "THURSDAY, FEBRUARY 19, 2026</span></span></h1>")))
    .rejects.toThrow("advisory body date does not match");
  await expect(parse(new Date("2026-02-18T13:26:01Z"))).rejects.toThrow("invalid or ambiguous same-day advisory date");
  await expect(parse(district, xml.replace("7 through 12", "7 through 16"))).rejects.toThrow("unmapped fire district");
  await expect(parse(statewide, xml.replace("NOT TO BE ISSUED TODAY STATEWIDE", "PENDING FURTHER NOTICE")))
    .rejects.toThrow("unrecognized permit decision");
});

test("MassDEP RSS and embedded advisory parse below 5 ms p95 thread CPU", async () => {
  for (let index = 0; index < 15; index++) await parse(statewide);
  const samples = [];
  for (let index = 0; index < 60; index++) {
    const start = process.threadCpuUsage();
    await parse(statewide);
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(5);
});
