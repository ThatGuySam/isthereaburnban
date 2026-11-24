// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { mtDeqFall, parseDeqFall } from "./deq-fall";
import { parseDnrcRestrictions } from "./dnrc";
import { parseGallatin } from "./gallatin";
import { mtMissoulaSeasons, parseMissoulaSeasons } from "./missoula";

const read = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const deq = read("deq-fall-2026-11-24.json");
const dnrcLayer = read("dnrc-layer-2026-11-24.json");
const dnrcOrders = read("dnrc-orders-2026-11-24.json");
const gallatin = read("gallatin-2026-11-24.html");
const missoula = read("missoula-2026-11-24.html");
const now = new Date("2026-11-24T09:25:38Z");
const gallatinDay = new Date("2026-11-20T19:00:00Z");

test("Montana DEQ maps the real Tuesday decisions to 16 counties with local-day bounds", () => {
  const rows = parseDeqFall(JSON.parse(deq), now);
  expect(rows.map((row) => row.fips).sort()).toEqual([
    "30001", "30007", "30023", "30031", "30039", "30043", "30047", "30049",
    "30053", "30057", "30061", "30067", "30077", "30081", "30089", "30093",
  ]);
  expect(rows.every((row) => row.status === "restricted" && row.scope === "part")).toBe(true);
  expect(rows.find((row) => row.fips === "30067")).toMatchObject({
    label: "Open burning restricted below 6,000 feet",
    scopeNote: "DEQ-regulated fall open burning south of I-90 in Park County",
    expires: "2026-11-24", since: null,
    validFrom: "2026-11-24T07:00:00.000Z", validUntil: "2026-11-25T07:00:00.000Z",
  });
  expect(rows.find((row) => row.fips === "30053").scopeNote).toContain("outside the Libby Impact Zone");
  expect(rows.find((row) => row.fips === "30049").label).toContain("4,500 feet");
  expect(() => parseDeqFall(JSON.parse(deq), new Date("2026-11-25T07:00:00Z"))).toThrow("no dated");
  expect(() => parseDeqFall(JSON.parse(deq), new Date("2026-11-24T06:59:59Z"))).toThrow("no dated");
  expect(parseDeqFall(JSON.parse(deq), new Date("2026-12-01T07:00:00Z"))).toEqual([]);
});

test("Montana DEQ ignores older weekdays, unmapped areas and uncertain codes without turning them into an all-clear", () => {
  const data = JSON.parse(deq);
  const county = (name) => data.features.find(({ attributes }) => attributes.area_name === name).attributes;
  county("Gallatin").restrictions = 0;
  county("Powell").restrictions = 100;
  county("Park").restrictions = 42;
  county("Lake").last_edited_date -= 7 * 86_400_000;
  county("Madison").last_edited_date = now.getTime() + 1;
  county("Jefferson").area_name = "Unmapped Area";
  const rows = parseDeqFall(data, now);
  expect(rows).toHaveLength(10);
  expect(rows.every((row) => row.status === "restricted")).toBe(true);
  expect(() => parseDeqFall({ ...data, exceededTransferLimit: true }, now)).toThrow("Incomplete");
  delete data.features[0].attributes.area_name;
  expect(() => parseDeqFall(data, now)).toThrow("area_name");
});

test("Montana DNRC's real active-only response is empty and an old register fails", () => {
  const metadata = JSON.parse(dnrcLayer);
  const data = JSON.parse(dnrcOrders);
  expect(parseDnrcRestrictions(metadata, data, now)).toEqual([]);
  expect(() => parseDnrcRestrictions(metadata, { ...data, exceededTransferLimit: true }, now)).toThrow("Incomplete");
  expect(() => parseDnrcRestrictions(metadata, data, new Date("2027-06-01T00:00Z"))).toThrow("stale");
});

test("Montana DNRC retains the exact land-manager scope and omits unsupported or stale stages", () => {
  const attrs = {
    OBJECTID: 1, NAME_1: "LEWIS & CLARK", AreaSubUnit: "Lewis & Clark Cty BLM - Butte Field Office",
    JurisdictionalUnitAgency: "BLM", JurisdictionalUnitName: "Butte Field Office", LandownerCategory: "BLM",
    RestrictionType: "Stage 1", Restriction_Document: "https://www.blm.gov/programs/fire/regional-info/montana/fire-restrictions",
    EditDate: Date.parse("2026-11-23T22:00Z"),
  };
  const features = [attrs,
    { ...attrs, OBJECTID: 2, RestrictionType: "No Restrictions and Closures" },
    { ...attrs, OBJECTID: 3, RestrictionType: "Unknown stage" },
    { ...attrs, OBJECTID: 4, NAME_1: "Water" },
    { ...attrs, OBJECTID: 5, EditDate: Date.parse("2025-11-23T22:00Z") },
    { ...attrs, OBJECTID: 6, AreaSubUnit: null },
  ].map((attributes) => ({ attributes }));
  const rows = parseDnrcRestrictions(JSON.parse(dnrcLayer), { features }, now);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "30049", status: "restricted", scope: "part", scopeNote: attrs.AreaSubUnit,
    label: "Stage 1 fire restriction", officialUrl: attrs.Restriction_Document,
    since: null, expires: null, sourceUpdated: "2026-11-23T22:00:00.000Z",
  });
});

