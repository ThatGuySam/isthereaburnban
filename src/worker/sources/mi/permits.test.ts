// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mergeSources } from "../merge";
import { miPermits, parseMichiganPermits } from "./permits";

const fixture = readFileSync(new URL("./fixtures/permits-2026-11-24.json", import.meta.url), "utf8");
const captured = new Date("2026-11-24T05:00:52Z");
const merge = (rows, now = captured) =>
  mergeSources(null, [{ source: miPermits, rows, checked: now.toISOString() }], now).snapshot;

test("the DNR map reports scoped permit conditions for 49 counties", () => {
  const rows = parseMichiganPermits(JSON.parse(fixture), captured);
  const { counties, sources } = merge(rows);
  expect(sources[0]).toMatchObject({ counties: 49, bans: 0 });
  expect(rows.filter(({ status }) => status === "restricted")).toHaveLength(10);
  expect(rows.filter(({ status }) => status === "unknown")).toHaveLength(39);
  expect(counties["26103"]).toMatchObject({
    scope: "part", status: "restricted", sourceUpdated: "2026-11-24T05:00:04.000Z",
    label: "Township debris-burning permits vary by location",
    note: expect.stringContaining("local issuance"),
    orders: [{ status: "restricted", scopeNote: "Township debris-burning permits" }],
  });
  expect(counties["26083"]).toMatchObject({
    status: "unknown", note: expect.stringContaining("permits available"),
  });
  expect(counties["26099"]).toBeUndefined(); // Gray: local issuer.
});

test("brown suspends open debris burning across a county without reporting a general burn ban", () => {
  const data = JSON.parse(fixture);
  data.features.find(({ attributes }) => attributes.FIPS2 === "061").attributes.STATUS = 0;
  const rows = parseMichiganPermits(data, captured);
  expect(merge(rows).counties["26061"]).toMatchObject({
    status: "restricted", scope: "county", label: "DNR reports open debris burning is closed",
    validUntil: "2026-11-24T07:00:04.000Z",
  });
  expect(merge(rows, new Date("2026-11-24T07:00:04Z")).counties["26061"]).toBeUndefined();
});

test("a new code leaves the county unconfirmed without discarding other county reports", () => {
  const data = JSON.parse(fixture);
  data.features.find(({ attributes }) => attributes.FIPS2 === "061").attributes.STATUS = 99;
  const { counties } = merge(parseMichiganPermits(data, captured));
  expect(counties["26061"]).toBeUndefined();
  expect(counties["26103"].status).toBe("restricted");
});

test("the DNR map rejects stale, future, truncated, and changed payloads", () => {
  const data = JSON.parse(fixture);
  expect(() => parseMichiganPermits(data, new Date("2026-11-24T07:00:04Z"))).toThrow("current");
  expect(() => parseMichiganPermits(data, new Date("2026-11-24T05:00:00Z"))).toThrow("current");
  expect(() => parseMichiganPermits({ ...data, exceededTransferLimit: true }, captured)).toThrow("Incomplete");
  expect(() => parseMichiganPermits({ ...data, features: data.features.slice(1) }, captured)).toThrow("83 counties");
  expect(() => parseMichiganPermits({ features: [null] }, captured)).toThrow("attributes");
  data.features[0].attributes.PullStamp = null;
  expect(() => parseMichiganPermits(data, captured)).toThrow("PullStamp");
});

test("the previous day's map expires at midnight Eastern even if the pull was recent", () => {
  const data = JSON.parse(fixture);
  for (const { attributes } of data.features) attributes.PullStamp = Date.parse("2026-11-24T23:50:00Z");
  const rows = parseMichiganPermits(data, new Date("2026-11-25T04:55:00Z"));
  expect(rows.every(({ validUntil }) => validUntil === "2026-11-25T05:00:00.000Z")).toBe(true);
  expect(() => parseMichiganPermits(data, new Date("2026-11-25T05:00:00Z"))).toThrow("current");
});

test("Michigan parses and maps its real ArcGIS fixture well within the Worker CPU budget", () => {
  const run = () => parseMichiganPermits(JSON.parse(fixture), captured);
  for (let i = 0; i < 20; i++) run();
  const samples = Array.from({ length: 120 }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  expect(samples[113]).toBeLessThan(5);
});
