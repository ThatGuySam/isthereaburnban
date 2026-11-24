// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mergeSources } from "../merge";
import { njRestrictions, parseNjRestrictions } from "./restrictions";

const fixture = (area) => readFileSync(new URL(`./fixtures/${area}-2026-11-24.json`, import.meta.url), "utf8");
const divisionsJson = fixture("divisions");
const countiesJson = fixture("counties");
const captured = new Date("2026-11-24T05:14:40Z");
const division = (data, name) => data.features.find(({ attributes }) => attributes.DIVISION === name).attributes;
const county = (data, name) => data.features.find(({ attributes }) => attributes.COUNTY === name).attributes;
const parse = (divisions = JSON.parse(divisionsJson), counties = JSON.parse(countiesJson), now = captured) =>
  parseNjRestrictions(divisions, counties, now);
const merge = (rows, now = captured) =>
  mergeSources(null, [{ source: njRestrictions, rows, checked: captured.toISOString() }], now).snapshot;

test("NJDEP fixture reports scoped conditions in 18 counties and leaves all countywide statuses unknown", () => {
  const { counties, sources } = merge(parse());
  expect(sources[0]).toMatchObject({ counties: 18, bans: 0 });
  expect(Object.values(counties).map(({ status }) => status)).toEqual(Array(18).fill("unknown"));
  expect(counties["34021"]).toMatchObject({
    scope: "part", sourceUpdated: "2026-11-22T18:55:21.100Z", validUntil: "2026-11-24T18:55:21.100Z",
    orders: [{ scopeNote: "Division A (northern New Jersey), part of Mercer County" }],
  });
  expect(counties["34029"]).toBeUndefined(); // Division B's edit is too old.
  expect(counties["34015"]?.note).toContain("no temporary agricultural"); // Gloucester's inactive row carries a legacy Y.
});

test("the regional stage and agricultural flag stay scoped, including both parts of split counties", () => {
  const data = JSON.parse(divisionsJson);
  Object.assign(division(data, "A"), { RECFIRE_RESTRICTION: "STAGE1", AGBURN_RESTRICTION: "Y", FROST_EXCEPTION: "Y" });
  Object.assign(division(data, "B"), { RECFIRE_RESTRICTION: "STAGE2", EditDate: captured.getTime() });
  Object.assign(division(data, "C"), { RECFIRE_RESTRICTION: "STAGE3" });
  const { counties, sources } = merge(parse(data));
  expect(sources[0]).toMatchObject({ counties: 21, bans: 0 });
  expect(counties["34023"]).toMatchObject({
    status: "restricted", scope: "part",
    orders: [
      {
        status: "restricted", scopeNote: "Division A (northern New Jersey), part of Middlesex County",
        label: "Stage 1 campfire restriction and Agricultural open-burning restriction",
        note: expect.stringContaining("frost exception"),
      },
      { status: "restricted", scopeNote: "Division B (central New Jersey), part of Middlesex County", label: "Stage 2 campfire restriction" },
    ],
  });
  expect(counties["34001"]).toMatchObject({ status: "restricted", note: expect.stringContaining("Wood and charcoal") });
});

test("an active county report supersedes division reports and expires independently", () => {
  const divisions = JSON.parse(divisionsJson);
  division(divisions, "A").RECFIRE_RESTRICTION = "STAGE2";
  const data = JSON.parse(countiesJson);
  const mercer = county(data, "MERCER");
  Object.assign(mercer, { FIRE_DANGER: "LOW", RECFIRE_RESTRICTION: "N", AGBURN_RESTRICTION: "Y", EditDate: captured.getTime() });
  const rows = parse(divisions, data);
  expect(merge(rows).counties["34021"]).toMatchObject({
    status: "restricted", scope: "county", label: "Agricultural open-burning restriction",
    validUntil: "2026-11-26T05:14:40.000Z",
  });
  expect(rows.filter(({ fips }) => fips === "34021")).toHaveLength(1);
  expect(merge(rows).counties["34003"]?.status).toBe("restricted");
  expect(merge(rows, new Date("2026-11-26T05:14:40Z")).counties["34021"]).toBeUndefined();

  mercer.AGBURN_RESTRICTION = "N";
  expect(merge(parse(divisions, data)).counties["34021"]?.status).toBe("unknown");
  mercer.EditDate = Date.parse("2026-11-20T05:00:00Z");
  expect(merge(parse(divisions, data)).counties["34021"]).toBeUndefined();
});

test("an unrecognized activity code leaves that activity unconfirmed", () => {
  const data = JSON.parse(divisionsJson);
  const a = division(data, "A");
  Object.assign(a, { RECFIRE_RESTRICTION: "STAGE4", AGBURN_RESTRICTION: "Y" });
  expect(merge(parse(data)).counties["34003"]).toMatchObject({
    status: "restricted", note: expect.stringContaining("campfire restriction status is unconfirmed"),
  });
  a.AGBURN_RESTRICTION = "E";
  expect(merge(parse(data)).counties["34003"]).toBeUndefined();
  expect(merge(parse(data)).counties["34001"]?.status).toBe("unknown");
});

test("stale, future, incomplete, and changed inputs fail validation", () => {
  expect(() => parse(undefined, undefined, new Date("2026-11-26T05:14:40Z"))).toThrow("no current");
  const divisions = JSON.parse(divisionsJson);
  for (const { attributes } of divisions.features) attributes.EditDate = captured.getTime() + 60_000;
  expect(() => parse(divisions)).toThrow("no current");
  expect(() => parse({ ...divisions, exceededTransferLimit: true })).toThrow("Incomplete ArcGIS");
  const counties = JSON.parse(countiesJson);
  expect(() => parse(undefined, { features: counties.features.slice(1) })).toThrow("incomplete COUNTY");
  delete county(counties, "MERCER").RECFIRE_RESTRICTION;
  expect(() => parse(undefined, counties)).toThrow("missing fields for MERCER");
});

test("New Jersey parses both real ArcGIS responses well within the Worker CPU budget", () => {
  for (let i = 0; i < 20; i++) parse();
  const samples = Array.from({ length: 120 }, () => {
    const start = performance.now();
    parse();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  expect(samples[113]).toBeLessThan(5);
});
