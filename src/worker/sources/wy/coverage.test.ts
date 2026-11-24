// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { parseWyomingCountyOrders, wyCountyOrders } from "./county-orders";
import { parseWyomingStateLands, wyStateLands } from "./state-lands";

const read = (name) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.json`, import.meta.url), "utf8");
const metadata = read("county-layer");
const counties = read("county-restrictions");
const stateLands = read("state-lands-rule");
const now = new Date("2026-11-24T09:41:20Z");

test("the real Wyoming county map has no recent positive status and cannot establish an all-clear", () => {
  const data = JSON.parse(counties);
  expect(data.features).toHaveLength(24);
  expect(data.features.filter(({ attributes }) => /^Stage /.test(attributes.Restriction))).toHaveLength(5);
  expect(parseWyomingCountyOrders(JSON.parse(metadata), data, now)).toEqual([]);
});

test("a recent explicit Wyoming stage with an order link maps only to the named county's order area", () => {
  const data = JSON.parse(counties);
  const crook = data.features.find(({ attributes }) => attributes.COUNTYNAME === "Crook").attributes;
  crook.EditDate = Date.parse("2026-11-03T18:00:00Z");
  const layer = JSON.parse(metadata);
  const rows = parseWyomingCountyOrders(layer, data, now);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "56011", status: "restricted", label: "Stage 2 fire restriction",
    scope: "part", scopeNote: "Unincorporated areas named in the Crook County order",
    officialUrl: crook.Link, since: null, expires: null,
    sourceUpdated: "2026-11-03T18:00:00.000Z", validUntil: "2027-02-01T18:00:00.000Z",
  });

  expect(parseWyomingCountyOrders(layer, data, new Date(rows[0].validUntil))).toEqual([]);
  crook.Restriction = "Stage 5";
  expect(parseWyomingCountyOrders(layer, data, now)).toEqual([]);
  crook.Restriction = "Closed";
  const { Link } = crook;
  crook.Link = "javascript:void(0)";
  expect(parseWyomingCountyOrders(layer, data, now)).toEqual([]);
  crook.Link = Link;
  data.features.push({ attributes: { ...crook, OBJECTID_1: 100, COUNTYNAME: "Crook County", Restriction: "None" } });
  expect(parseWyomingCountyOrders(layer, data, now)).toEqual([]);
});

test("the county parser rejects changed, stale, and incomplete source responses", () => {
  const data = JSON.parse(counties);
  const layer = JSON.parse(metadata);
  expect(() => parseWyomingCountyOrders(layer, { ...data, exceededTransferLimit: true }, now)).toThrow("Incomplete ArcGIS");
  expect(() => parseWyomingCountyOrders(layer, data, new Date("2027-03-01T19:00:00Z"))).toThrow("stale or invalid");
  layer.fields.find(({ name }) => name === "Restriction").domain.codedValues = [];
  expect(() => parseWyomingCountyOrders(layer, data, now)).toThrow("stage domain changed");
  const duplicate = JSON.parse(counties);
  duplicate.features.push(duplicate.features[0]);
  expect(() => parseWyomingCountyOrders(JSON.parse(metadata), duplicate, now)).toThrow("duplicate ArcGIS object ID");
});

test("the real Wyoming land layer confirms a year-round rule for state trust lands", () => {
  const data = JSON.parse(stateLands);
  const rows = parseWyomingStateLands(data, now);
  expect(new Set(rows.map(({ fips }) => fips)).size).toBe(23);
  expect(rows.every(({ status, scope, scopeNote }) =>
    status === "restricted" && scope === "part" && scopeNote === "Wyoming state trust lands")).toBe(true);
  expect(parseWyomingStateLands(data, new Date("2027-07-01T06:00:00Z"))).toHaveLength(23);
  expect(SOURCES.find(({ id }) => id === wyStateLands.id)?.recurring).toBe(true);
});

test("a changed or ambiguous Wyoming state land rule cannot stand in for the reviewed statute", () => {
  const data = JSON.parse(stateLands);
  const [feature] = data.features;
  expect(() => parseWyomingStateLands({ ...data, exceededTransferLimit: true }, now)).toThrow("Incomplete ArcGIS");
  expect(() => parseWyomingStateLands({ ...data, features: [feature, feature] }, now)).toThrow("reviewed year-round rule");
  feature.attributes.restriction_order += " during summer";
  expect(() => parseWyomingStateLands(data, now)).toThrow("reviewed year-round rule");
  feature.attributes.restriction_status = "Unknown";
  expect(() => parseWyomingStateLands(data, now)).toThrow("reviewed year-round rule");
});

test("Wyoming publishes the trust land rule as a local order in each county", () => {
  const checked = now.toISOString();
  const { snapshot } = mergeSources(null, [
    { source: wyCountyOrders, checked, rows: parseWyomingCountyOrders(JSON.parse(metadata), JSON.parse(counties), now) },
    { source: wyStateLands, checked, rows: parseWyomingStateLands(JSON.parse(stateLands), now) },
  ], now);
  expect(Object.keys(snapshot.counties)).toHaveLength(23);
  expect(snapshot.counties["56025"]).toMatchObject({
    status: "restricted", scope: "part",
    orders: [{ status: "restricted", scopeNote: "Wyoming state trust lands" }],
  });
});

for (const [name, parse] of [
  ["county orders", () => parseWyomingCountyOrders(JSON.parse(metadata), JSON.parse(counties), now)],
  ["state trust lands", () => parseWyomingStateLands(JSON.parse(stateLands), now)],
]) {
  test(`Wyoming ${name} parses the real fixture within the Worker CPU budget`, () => {
    for (let i = 0; i < 10; i++) parse();
    const timings = Array.from({ length: 100 }, () => {
      const start = performance.now();
      parse();
      return performance.now() - start;
    }).sort((a, b) => a - b);
    expect(timings[94]).toBeLessThan(4);
  });
}