test("Gallatin's real district table yields closures only within its freshness window", async () => {
  const rows = await parseGallatin(gallatin, gallatinDay);
  expect(rows.map((row) => row.scopeNote)).toEqual([
    "Clarkston Fire Service Area within Gallatin County, county open-burning permits",
    "Gallatin River Ranch Fire District within Gallatin County, county open-burning permits",
    "Sedan Fire District within Gallatin County, county open-burning permits",
  ]);
  expect(rows.every((row) => row.fips === "30031" && row.scope === "part" && row.status === "restricted")).toBe(true);
  await expect(parseGallatin(gallatin, now)).rejects.toThrow("stale");
  await expect(parseGallatin(gallatin.replace("Open Burning Status</strong>", "Unknown</strong>"), gallatinDay))
    .rejects.toThrow("expected one dated district status table");
});

test("Gallatin maps Big Sky across the county line and skips unknown district statuses", async () => {
  const input = gallatin.replace(/(Big Sky Fire Department[^<]*<\/td><td><mark[^>]*>)Open/, "$1Closed")
    .replace(/(Clarkston Fire Service Area[^<]*<\/td><td><mark[^>]*>)Closed/, "$1Conditional")
    .replace("Sedan Fire District", "Unmapped District");
  const rows = await parseGallatin(input, gallatinDay);
  const bigSky = rows.filter((row) => row.scopeNote.startsWith("Big Sky Fire Department"));
  expect(bigSky.map((row) => row.fips)).toEqual(["30031", "30057"]);
  expect(rows).toHaveLength(3);
});

test("Missoula's published activity-specific closures recur without clock-driven alerts", async () => {
  const parts = await extractHtml(missoula);
  expect(mtMissoulaSeasons.recurring).toBe(true);
  expect(parseMissoulaSeasons(parts, now).map((row) => row.label)).toEqual([
    "General outdoor burning season closed", "Essential agricultural burning season closed",
  ]);
  expect(parseMissoulaSeasons(parts, new Date("2026-11-01T05:59:59Z"))).toHaveLength(1);
  expect(parseMissoulaSeasons(parts, new Date("2026-11-01T06:00:00Z"))).toHaveLength(2);
  expect(parseMissoulaSeasons(parts, new Date("2028-02-29T19:00:00Z"))).toHaveLength(2);
  expect(parseMissoulaSeasons(parts, new Date("2028-03-01T07:00:00Z"))).toEqual([]);
  const changed = await extractHtml(missoula.replace("March 1 to Aug. 31", "March 1 to Sept. 30"));
  expect(() => parseMissoulaSeasons(changed, now)).toThrow("seasons changed");
});

test("Montana summaries retain scoped orders and leave other counties without a status", async () => {
  const { snapshot } = mergeSources(null, [
    { source: mtDeqFall, checked: now.toISOString(), rows: parseDeqFall(JSON.parse(deq), now) },
    { source: mtMissoulaSeasons, checked: now.toISOString(), rows: parseMissoulaSeasons(await extractHtml(missoula), now) },
  ], now);
  expect(Object.values(snapshot.counties)).toHaveLength(17);
  expect(Object.values(snapshot.counties).every((row) => row.status === "restricted")).toBe(true);
  expect(snapshot.counties["30063"].orders).toHaveLength(2);
  expect(snapshot.counties["30111"]).toBeUndefined();
});

for (const [name, run] of [
  ["DEQ ArcGIS", () => parseDeqFall(JSON.parse(deq), now)],
  ["DNRC ArcGIS", () => parseDnrcRestrictions(JSON.parse(dnrcLayer), JSON.parse(dnrcOrders), now)],
  ["Gallatin WordPress", () => parseGallatin(gallatin, gallatinDay)],
  ["Missoula calendar and HTML", async () => parseMissoulaSeasons(await extractHtml(missoula), now)],
]) {
  test(`Montana ${name} parses its real fixtures within the Worker CPU budget`, async () => {
    for (let i = 0; i < 10; i++) await run();
    const timings = [];
    for (let i = 0; i < 60; i++) {
      const start = performance.now();
      await run();
      timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    expect(timings[Math.ceil(timings.length * 0.95) - 1]).toBeLessThan(4);
  });
}
