// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mergeSources } from "../merge";
import { ksDickinsonDistricts, parseDickinsonDistricts } from "./dickinson";
import { ksAprilBurning, ksFranklinPermits, ksOpenBurning, parseFranklinPermits, parseKansasApril, parseKansasOpenBurning } from "./open-burning";

const fixture = (name, ext = "html") => readFileSync(new URL(`./fixtures/${name}-2026-11-24.${ext}`, import.meta.url), "utf8");
const layer = fixture("dickinson-layer", "json");
const districts = fixture("dickinson-districts", "json");
const state = fixture("joco-regulations");
const april = fixture("ksfire-april");
const franklin = fixture("franklin-permits");
const now = new Date("2026-11-24T15:52:01Z");
const aprilMidnight = new Date("2027-04-01T05:00:00Z");
const nextMay = new Date("2027-05-01T05:00:00Z");

test("Dickinson publishes only the four active district bans from the real map", () => {
  const rows = parseDickinsonDistricts(JSON.parse(layer), JSON.parse(districts), now);
  expect(rows.map(({ scopeNote }) => scopeNote)).toEqual([
    "Longford - Talmage FD response area within Dickinson County", "DK CO Dist #1 FD response area within Dickinson County",
    "SA CO Dist #1 FD response area within Dickinson County", "Enterprise FD response area within Dickinson County",
  ]);
  for (const row of rows) expect(row).toMatchObject({
    fips: "20041", scope: "part", status: "ban", since: null, expires: null,
    sourceUpdated: "2026-11-23T16:24:12.684Z", validUntil: "2026-11-30T16:24:12.684Z",
  });
  const input = JSON.parse(districts);
  for (const feature of input.features) feature.attributes.BanStatus = 1;
  expect(parseDickinsonDistricts(JSON.parse(layer), input, now)).toEqual([]);
  input.features[0].attributes.BanStatus = 3;
  expect(parseDickinsonDistricts(JSON.parse(layer), input, now)).toMatchObject([
    { fips: "20041", scope: "part", status: "restricted", label: "District grassland burning only" },
  ]);
});

test("Dickinson rejects stale edits, unknown codes and incomplete layer results", () => {
  const meta = JSON.parse(layer);
  const data = JSON.parse(districts);
  expect(() => parseDickinsonDistricts(meta, data, new Date("2026-11-30T16:24:12.684Z"))).toThrow("stale or invalid");
  expect(() => parseDickinsonDistricts(meta, data, new Date("2026-11-23T16:24:12.683Z"))).toThrow("stale or invalid");
  expect(() => parseDickinsonDistricts(meta, { ...data, exceededTransferLimit: true }, now)).toThrow("Incomplete ArcGIS response");
  expect(() => parseDickinsonDistricts(meta, { ...data, features: data.features.slice(1) }, now)).toThrow("fire district roster");
  data.features[0].attributes.BanStatus = 4;
  expect(() => parseDickinsonDistricts(meta, data, now)).toThrow();
  meta.types[1].name = "No Ban";
  expect(() => parseDickinsonDistricts(meta, data, now)).toThrow("unexpected ArcGIS burn-status codes");
});

test("Kansas's April rule replaces the usual rule in exactly 16 counties", async () => {
  const fall = await parseKansasOpenBurning(state, now);
  expect(fall).toHaveLength(105);
  expect(fall.every(({ status, scope }) => status === "restricted" && scope === "state")).toBe(true);
  expect(await parseKansasApril(april, now)).toEqual([]);

  const general = await parseKansasOpenBurning(state, aprilMidnight);
  const seasonal = await parseKansasApril(april, aprilMidnight);
  expect(general).toHaveLength(89);
  expect(seasonal.map(({ county }) => county.replace(/ County$/, ""))).toEqual([
    "Butler", "Chase", "Chautauqua", "Cowley", "Elk", "Geary", "Greenwood", "Johnson", "Lyon", "Marion", "Morris",
    "Pottawatomie", "Riley", "Sedgwick", "Wabaunsee", "Wyandotte",
  ]);
  expect(new Set([...general, ...seasonal].map(({ fips }) => fips)).size).toBe(105);
  expect(seasonal.every((row) => row.scope === "county" && row.status === "restricted" &&
    row.since === "2027-04-01" && row.expires === "2027-04-30")).toBe(true);
  expect((await parseKansasApril(april, new Date(aprilMidnight.getTime() - 1)))[0].validFrom).toBe(aprilMidnight.toISOString());
  expect((await parseKansasApril(april, new Date(nextMay.getTime() - 1)))[0].validUntil).toBe(nextMay.toISOString());
  expect(await parseKansasApril(april, nextMay)).toEqual([]);
  expect(await parseKansasOpenBurning(state, nextMay)).toHaveLength(105);
});

test("Kansas guidance fails closed on changed standing text or a changed county table", async () => {
  await expect(parseKansasOpenBurning(state.replace("five or less", "four or less"), now)).rejects.toThrow("reviewed state limits");
  await expect(parseKansasApril(april.replace("crop residues", "grasslands"), now)).rejects.toThrow("reviewed limits");
  await expect(parseKansasApril(april.replace(">Butler<", ">Allen<"), now)).rejects.toThrow("county table");
  await expect(parseFranklinPermits(franklin.replace("unincorporated areas", "incorporated areas"), now)).rejects.toThrow("reviewed burn-permit guidance");
});

test("Kansas county summaries carry local evidence without promoting it to a countywide ban", async () => {
  const entries = await Promise.all([
    [ksOpenBurning, parseKansasOpenBurning(state, now)], [ksAprilBurning, parseKansasApril(april, now)],
    [ksFranklinPermits, parseFranklinPermits(franklin, now)],
    [ksDickinsonDistricts, parseDickinsonDistricts(JSON.parse(layer), JSON.parse(districts), now)],
  ].map(async ([source, rows]) => ({ source, rows: await rows, checked: now.toISOString() })));
  const { snapshot } = mergeSources(null, entries, now);
  expect(Object.values(snapshot.counties)).toHaveLength(105);
  expect(Object.values(snapshot.counties).every(({ status }) => status === "restricted")).toBe(true);
  expect(snapshot.counties["20041"].orders?.map(({ status, scope }) => [status, scope])).toEqual(
    Array.from({ length: 4 }, () => ["ban", "part"]),
  );
  expect(snapshot.counties["20059"].orders).toMatchObject([
    { status: "restricted", scope: "part", scopeNote: "Most open burning in unincorporated Franklin County" },
  ]);
  expect(entries.filter(({ source }) => source.recurring).map(({ source }) => source.id)).toEqual([
    "ks-state-open-burning", "ks-april-open-burning", "ks-franklin-burn-permits",
  ]);
  expect(entries.every(({ source }) => source.mode === "positive-only")).toBe(true);
});

const parsers = [
  ["Dickinson districts", () => parseDickinsonDistricts(JSON.parse(layer), JSON.parse(districts), now)],
  ["standing state rules", () => parseKansasOpenBurning(state, now)],
  ["April restrictions", () => parseKansasApril(april, aprilMidnight)],
  ["Franklin permits", () => parseFranklinPermits(franklin, now)],
];
test.each(parsers)("Kansas %s fixture stays under 4 ms p95 thread CPU", async (_name, parse) => {
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
});
