// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { arcgisRows } from "../lib/arcgis";
import { mergeSources } from "../merge";
import { akDnrPermitZones, parseAlaskaPermitZones } from "./permits";
import { akDecWinterBurning, akDnrFireSeason, parseAlaskaFireSeason, parseAlaskaWinterBurning } from "./seasonal";

const read = (name, extension) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.${extension}`, import.meta.url), "utf8");
const metadata = read("permit-layer", "json");
const attributes = read("permit-zones", "json");
const winterRule = read("18-aac-50-065", "html");
const winterAreas = read("18-aac-50-015-through-025", "html");
const fireSeason = read("as-41-15-050", "html");
const permitRule = read("11-aac-95-412", "html");
const now = new Date("2026-11-24T10:00:00Z");
const nearEdit = new Date("2026-09-16T18:15:15Z");
const summer = new Date("2026-07-01T16:00:00Z");
const zones = () => arcgisRows(JSON.parse(attributes), { requireComplete: true });
const parseZones = (features = zones(), layer = JSON.parse(metadata), time = nearEdit) => parseAlaskaPermitZones(layer, features, time);
const parseWinter = (time = now) => parseAlaskaWinterBurning(winterRule, winterAreas, time);
const parseSummer = (time = summer) => parseAlaskaFireSeason(fireSeason, permitRule, time);

test("the captured DNR layer is stale in November, and its open or empty codes never imply countywide clearance", () => {
  expect(() => parseZones(zones(), JSON.parse(metadata), now)).toThrow("stale or undated");
  expect(parseZones()).toEqual([]);
  expect(() => parseZones(zones(), JSON.parse(metadata), new Date("2026-09-15T18:15:15Z"))).toThrow("stale or undated");
});

test("fresh DNR closures and suspensions retain their zone, activity and county intersections", () => {
  const features = zones();
  features.find(({ Name }) => Name === "MatSu West").Status = 2;
  features.find(({ Name }) => Name === "Kodiak").Status = 1;
  const rows = parseZones(features);
  expect(rows.map(({ fips, scope, label, scopeNote }) => [fips, scope, label, scopeNote])).toEqual([
    ["02122", "part", "Burn permits suspended", "DNR permit zone: MatSu West"],
    ["02170", "part", "Burn permits suspended", "DNR permit zone: MatSu West"],
    ["02150", "part", "Burning closed except in approved devices", "DNR permit zone: Kodiak"],
  ]);
  expect(rows[0]).toMatchObject({
    status: "restricted", sourceUpdated: "2026-09-15T18:15:15.435Z", validUntil: "2026-09-17T18:15:15.435Z",
    since: null, expires: null, officialUrl: "https://dnr.alaska.gov/burn/fireareas/mat-su",
  });
  expect(() => parseZones(features, JSON.parse(metadata), new Date(rows[0].validUntil))).toThrow("stale or undated");
});

test("DNR rejects changed domains, missing or duplicate zones, changed geography and unknown statuses", () => {
  const layer = JSON.parse(metadata);
  layer.fields.find(({ name }) => name === "Status").domain.codedValues[0].name = "New description";
  expect(() => parseZones(zones(), layer)).toThrow("status domain");
  const [first, second, ...rest] = zones();
  expect(() => parseZones(rest)).toThrow("zone inventory");
  expect(() => parseZones([first, first, ...rest])).toThrow("unmapped or changed");
  expect(() => parseZones([{ ...first, Shape__Area: 10 }, second, ...rest])).toThrow("unmapped or changed");
  expect(() => parseZones([{ ...first, Status: 3 }, second, ...rest])).toThrow("unknown permit status");
  expect(() => parseZones([{ ...first, BurnPermitLink: "https://example.com/" }, second, ...rest])).toThrow("invalid permit link");
});

test("November 24 publishes scoped winter restrictions in two boroughs and leaves 28 equivalents unknown", async () => {
  const [winter, summerRows] = await Promise.all([parseWinter(), parseSummer(now)]);
  expect(summerRows).toEqual([]);
  expect(winter.map(({ fips, scopeNote }) => [fips, scopeNote])).toEqual([
    ["02090", "Fairbanks and North Pole PM2.5 nonattainment area"],
    ["02110", "Mendenhall Valley wood smoke control area"],
  ]);
  const checked = now.toISOString();
  const { snapshot, transitions } = mergeSources(null, [
    { source: akDnrPermitZones, rows: [], checked, error: "stale report" },
    { source: akDecWinterBurning, rows: winter, checked },
    { source: akDnrFireSeason, rows: summerRows, checked },
  ], now);
  expect(countiesInState("AK").filter(({ fips }) => !snapshot.counties[fips])).toHaveLength(28);
  expect(Object.values(snapshot.counties).map(({ status }) => status)).toEqual(["restricted", "restricted"]);
  expect(snapshot.counties["02090"].orders[0]).toMatchObject({ scope: "part", status: "ban" });
  expect(transitions).toEqual([]);
});

test("the winter rule spans New Year and ends at April 1 Alaska midnight", async () => {
  expect(await parseWinter(new Date("2026-11-01T07:59:59Z"))).toEqual([]);
  expect((await parseWinter(new Date("2026-11-01T08:00:00Z")))[0].validFrom).toBe("2026-11-01T08:00:00.000Z");
  expect(await parseWinter(new Date("2027-01-01T13:00Z"))).toHaveLength(2);
  expect((await parseWinter(new Date("2027-04-01T07:59:59Z")))[0].validUntil).toBe("2027-04-01T08:00:00.000Z");
  expect(await parseWinter(new Date("2027-04-01T08:00:00Z"))).toEqual([]);
  expect(akDecWinterBurning.recurring).toBe(true);
});

test("fire-season permits start and end on local dates, including both sides of Aleutians West", async () => {
  expect(await parseSummer(new Date("2026-04-01T07:59:59Z"))).toEqual([]);
  const mainland = await parseSummer(new Date("2026-04-01T08:00:00Z"));
  expect(mainland).toHaveLength(30);
  expect(mainland.filter(({ fips }) => fips === "02016")).toHaveLength(1);
  const both = await parseSummer(new Date("2026-04-01T09:00:00Z"));
  expect(both.filter(({ fips }) => fips === "02016").map(({ validFrom }) => validFrom)).toEqual([
    "2026-04-01T08:00:00.000Z", "2026-04-01T09:00:00.000Z",
  ]);
  const last = await parseSummer(new Date("2026-09-01T08:59:59Z"));
  expect(last).toEqual([expect.objectContaining({ fips: "02016", validUntil: "2026-09-01T09:00:00.000Z" })]);
  expect(await parseSummer(new Date("2026-09-01T09:00:00Z"))).toEqual([]);
  expect(akDnrFireSeason.recurring).toBe(true);
});

test("the seasonal sources fail closed if the Legislature changes the dates, areas or permit law", async () => {
  await expect(parseAlaskaWinterBurning(winterRule.replace("November 1", "December 1"), winterAreas, now)).rejects.toThrow("50.065");
  await expect(parseAlaskaWinterBurning(winterRule, winterAreas.replace("Mendenhall Valley", "Another Valley"), now)).rejects.toThrow("50.025");
  await expect(parseAlaskaFireSeason(fireSeason.replace("August 31", "August 15"), permitRule, summer)).rejects.toThrow("41.15.050");
  await expect(parseAlaskaFireSeason(fireSeason, "<p>Unavailable</p>", summer)).rejects.toThrow("95.412");
});

for (const [source, parse] of [
  [akDnrPermitZones, () => parseZones()],
  [akDnrFireSeason, () => parseSummer()],
  [akDecWinterBurning, () => parseWinter()],
]) {
  test(`${source.id} parses its real fixtures under 5 ms p95 process CPU`, async () => {
    for (let sample = 0; sample < 20; sample++) await parse();
    const samples: number[] = [];
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
