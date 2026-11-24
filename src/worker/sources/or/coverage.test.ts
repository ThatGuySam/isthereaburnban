// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { mergeSources } from "../merge";
import { orLrapaHeating, orLrapaOutdoor, parseLrapaHeating, parseLrapaOutdoor } from "./lrapa";
import { orOdfPublicUse, parseOdfPublicUse } from "./odf";
import { orWillametteBackyard, parseWillametteBackyard } from "./willamette";

const fixture = (name, extension = "html") => readFileSync(new URL(`./fixtures/${name}.${extension}`, import.meta.url), "utf8");
const outdoor = fixture("lrapa-outdoor-2026-11-24");
const heating = fixture("lrapa-wood-heating-2026-11-24");
const valley = fixture("willamette-2026-11-23");
const weekend = fixture("willamette-2026-11-21-22");
const odfLayer = fixture("odf-layer-2026-11-24", "json");
const odfAreas = fixture("odf-areas-2026-11-24", "json");
const captured = new Date("2026-11-24T07:06:00Z");
const midnight = new Date("2026-11-24T08:00:00Z");

test("LRAPA maps the seven published outdoor areas without using the calculated map colors", async () => {
  const rows = await parseLrapaOutdoor(outdoor, captured);
  expect(rows.filter(({ status }) => status === "ban")).toHaveLength(5);
  expect(rows.every(({ fips, scope }) => fips === "41039" && scope === "part")).toBe(true);
  expect(rows[0]).toMatchObject({
    status: "restricted", scopeNote: "Coastal Lane County, residential woody yard debris",
    label: "Yard debris burning limited to 10 AM–4 PM Pacific",
    sourceUpdated: "2026-11-24T03:00:00.000Z", since: "2026-11-24", expires: "2026-11-24",
    validFrom: midnight.toISOString(), validUntil: "2026-11-25T08:00:00.000Z",
  });
  expect(rows.find(({ scopeNote }) => scopeNote.startsWith("Eugene city limits"))?.status).toBe("ban");
  expect(rows.find(({ scopeNote }) => scopeNote.startsWith("Eugene urban growth boundary"))?.note).toContain("Closed till March 1st");
});

test("LRAPA rejects stale, unissued, contradictory or geographically changed outdoor decisions", async () => {
  await expect(parseLrapaOutdoor(outdoor, new Date("2026-11-25T08:00:00Z"))).rejects.toThrow("stale");
  await expect(parseLrapaOutdoor(outdoor, new Date("2026-11-24T02:59:59Z"))).rejects.toThrow("publication time");
  await expect(parseLrapaOutdoor(outdoor.replace('LevelCd": "Allowed"', 'LevelCd": "Pending"'), captured)).rejects.toThrow("Invalid option");
  await expect(parseLrapaOutdoor(outdoor.replace("Coastal Lane County", "Oregon Coast"), captured)).rejects.toThrow("inconsistent");
  await expect(parseLrapaOutdoor(outdoor.replace('"16:00:00"', '"08:00:00"'), captured)).rejects.toThrow("hours");
  await expect(parseLrapaOutdoor(outdoor.replace("Outdoor Burning Advisory", "About Outdoor Burning"), captured)).rejects.toThrow("missing");
});

