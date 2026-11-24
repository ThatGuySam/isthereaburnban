// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { mergeSources } from "../merge";
import { parseUtahOrders, utFfslFireOrders } from "./orders";
import { parseUtahSeasonal, utClosedFireSeason } from "./seasonal";

const fixture = (name) => Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).text();
const [layer, orders, code] = await Promise.all([
  fixture("layer-2026-11-24.json"), fixture("orders-2026-11-24.json"), fixture("code-index-2026-11-24.html"),
]);
const captured = new Date("2026-11-24T09:10:16Z");
const metadata = JSON.parse(layer);
const data = JSON.parse(orders);
const summit = data.features.find(({ attributes }) => attributes.OrderNum === "NECLO2661").attributes;
const query = (...attributes) => ({ features: attributes.map((value) => ({ attributes: value })) });

test("the public Utah register reports seven counties with scoped open-fire orders", () => {
  const rows = parseUtahOrders(metadata, data, captured);
  expect(rows.map(({ fips }) => fips).sort()).toEqual(["49007", "49013", "49019", "49037", "49043", "49047", "49051"]);
  expect(rows.every(({ status, scope }) => status === "restricted" && scope === "part")).toBe(true);
  const { snapshot } = mergeSources(null, [{ source: utFfslFireOrders, rows, checked: captured.toISOString() }], captured);
  expect(snapshot.counties["49043"]).toMatchObject({
    status: "restricted", since: "2026-09-04", expires: null,
    sourceUpdated: "2026-10-01T21:10:54.250Z",
    orders: [{
      status: "restricted", scope: "part", scopeNote: expect.stringContaining("Park City Fire District and North Summit Fire District"),
      officialUrl: summit.Link,
    }],
  });
  expect(snapshot.counties["49037"].orders[0].sourceName).toBe("Navajo Nation");
  expect(snapshot.counties["49051"].orders[0].scopeNote).toContain("Uintah and Ouray Indian Reservation");
  expect(snapshot.counties["49029"]).toBeUndefined(); // Morgan's State Forester order was rescinded.
});

test("Utah ignores unrecognized codes, future starts and inactive or unconfirmed orders", () => {
  const changes = [
    { Status: "Unknown" }, { Status: "Rescinded" }, { Status: "Superseded" },
    { Status: "Standing" }, { Status: "Recurring" }, { Status: "Future", EffectiveDate: "2026-11-24" },
    { RestrictionType: "Closure" }, { Agency: "3-BLM" }, { Campfire_etc: 0 },
    { EffectiveDate: "2026-11-25" }, { EffectiveDate: "2026-02-30" },
    { RescindedDate: "2026-11-24" }, { RescindedDate: "bad date" }, { Status: "Future_Rescind" },
    { Link_Rescind: summit.Link }, { Link: "javascript:alert(1)" },
    { AreaDescription: "Near Summit County, see the map." },
  ];
  for (const change of changes) {
    expect(parseUtahOrders(metadata, query({ ...summit, ...change }), captured)).toEqual([]);
  }
  const navajo = data.features.find(({ attributes }) => attributes.Agency === "5-Navajo" && attributes.Status === "Active").attributes;
  expect(parseUtahOrders(metadata, query({ ...navajo, Shape__Area: navajo.Shape__Area + 1 }), captured)).toEqual([]);
});

test("the end date bounds Utah rows even while ArcGIS still marks them active", () => {
  const source = query({ ...summit, Status: "Future_Rescind", RescindedDate: "2026-11-25", Link_Rescind: summit.Link });
  expect(parseUtahOrders(metadata, source, new Date("2026-11-25T06:59:59Z"))[0]).toMatchObject({
    expires: "2026-11-25", validUntil: "2026-11-25T07:00:00.000Z",
  });
  expect(parseUtahOrders(metadata, source, new Date("2026-11-25T07:00:00Z"))).toEqual([]);
});

test("an unchanged scheduled order can take effect after its published start date", () => {
  const source = query({ ...summit, Status: "Future", EffectiveDate: "2026-11-24" });
  expect(parseUtahOrders(metadata, source, new Date("2026-11-25T06:59:59Z"))).toEqual([]);
  expect(parseUtahOrders(metadata, source, new Date("2026-11-25T07:00:00Z"))).toHaveLength(1);
});

test("verified statewide and multi-county wording still produces part-county rows", () => {
  const statewide = query({ ...summit, AreaDescription: "All state lands –AND– all unincorporated private lands within the state of Utah." });
  const rows = parseUtahOrders(metadata, statewide, captured);
  expect(rows).toHaveLength(29);
  expect(rows.every(({ scope }) => scope === "part")).toBe(true);
  const area = "All state, private, and unincorporated lands within Box Elder, Rich, Weber, and Cache counties";
  expect(parseUtahOrders(metadata, query({ ...summit, AreaDescription: area }), captured)
    .map(({ fips }) => fips)).toEqual(["49003", "49033", "49057", "49005"]);
});

test("Utah rejects aged, changed and truncated data and treats an empty result as unknown", () => {
  expect(() => parseUtahOrders(metadata, data, new Date("2027-02-01T09:10:16Z"))).toThrow("stale");
  expect(() => parseUtahOrders({ ...metadata, name: "Other layer" }, data, captured)).toThrow();
  expect(() => parseUtahOrders(metadata, { features: [], exceededTransferLimit: true }, captured)).toThrow("Incomplete");
  expect(() => parseUtahOrders(metadata, query(summit, summit), captured)).toThrow("duplicate");
  expect(parseUtahOrders(metadata, query(), captured)).toEqual([]);
});

test("the statutory season uses Mountain dates and is registered as recurring", () => {
  expect(utClosedFireSeason.recurring).toBe(true);
  expect(parseUtahSeasonal(code, captured)).toEqual([]);
  expect(parseUtahSeasonal(code, new Date("2026-06-01T05:59:59Z"))).toEqual([]);
  const rows = parseUtahSeasonal(code, new Date("2026-06-01T06:00:00Z"));
  expect(rows).toHaveLength(29);
  expect(rows[0]).toMatchObject({ status: "restricted", scope: "part", validFrom: "2026-06-01T06:00:00.000Z", validUntil: "2026-06-02T06:00:00.000Z" });
  expect(parseUtahSeasonal(code, new Date("2026-11-01T05:59:59Z"))).toHaveLength(29);
  expect(parseUtahSeasonal(code, new Date("2026-11-01T06:00:00Z"))).toEqual([]);
  expect(() => parseUtahSeasonal(code.replace("var versionDefault", "var oldEdition"), captured)).toThrow("current edition");
});

test("Utah fixture decoding and parsing stay below 5 ms at p95", () => {
  const parse = () => parseUtahOrders(JSON.parse(layer), JSON.parse(orders), captured);
  for (let i = 0; i < 20; i++) parse();
  const times = Array.from({ length: 60 }, () => {
    const start = performance.now();
    parse();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  expect(times[Math.ceil(times.length * 0.95) - 1]).toBeLessThan(5);
});
