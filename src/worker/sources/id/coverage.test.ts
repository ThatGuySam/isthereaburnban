// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { arcgisRows } from "../lib/arcgis";
import { mergeSources } from "../merge";
import { idIdlStages, parseIdlStages } from "./idl-stages";
import { idKootenaiAir, parseKootenaiAir } from "./kootenai-air";
import { idSeasonal, parseIdahoSeasonal } from "./seasonal";

const read = (file, extension) => readFileSync(new URL(`./fixtures/${file}-2026-11-24.${extension}`, import.meta.url), "utf8");
const metadata = read("idl-layer", "json");
const attributes = read("idl-zones", "json");
const forecast = read("deq-coeur-dalene", "html");
const statute = read("section-38-115", "html");
const now = new Date("2026-11-24T08:32:00Z");
const inSeason = new Date("2026-10-20T12:00:00Z");
const activeZones = () => arcgisRows(JSON.parse(attributes), { requireComplete: true });
const parseZones = (features = activeZones(), layer = JSON.parse(metadata), time = now) => parseIdlStages(layer, features, time);

test("November 24 Idaho captures publish a scoped restriction in Kootenai and leave 43 counties unknown", async () => {
  const [district, seasonal] = await Promise.all([parseKootenaiAir(forecast, now), parseIdahoSeasonal(statute, now)]);
  const stages = parseZones();
  expect(stages).toEqual([]);
  expect(seasonal).toEqual([]);
  expect(district).toEqual([expect.objectContaining({
    status: "ban", fips: "16055", scope: "part", sourceUpdated: null,
    validFrom: "2026-11-24T08:00:00.000Z", validUntil: "2026-11-25T08:00:00.000Z",
  })]);
  const { snapshot } = mergeSources(null, [
    { source: idIdlStages, rows: stages, checked: now.toISOString() },
    { source: idKootenaiAir, rows: district, checked: now.toISOString() },
    { source: idSeasonal, rows: seasonal, checked: now.toISOString() },
  ], now);
  expect(snapshot.counties["16055"].status).toBe("restricted");
  expect(snapshot.counties["16055"].orders[0].scopeNote).toBe("Kootenai County Fire & Rescue district");
  expect(countiesInState("ID").filter(({ fips }) => !snapshot.counties[fips])).toHaveLength(43);
});

test("DEQ rejects stale, wrong-site, missing-day, and unrecognized outdoor decisions", async () => {
  await expect(parseKootenaiAir(forecast, new Date("2026-11-26T18:00:00Z"))).rejects.toThrow("stale");
  await expect(parseKootenaiAir(forecast.replace("Coeur d&#39;Alene 3-day", "Boundary County 3-day"), now)).rejects.toThrow("forecast");
  await expect(parseKootenaiAir(forecast.replace("Tuesday Nov 24", "Monday Nov 24"), now)).rejects.toThrow("today");
  await expect(parseKootenaiAir(forecast.replace("Conditional Restrictions", "Special notice"), now)).rejects.toThrow("outdoor burning action");
  await expect(parseKootenaiAir(forecast.replace("aqi-yellow-outline", "aqi-red-outline"), now)).rejects.toThrow("outdoor burning action");
});

test("the district's Yellow/Red rule reads outdoor burning separately from wood heating", async () => {
  const yellowToRed = forecast.replace("aqi-yellow-outline", "aqi-red-outline").replace("Conditional Restrictions", "Mandatory Restrictions");
  expect((await parseKootenaiAir(yellowToRed, now))[0].status).toBe("ban");
  const yellowToGreen = forecast.replace("aqi-yellow-outline", "aqi-green-outline").replace("Conditional Restrictions", "No Restrictions");
  expect(await parseKootenaiAir(yellowToGreen, now)).toEqual([]);
});