test("LRAPA wood-heating colors use the published 4 p.m. window and scoped effects", async () => {
  expect(await parseLrapaHeating(heating, captured)).toEqual([]);
  const colors = heating.replace('HWHLevelCd": "Allowed"', 'HWHLevelCd": "Caution"')
    .replace('HWHLevelNm": "Allowed"', 'HWHLevelNm": "Caution"')
    .replace(/(HWHLevel(?:Cd|Nm)": )"Allowed"/g, '$1"Prohibited"');
  const rows = await parseLrapaHeating(colors, captured);
  expect(rows).toMatchObject([
    { label: "Yellow advisory prohibits recreational fires", scopeNote: "Eugene, Springfield and their urban growth boundaries" },
    { label: "Red advisory limits wood heating and prohibits recreational fires", scopeNote: "Oakridge and its urban growth boundary" },
  ]);
  expect(rows.every(({ scope, status }) => scope === "part" && status === "restricted")).toBe(true);
  expect(rows[1]).toMatchObject({
    sourceUpdated: "2026-11-23T22:00:00.000Z", validFrom: "2026-11-24T00:00:00.000Z", validUntil: "2026-11-25T00:00:00.000Z",
  });
  await expect(parseLrapaHeating(colors, new Date("2026-11-25T00:00:00Z"))).rejects.toThrow("stale");
  await expect(parseLrapaHeating(heating.replace('HWHLevelNm": "Allowed"', 'HWHLevelNm": "Undetermined"'), captured)).rejects.toThrow("Invalid option");
  const offSeason = colors.replaceAll("11/24/2026", "06/03/2026").replaceAll("2026-11-24", "2026-06-03").replaceAll("2026-11-23", "2026-06-02");
  expect(await parseLrapaHeating(offSeason, new Date("2026-06-03T01:00:00Z"))).toEqual([]);
});

test("Willamette reads discrete backyard decisions and keeps agricultural guidance out of status", () => {
  const rows = parseWillametteBackyard(valley, captured);
  expect(rows.map(({ county }) => county)).toEqual([
    "Benton County", "Clackamas County", "Linn County", "Marion County", "Multnomah County",
    "Polk County", "Washington County", "Yamhill County",
  ]);
  expect(rows.every(({ status, scope, scopeNote }) => status === "ban" && scope === "part" && scopeNote.includes("Zone 604"))).toBe(true);
  const upcoming = parseWillametteBackyard(weekend, new Date("2026-11-21T17:00:00Z"));
  expect(upcoming).toHaveLength(16);
  expect(upcoming.filter(({ status }) => status === "restricted")).toHaveLength(8);
  expect(upcoming[8]).toMatchObject({
    since: "2026-11-22", validFrom: "2026-11-22T08:00:00.000Z",
    label: "Backyard burning limited to 12:00 p.m.–2:30 p.m. Pacific where locally allowed",
  });
  expect(() => parseWillametteBackyard(valley, midnight)).toThrow("current Pacific date");
  expect(() => parseWillametteBackyard(valley.replace("NORTH OF LANE COUNTY", "STATEWIDE"), captured)).toThrow("scope");
  const changes = valley.replace("agricultural burning is not recommended", "agricultural burning is not allowed")
    .replace("backyard burning is not allowed", "backyard burning is pending");
  expect(() => parseWillametteBackyard(changes, captured)).toThrow("unrecognized backyard burning");
});

test("ODF map only reports restrictions on protected lands in each mapped regulated-use area", () => {
  const metadata = JSON.parse(odfLayer);
  const data = JSON.parse(odfAreas);
  expect(parseOdfPublicUse(metadata, data, captured)).toEqual([]);

  const area = data.features.find(({ attributes }) => attributes.regusearea === "NW-3").attributes;
  area.openfire = 2;
  expect(parseOdfPublicUse(metadata, data, captured)).toEqual([]);
  area.debrisburning = 2;
  const debris = parseOdfPublicUse(metadata, data, captured);
  expect(debris.map(({ fips }) => fips)).toEqual(["41007", "41009", "41051", "41057", "41067", "41071"]);
  expect(debris[0].note).toContain("Debris Burn Permit Required");
  expect(debris[0].note).not.toContain("Campfires");
  area.reguseineffect = -1;
  area.openfireother = 1;
  const regulated = parseOdfPublicUse(metadata, data, captured);
  expect(regulated[0]).toMatchObject({
    status: "restricted", scope: "part", scopeNote: "ODF-protected land in Northwest regulated-use area NW-3",
    sourceUpdated: "2026-11-20T18:06:56.847Z",
  });
  expect(regulated[0].note).toContain("Campfires in designated locations. Appliances using bottled fuels allowed.");
});

test("ODF refuses changed area geometry, unknown codes, partial results and stale positive rules", () => {
  const metadata = JSON.parse(odfLayer);
  const data = JSON.parse(odfAreas);
  const first = data.features[0].attributes;
  expect(() => parseOdfPublicUse(metadata, { ...data, exceededTransferLimit: true }, captured)).toThrow("Incomplete ArcGIS");
  expect(() => parseOdfPublicUse(metadata, { ...data, features: data.features.slice(1) }, captured)).toThrow("inventory");
  first.debrisburning = 1;
  expect(() => parseOdfPublicUse(metadata, data, new Date("2026-12-21T08:00:00Z"))).toThrow("stale layer");
  first.debrisburning = 9;
  expect(() => parseOdfPublicUse(metadata, data, captured)).toThrow("Invalid option");
  first.debrisburning = 1;
  first.SHAPE__Area += 1;
  expect(() => parseOdfPublicUse(metadata, data, captured)).toThrow("changed regulated-use area");
});

const jobs = [
  [orLrapaOutdoor, () => parseLrapaOutdoor(outdoor, captured)],
  [orLrapaHeating, () => parseLrapaHeating(heating, captured)],
  [orWillametteBackyard, () => parseWillametteBackyard(valley, captured)],
  [orOdfPublicUse, () => parseOdfPublicUse(JSON.parse(odfLayer), JSON.parse(odfAreas), captured)],
];

test("Oregon's county projection uses the publisher's Pacific dates", async () => {
  const inputs = await Promise.all(jobs.map(async ([source, parse]) => ({
    source, rows: await parse(), checked: captured.toISOString(), staleMs: source.staleMs,
  })));
  const before = mergeSources(null, inputs, captured).snapshot;
  expect(before.counties["41039"]).toMatchObject({ status: "unknown" });
  expect(Object.values(before.counties).filter(({ status }) => status === "restricted")).toHaveLength(8);
  const after = mergeSources(before, inputs, midnight).snapshot;
  expect(after.counties["41039"]).toMatchObject({ status: "restricted" });
  expect(after.counties["41039"].orders).toHaveLength(7);
  const counts = { restricted: 0, unknown: 0, ban: 0, none: 0 };
  for (const { fips } of countiesInState("OR")) counts[after.counties[fips]?.status ?? "unknown"]++;
  expect(counts).toEqual({ restricted: 1, unknown: 35, ban: 0, none: 0 });
});

for (const [source, parse] of jobs) {
  test(`${source.id} parses its real fixture in under 5 ms p95`, async () => {
    for (let i = 0; i < 20; i++) await parse();
    const samples: number[] = [];
    for (let i = 0; i < 120; i++) {
      const start = performance.now();
      await parse();
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    expect(samples[113]).toBeLessThan(5);
  });
}
