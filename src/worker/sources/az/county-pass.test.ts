// @ts-expect-error Bun provides the test module at runtime.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { extractHtml } from "../lib/html";
import { mergeSources, type SourceInput } from "../merge";
import { SOURCES } from "../registry";
import { azGrandCanyonFire, parseGrandCanyonFire } from "./grand-canyon";
import { azLocalBurnRules } from "./local-rules";
import { azFlagstaffFireStages, azYavapaiFireZones } from "./local-stages";
import { azMaricopaAirQuality } from "./maricopa-air-quality";
import { azMohaveOrders, parseMohaveOrders } from "./mohave-orders";
import { azNavajoNationStage } from "./navajo-nation";
import { azSaintDavidPermitStatus } from "./saint-david";

const passDate = new Date("2026-11-24T19:00:00Z");
const maricopaDay = new Date("2026-11-25T18:00:00Z");
const captured = new Date("2026-11-26T12:39:00Z");
const bytes = (name: string) => readFileSync(new URL(`./fixtures/county/${name}`, import.meta.url));
const text = (name: string) => bytes(name).toString("utf8");
const response = (name: string) => new Response(Uint8Array.from(bytes(name)).buffer);
const maricopa = text("maricopa-air-quality.html");
const saintDavid = text("saint-david-permit-status.json");
const flagstaff = text("flagstaff-outdoor-fire-permits.html");
const yavapai = text("yavapai-fire-zones.html");
const navajoNation = text("navajo-nation-orders.html");
const mohaveIndex = text("mohave-order-index.html");
const mohaveLift = text("mohave-order-lifted.html");

const bulletins = [
  { ...azFlagstaffFireStages, fixture: "flagstaff-outdoor-fire-permits.html", now: captured },
  { ...azYavapaiFireZones, fixture: "yavapai-fire-zones.html", now: captured },
  { ...azMaricopaAirQuality, fixture: "maricopa-air-quality.html", now: maricopaDay },
  { ...azNavajoNationStage, fixture: "navajo-nation-orders.html", now: captured },
  { ...azSaintDavidPermitStatus, fixture: "saint-david-permit-status.json", now: captured },
];

function ruleById(id: string) {
  const entry = azLocalBurnRules.find(({ source }) => source.id === id);
  if (!entry) throw new Error(`Missing Arizona source ${id}`);
  return entry;
}

test("Arizona county sources publish only scoped evidence and cover the current county map", async () => {
  const existing = readFileSync(new URL("./fixtures/grand-canyon-fire-2026-11-24.html", import.meta.url), "utf8");
  const baseline: SourceInput = {
    source: azGrandCanyonFire,
    rows: parseGrandCanyonFire(await extractHtml(existing), passDate),
    checked: passDate.toISOString(),
  };

  const { snapshot: before } = mergeSources(null, [baseline], passDate);
  expect(Object.values(before.counties).filter(({ status }) => status === "restricted")).toHaveLength(1);
  const localInputs = await Promise.all(azLocalBurnRules.map(async ({ source, parse, fixture }): Promise<SourceInput> => {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ mode: "positive-only", coverage: "restrictions", recurring: true, scope: "part" });
    const rows = await parse(response(fixture), passDate);
    if (source.id === "az-maricopa-regional-parks-season") expect(rows).toEqual([]);
    else expect(rows.map(({ fips }) => fips)).toEqual(source.reportingFips!);
    for (const row of rows) {
      expect(row).toMatchObject({ status: "restricted", standing: true, scope: "part", officialUrl: source.officialUrl });
      expect(row.scopeNote).toBeTruthy();
    }
    return { source, rows, checked: passDate.toISOString() };
  }));
  const tribal = await azNavajoNationStage.parse(response("navajo-nation-orders.html"), passDate);
  const { snapshot } = mergeSources(null, [baseline, ...localInputs, {
    source: azNavajoNationStage.source, rows: tribal, checked: passDate.toISOString(),
  }], passDate);
  const counties = countiesInState("AZ");
  expect(counties).toHaveLength(15);
  expect(counties.filter(({ fips }) => before.counties[fips]?.status !== "restricted" &&
    snapshot.counties[fips]?.status === "restricted")).toHaveLength(14);
  for (const { fips } of counties) {
    expect(snapshot.counties[fips]).toMatchObject({ status: "restricted", scope: "part" });
    expect(snapshot.counties[fips].countywide).toBeUndefined();
  }

  for (const { source, parse, fixture, now } of bulletins) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ mode: "positive-only", scope: "part" });
    const rows = await parse(response(fixture), now);
    expect(rows.length).toBe(source.id === azNavajoNationStage.source.id ? 3 : 0);
  }
});