test("IDL maps an active zone to its county intersections and expires it at rescission", () => {
  const features = activeZones();
  const start = "2026-11-20T15:00:00.000Z";
  const end = "2026-11-24T15:00:00.000Z";
  const checked = "2026-11-21T15:00:00.000Z";
  const zone = features.find(({ Name }) => Name === "Little Salmon Zone");
  Object.assign(zone, {
    Stage: "Stage I", DateEnacted: Date.parse(start), DateRescinded: Date.parse(end), last_edited_date: Date.parse(checked),
  });
  const rows = parseZones(features);
  expect(rows.map(({ fips }) => fips)).toEqual(["16003", "16049"]);
  for (const row of rows) expect(row).toMatchObject({
    status: "restricted", scope: "part", scopeNote: "Little Salmon Zone, Payette Fire Restriction Area",
    label: "Stage 1 fire restrictions", validFrom: start, validUntil: end, sourceUpdated: checked,
  });
  expect(parseZones(features, JSON.parse(metadata), new Date(end))).toEqual([]);
  expect(parseZones(features, JSON.parse(metadata), new Date("2026-11-20T14:59Z"))).toEqual([]);
});

test("IDL rejects stale active stages, new codes and changed geography", () => {
  const features = activeZones();
  const [first] = features;
  expect(() => parseZones(features.slice(1))).toThrow("zone inventory");
  expect(() => arcgisRows({ ...JSON.parse(attributes), exceededTransferLimit: true }, { requireComplete: true })).toThrow("Incomplete");
  expect(() => parseZones([{ ...first, "Shape.STArea()": 1 }, ...features.slice(1)])).toThrow("changed fire restriction zone");
  expect(() => parseZones([{ ...first, Stage: "Stage III" }, ...features.slice(1)])).toThrow();
  const layer = JSON.parse(metadata);
  layer.fields.find(({ name }) => name === "Stage").domain.codedValues[1].name = "Changed";
  expect(() => parseZones(features, layer)).toThrow("changed fire restriction codes");
  first.Stage = "Stage II";
  expect(() => parseZones(features)).toThrow("stale stage report");
});

test("Idaho's recurring permit season applies on local dates, including both sides of Idaho County", async () => {
  const firstHour = new Date("2026-05-10T06:30:00Z");
  const mountainOnly = await parseIdahoSeasonal(statute, firstHour);
  expect(mountainOnly.some(({ fips }) => fips === "16055")).toBe(false);
  expect(mountainOnly.filter(({ fips }) => fips === "16049")).toEqual([expect.objectContaining({ validFrom: "2026-05-10T06:00:00.000Z" })]);
  const last = await parseIdahoSeasonal(statute, inSeason);
  expect(new Set(last.map(({ fips }) => fips)).size).toBe(44);
  expect(last.filter(({ fips }) => fips === "16049").map(({ validUntil }) => validUntil)).toEqual([
    "2026-10-21T06:00:00.000Z", "2026-10-21T07:00:00.000Z",
  ]);
  expect(await parseIdahoSeasonal(statute, new Date("2026-10-21T07:00:00Z"))).toEqual([]);
  expect(idSeasonal.recurring).toBe(true);
  await expect(parseIdahoSeasonal(statute.replace("May 10 to October 20", "May 15 to October 20"), inSeason)).rejects.toThrow("provisions changed");
});

for (const [source, parse] of [
  [idIdlStages, () => parseZones()],
  [idKootenaiAir, () => parseKootenaiAir(forecast, now)],
  [idSeasonal, () => parseIdahoSeasonal(statute, inSeason)],
]) {
  test(`${source.id} parses its publisher fixture in under 5 ms p95 process CPU`, async () => {
    for (let sample = 0; sample < 20; sample++) await parse();
    const samples = [];
    for (let sample = 0; sample < 120; sample++) {
      const start = process.cpuUsage();
      await parse();
      const used = process.cpuUsage(start);
      samples.push((used.user + used.system) / 1_000);
    }
    samples.sort((a, b) => a - b);
    expect(samples[113]).toBeLessThan(5);
  });
}
