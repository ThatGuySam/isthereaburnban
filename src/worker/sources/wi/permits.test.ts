// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { parseWisconsinPermits, wiPermits } from "./permits";

const fixture = readFileSync(new URL("./fixtures/permits-2026-11-24.json", import.meta.url), "utf8");
const captured = new Date("2026-11-24T05:22:14Z");
const midnight = new Date("2026-11-24T06:00:00Z");
const merge = (rows, now = captured) =>
  mergeSources(null, [{ source: wiPermits, rows, checked: captured.toISOString() }], now).snapshot;
const feed = () => JSON.parse(fixture);
const county = (data, name) => data.find((row) => row.COUNTY_NAME === name);

test("the Wisconsin DNR fixture reports permit limits and seasonal exceptions only in its protection areas", () => {
  const rows = parseWisconsinPermits(fixture, captured);
  const snapshot = merge(rows);
  expect(rows.filter(({ status }) => status === "restricted")).toHaveLength(13);
  expect(rows.filter(({ status }) => status === "unknown")).toHaveLength(7);
  expect(rows).toHaveLength(20);
  expect(snapshot.sources[0]).toMatchObject({ counties: 20, bans: 0 });
  expect(statusFor(snapshot, "55017", Date.parse(snapshot.generated))).toMatchObject({
    status: "restricted",
    scope: "part",
    scopeNote: "DNR fire protection areas outside incorporated cities and villages",
    sourceUpdated: "2026-11-23T12:21:23.000Z",
    validUntil: midnight.toISOString(),
    note: expect.stringContaining("Parts of this county are not regulated by the DNR"),
  });
  expect(statusFor(snapshot, "55125", Date.parse(snapshot.generated))).toMatchObject({
    status: "restricted",
    scopeNote: "DNR fire protection areas with partial or no snow cover",
    note: expect.stringContaining("completely snow-covered"),
  });
  expect(statusFor(snapshot, "55025", Date.parse(snapshot.generated))).toMatchObject({
    status: "unknown",
    orders: [{ status: "unknown", label: "DNR seasonal permit exception" }],
  });
  for (const fips of ["55059", "55109", "55005", "55083"]) {
    expect(statusFor(snapshot, fips, Date.parse(snapshot.generated)).status).toBe("unknown");
    expect(snapshot.counties[fips]).toBeUndefined();
  }
});

test("Oconto's template limits the report to DNR protection areas in the north", () => {
  const data = feed();
  county(data, "Oconto").LAST_UPDATE_DATE = county(data, "Vilas").LAST_UPDATE_DATE;
  const snapshot = merge(parseWisconsinPermits(JSON.stringify(data), captured));
  const result = statusFor(snapshot, "55083", Date.parse(snapshot.generated));
  expect(result).toMatchObject({
    status: "restricted",
    scope: "part",
    scopeNote: "Northern Oconto County in DNR fire protection areas",
  });
  expect(result.note).toContain("Townships of Brazeau, Bagley, Breed");
  expect(result.note).toContain("For southern Oconto County");
});

test("an explicit DNR suspension maps to a scoped order and a restricted county status", () => {
  const data = feed();
  county(data, "Ashland").PERMIT_RESTRICTIONS = "Due to fire weather conditions, burning is not allowed today.";
  const snapshot = merge(parseWisconsinPermits(JSON.stringify(data), captured));
  expect(statusFor(snapshot, "55003", Date.parse(snapshot.generated))).toMatchObject({
    status: "restricted",
    orders: [{ status: "ban", label: "DNR debris burning suspended", scope: "part" }],
  });
  expect(snapshot.sources[0].bans).toBe(0);
});

test("unrecognized text or scope, future timestamps and missing counties leave status unknown", () => {
  const data = feed().filter(({ COUNTY_NAME }) => COUNTY_NAME !== "Bayfield");
  county(data, "Ashland").PERMIT_RESTRICTIONS = "Contact your DNR ranger for today's decision.";
  county(data, "Monroe").PART_NOTREG_DNR = "Unknown scope code";
  county(data, "Chippewa").LAST_UPDATE_DATE = `/Date(${captured.getTime() + 1})/`;
  const snapshot = merge(parseWisconsinPermits(JSON.stringify(data), captured));
  for (const fips of ["55003", "55007", "55081", "55017"]) {
    expect(statusFor(snapshot, fips, Date.parse(snapshot.generated)).status).toBe("unknown");
    expect(snapshot.counties[fips]).toBeUndefined();
  }
  expect(statusFor(snapshot, "55125", Date.parse(snapshot.generated)).status).toBe("restricted");
});

test("the parser rejects changed and stale feeds and rows expire at Central midnight", () => {
  expect(() => parseWisconsinPermits('{"counties":[]}', captured)).toThrow("shape");
  expect(() => parseWisconsinPermits('[{"COUNTY_NAME":"Vilas"}]', captured)).toThrow("shape");
  const data = feed();
  expect(() => parseWisconsinPermits(JSON.stringify([...data, data[0]]), captured)).toThrow("repeated county");
  expect(() => parseWisconsinPermits(fixture, midnight)).toThrow("9 a.m.");
  expect(() => parseWisconsinPermits(fixture, new Date("2026-11-24T15:07:00Z"))).toThrow("dated today");
  const expired = merge(parseWisconsinPermits(fixture, captured), midnight);
  expect(expired.sources[0].counties).toBe(0);
  expect(statusFor(expired, "55125", Date.parse(expired.generated)).status).toBe("unknown");
});

test("Wisconsin parses its full JSON fixture within the Worker CPU budget", () => {
  const run = () => parseWisconsinPermits(fixture, captured);
  for (let i = 0; i < 20; i++) run();
  const samples = Array.from({ length: 120 }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  expect(samples[113]).toBeLessThan(5);
});