test("Duncan's verified page supports both the year-round permit and the local summer suspension", async () => {
  const { parse, fixture } = ruleById("az-duncan-valley-permits");
  const at = new Date("2026-07-01T07:00:00Z");
  expect(await parse(response(fixture), passDate)).toEqual([expect.objectContaining({
    fips: "04011", label: "Permit required for covered open burning", since: null, standing: true,
  })]);
  expect(await parse(response(fixture), at)).toEqual([
    expect.objectContaining({ fips: "04011", label: "Permit required for covered open burning" }),
    expect.objectContaining({ fips: "04011", label: "Summer open-burn permit suspension", since: "2026-06-01", expires: "2026-08-31" }),
  ]);
  const changed = text(fixture).replace("JUNE, JULY, OR AUGUST", "JULY OR AUGUST");
  await expect(parse(new Response(changed), at)).rejects.toThrow("reviewed local burning rule changed");
  const parks = ruleById("az-maricopa-regional-parks-season");
  expect(await parks.parse(response(parks.fixture), at)).toEqual([expect.objectContaining({
    fips: "04013", since: "2026-05-01", expires: "2026-09-30", scope: "part",
  })]);
});

test("Eagar requires its reviewed form section before publishing the town's permit rule", async () => {
  const { parse, fixture } = ruleById("az-eagar-open-burn-permits");
  expect(await parse(response(fixture), passDate)).toEqual([expect.objectContaining({
    fips: "04001", scopeNote: "Town of Eagar", status: "restricted", standing: true, scope: "part",
  })]);
  const payload = text(fixture);
  await expect(parse(new Response(payload.replace("Burn Permit Rules", "Other permit")), passDate)).rejects.toThrow("form section");
  await expect(parse(new Response(payload.replace("requires all individuals", "no longer requires any individuals")), passDate))
    .rejects.toThrow("reviewed local burning rule changed");
});

test("Maricopa's widget accepts a same-day wood decision and ignores its forecast panel", async () => {
  const permit = (html: string, now = maricopaDay) => azMaricopaAirQuality.parse(new Response(html), now);
  const closed = "Wood burning in residential fireplaces, chimineas, outdoor fire pits, and similar outdoor fires is prohibited in Maricopa County.";
  expect(await permit(maricopa)).toEqual([]);
  const restricted = maricopa.replace("Wood Burning OK", "Wood Burning Restricted")
    .replace("There are no restrictions in effect at this time.", closed);
  expect(await permit(restricted)).toEqual([expect.objectContaining({
    fips: "04013", status: "restricted", scope: "part", sourceUpdated: "2026-11-25T16:29:00.000Z",
    validUntil: "2026-11-26T07:00:00.000Z",
  })]);
  await expect(permit(restricted, new Date("2026-11-26T07:00:00Z"))).rejects.toThrow("current local day");
  await expect(permit(restricted, new Date("2026-11-25T16:28:59Z"))).rejects.toThrow("current local day");
  await expect(permit(restricted.replace("Wood Burning Restricted", "Wood Burning OK"))).rejects.toThrow("Ambiguous");
  await expect(permit(maricopa.replace("Wood Burning OK", "Check the weather"))).rejects.toThrow("unknown");
});

test("Saint David uses the district's timestamp and explicit permit status", async () => {
  const read = (body: string, now = captured) => azSaintDavidPermitStatus.parse(new Response(body), now);
  const blocked = saintDavid.replace('"allowed"', '"blocked"').replace('"BURNING ALLOWED"', '"BURNING NOT ALLOWED"')
    .replace("No monitored restrictions detected. A valid permit and compliance with all permit conditions are still required.",
      "Burning restricted manually by the district.");
  expect(await read(saintDavid)).toEqual([]);
  expect(await read(blocked)).toEqual([expect.objectContaining({
    fips: "04003", status: "restricted", scope: "part", sourceUpdated: "2026-11-26T12:33:00.000Z",
    validUntil: "2026-11-26T14:33:00.000Z",
  })]);
  await expect(read(blocked, new Date("2026-11-26T14:33:00Z"))).rejects.toThrow("recent verification");
  await expect(read(blocked.replace('"blocked"', '"unknown"'))).rejects.toThrow("Unconfirmed");
  await expect(read(blocked.replace('"BURNING NOT ALLOWED"', '"BURNING ALLOWED"'))).rejects.toThrow("Unconfirmed");
});

test("Flagstaff reads the current city stage and ignores the explanatory stage table", async () => {
  const read = (body: string) => azFlagstaffFireStages.parse(new Response(body), captured);
  expect(await read(flagstaff)).toEqual([]);
  expect(await read(flagstaff.replace("currently in <strong>Stage 0", "currently in <strong>Stage 2"))).toEqual([
    expect.objectContaining({ fips: "04005", status: "restricted", scope: "part", scopeNote: "City of Flagstaff", label: "Stage 2 fire restrictions" }),
  ]);
  await expect(read(flagstaff.replace("currently in <strong>Stage 0", "currently in <strong>Stage 9"))).rejects.toThrow("Unrecognized");
});

test("Yavapai validates its five county zones without promoting partner stages", async () => {
  const read = (body: string, now = captured) => azYavapaiFireZones.parse(new Response(body), now);
  expect(await read(yavapai)).toEqual([]);
  expect(await read(yavapai.replace("Updated July 22, 2026", "Updated November 25, 2026")
    .replace("<span>None</span>", "<span>Stage 1</span>"))).toEqual([expect.objectContaining({
    fips: "04025", status: "restricted", scope: "part", sourceUpdated: "2026-11-25",
    scopeNote: "Unincorporated Yavapai County, Zone 1, within county jurisdiction",
  })]);
  await expect(read(yavapai.replace("<span>None</span>", "<span>Stage 1</span>"))).rejects.toThrow("newer update");
  await expect(read(yavapai.replace("<span>Zone 2</span>", "<span>Zone 1</span>"))).rejects.toThrow("Unexpected status row");
  await expect(read(yavapai.replace("Yavapai County (unincorporated areas)", "Different agency"))).rejects.toThrow("changed");
});

test("Navajo Nation's signed Stage 1 applies only to tribal lands and yields to a newer order", async () => {
  const read = (body: string) => azNavajoNationStage.parse(new Response(body), captured);
  const rows = await read(navajoNation);
  expect(rows.map(({ fips }) => fips)).toEqual(["04001", "04005", "04017"]);
  for (const row of rows) expect(row).toMatchObject({
    sourceUpdated: "2026-07-24", status: "restricted", scope: "part", scopeNote: expect.stringContaining("Navajo Nation lands"),
    officialUrl: "https://opvp.navajo-nsn.gov/executive-order-no-05-2026/",
  });
  expect(await read(navajoNation.replace('Jul 14, 2026</span>', 'Aug 14, 2026</span>'))).toEqual([]);
  await expect(read(navajoNation.replace('Jul 14, 2026</span>', 'Jul 24, 2026</span>'))).rejects.toThrow("Ambiguous");
  await expect(read(navajoNation.replaceAll('class="published"', 'class="unrecognized"'))).rejects.toThrow("changed");
});

test("Mohave tracks its own notice, partial lift, and final rescission without a countywide all-clear", async () => {
  expect(SOURCES).toContain(azMohaveOrders);
  const requested: string[] = [];
  expect(await parseMohaveOrders(mohaveIndex, captured, async (url) => {
    requested.push(url);
    return mohaveLift;
  })).toEqual([]);
  expect(requested).toEqual(["https://www.mohave.gov/news-notices/posts/county-outdoor-fire-and-fireworks-prohibition-lifted-10626/"]);

  const noFullLift = mohaveIndex.replaceAll(">County Outdoor Fire and Fireworks Prohibition Lifted</a>", ">Other announcement</a>");
  const partial = text("mohave-order-partial-lift.html");
  const september = new Date("2026-09-11T15:00Z");
  expect(await parseMohaveOrders(noFullLift, september, async () => partial)).toEqual([expect.objectContaining({
    fips: "04015", status: "ban", scope: "part", validFrom: "2026-09-09T15:00:00.000Z",
    scopeNote: "Unincorporated Hualapai Mountain Range above 4,200 feet",
  })]);
  const early = noFullLift.replace(">County Outdoor Fire and Fireworks Prohibition Partially Lifted</a>", ">Other announcement</a>");
  const issued = text("mohave-order-issued.html");
  expect(await parseMohaveOrders(early, new Date("2026-05-27T15:00Z"), async () => issued)).toEqual([expect.objectContaining({
    fips: "04015", status: "ban", scope: "part", since: "2026-05-21",
    scopeNote: "All four fire zones in unincorporated Mohave County",
  })]);
  await expect(parseMohaveOrders(mohaveIndex, captured, async () => issued)).rejects.toThrow("headline mismatch");
  await expect(parseMohaveOrders(mohaveIndex, captured, async () => mohaveLift.replace("October 1, 2026", "October 1, 2027")))
    .rejects.toThrow("explicit determination");
});

test("AZ county fixtures parse below 5 ms p95 thread CPU per source", async () => {
  const jobs = [
    ...[...bulletins, ...azLocalBurnRules.map((entry) => ({ ...entry, now: captured }))].map(({ source, parse, fixture, now }) => {
      const body = Uint8Array.from(bytes(fixture)).buffer;
      return { id: source.id, run: () => parse(new Response(body), now) };
    }),
    { id: azMohaveOrders.id, run: () => parseMohaveOrders(mohaveIndex, captured, async () => mohaveLift) },
  ];
  let slowest = { id: "", p95: 0 };
  for (const { id, run } of jobs) {
    for (let i = 0; i < 6; i++) await run();
    const samples: number[] = [];
    for (let i = 0; i < 32; i++) {
      const start = process.threadCpuUsage();
      await run();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1_000);
    }
    const p95 = samples.sort((a, b) => a - b)[30];
    if (p95 > slowest.p95) slowest = { id, p95 };
    expect(p95).toBeLessThan(5);
  }
  console.log(`AZ county fixture p95 max ${slowest.p95.toFixed(3)} ms thread CPU (${slowest.id})`);
});
