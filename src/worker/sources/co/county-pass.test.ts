// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { countiesInState } from "../../counties";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { coLocalBurningRules } from "./local-rules";
import {
  coCheyenneFire, coEagleFireMap, coHtmlFireStatus, coHuerfanoFire, coJeffersonFire, coLocalFireSources,
  parseCheyenneFire, parseEagleFireMap, parseHuerfanoFire, parseJeffersonFire,
} from "./local-status";

const fixture = (name) => readFileSync(new URL(`./fixtures/county-pass/${name}`, import.meta.url));
const text = (name) => fixture(name).toString("utf8");
const nov25 = new Date("2026-11-25T21:00:00Z");
const counties = countiesInState("CO");
const fresher = (source, rows, now = nov25) => ({ source, rows, checked: now.toISOString() });
const orderHeaders = JSON.parse(text("cheyenne-order-headers.json"));
const readOrder = async () => new Response(null, { headers: orderHeaders });
const cheyennePage = text("cheyenne-notice.html");
const eagleMap = text("eagle-fire-map.kml");
const jefferson = JSON.parse(text("jefferson-api.json"));
const huerfano = JSON.parse(text("huerfano-notices.json"));

const statusFixtures = coHtmlFireStatus.map(({ source, parse }) => {
  const html = text(`${source.id.slice(3)}.html`);
  return { source, parse: () => parse(html, nov25) };
});
const calendarFixtures = coLocalBurningRules.map(({ source, parse, fixture: name }) => {
  const bytes = name.endsWith(".gz") ? gunzipSync(fixture(name)) : fixture(name);
  return {
    source,
    parse: () => parse(new Response(bytes, { headers: { "content-type": name.endsWith(".pdf") ? "application/pdf" : "text/html" } }), nov25),
  };
});
const currentFixtures = [
  ...statusFixtures,
  { source: coCheyenneFire, parse: () => parseCheyenneFire(cheyennePage, nov25, readOrder) },
  { source: coEagleFireMap, parse: () => parseEagleFireMap(eagleMap, nov25) },
  { source: coJeffersonFire, parse: () => parseJeffersonFire(jefferson, nov25) },
  { source: coHuerfanoFire, parse: () => parseHuerfanoFire(huerfano, nov25) },
];

test("published Colorado local statuses preserve the issuing jurisdiction", async () => {
  const active = new Map([
    ["co-cheyenne-notice", ["ban", "Unincorporated Cheyenne County"]],
    ["co-elbert-current", ["restricted", "Unincorporated Elbert County"]],
    ["co-fremont-current", ["restricted", "Unincorporated Fremont County"]],
    ["co-grand-current", ["restricted", "Grand Fire Protection District No. 1 in Grand County"]],
    ["co-hinsdale-current", ["restricted", "Upper Piedra region of southern Hinsdale County"]],
  ]);
  for (const { source, parse } of currentFixtures) {
    expect(SOURCES).toContain(source);
    expect(source.mode).toBe("positive-only");
    const rows = await parse();
    const expected = active.get(source.id);
    if (expected) {
      expect(rows).toEqual([expect.objectContaining({ status: expected[0], scopeNote: expected[1], scope: "part", officialUrl: source.officialUrl })]);
      expect(source.reportingFips).toEqual([rows[0].fips]);
    } else {
      expect(rows).toEqual([]);
    }
  }
});

test("Fremont's daily decision expires at Mountain midnight and rejects an old edition", async () => {
  const { source, parse } = coHtmlFireStatus.find(({ source }) => source.id === "co-fremont-current");
  const html = text("fremont-current.html");
  const [row] = await parse(html, nov25);
  expect(row).toMatchObject({ sourceUpdated: "2026-11-25", validUntil: "2026-11-26T07:00:00.000Z" });
  const expired = new Date(row.validUntil);
  expect(mergeSources(null, [fresher(source, [row])], expired).snapshot.counties[row.fips]).toBeUndefined();
  await expect(parse(html, expired)).rejects.toThrow("not current");
  await expect(parse(html.replace("under Stage 1", "under Stage 7"), nov25)).rejects.toThrow("Unrecognized status");
});

test("Elbert declines a future order and Grand respects the published effective minute", async () => {
  const elbert = coHtmlFireStatus.find(({ source }) => source.id === "co-elbert-current");
  const html = text("elbert-current.html");
  await expect(elbert.parse(html.replace("September 28, 2026", "December 28, 2026"), nov25)).rejects.toThrow("not current");
  const grand = coHtmlFireStatus.find(({ source }) => source.id === "co-grand-current");
  const day = new Date("2026-09-09T06:00:00Z");
  const [row] = await grand.parse(text("grand-current.html"), day);
  expect(row.validFrom).toBe("2026-09-09T06:01:00.000Z");
  expect(mergeSources(null, [fresher(grand.source, [row], day)], day).snapshot.counties[row.fips].status).toBe("unknown");
});

test("Cheyenne needs the currently indexed order and its reviewed PDF version", async () => {
  const noOrder = async () => { throw new Error("Do not read an unlisted order"); };
  await expect(parseCheyenneFire(cheyennePage.replace("Open Burn Ban", "Open Burn Ban Rescinded"), nov25, noOrder)).resolves.toEqual([]);
  await expect(parseCheyenneFire(cheyennePage.replace("3.31.26", "11.25.26"), nov25, noOrder)).rejects.toThrow("newly published");
  await expect(parseCheyenneFire(cheyennePage, nov25, async () =>
    new Response(null, { headers: { ...orderHeaders, etag: '"different-edition"' } }))).rejects.toThrow("newly published");
});

test("Eagle KML requires agreement across the two unincorporated placemarks", () => {
  const staged = eagleMap.replaceAll("<color>ff589d0f</color>", "<color>ff00b4f4</color>");
  expect(parseEagleFireMap(staged, nov25)).toEqual([expect.objectContaining({ fips: "08037", status: "restricted", scope: "part" })]);
  const split = eagleMap.replace(/(<Style id="line-0F9D58-1770-normal">\s*<LineStyle>\s*<color>)ff589d0f/, "$1ff00b4f4");
  expect(() => parseEagleFireMap(split, nov25)).toThrow("unknown or split");
  expect(() => parseEagleFireMap(eagleMap.replace("Unincorporated (2) Eagle County", "Vail"), nov25)).toThrow("Unresolved KML style");
});

test("Jefferson distinguishes a sheriff order from an automatic Red Flag restriction", () => {
  expect(() => parseJeffersonFire(jefferson, new Date("2026-11-24T21:00:00Z"))).toThrow("stale");
  const active = { ...jefferson, restriction: { stage: "stage2", label: "Stage 2 fire restrictions",
    source: "Jefferson County Sheriff's order", stage1FromRedFlag: false, until: null } };
  expect(parseJeffersonFire(active, nov25)).toEqual([expect.objectContaining({ status: "ban", scope: "part" })]);
  expect(parseJeffersonFire({ ...active, restriction: { ...active.restriction, stage: "stage1",
    source: "Automatic during NWS Red Flag Warning", stage1FromRedFlag: true, until: "2026-11-26T07:00:00Z" } }, nov25)).toEqual([]);
});

test("Huerfano's later board rescission supersedes its Stage 1 and Stage 2 notices", () => {
  const [lift, ...earlier] = huerfano;
  const [active] = parseHuerfanoFire(earlier, new Date("2026-09-25T21:00:00Z"));
  expect(active).toMatchObject({ status: "restricted", since: "2026-08-25", officialUrl: earlier[0].link });
  expect(parseHuerfanoFire(huerfano, nov25)).toEqual([]);
  const changed = { ...lift, title: { rendered: "Huerfano County Updates Fire Restrictions" } };
  expect(() => parseHuerfanoFire([changed, ...earlier], nov25)).toThrow("review the latest");
});

test("reviewed standing rules report the covered activity, and a changed rule fails closed", async () => {
  for (const { source, parse } of calendarFixtures) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ mode: "positive-only", coverage: "restrictions", recurring: true });
    const rows = await parse();
    expect(rows.map(({ fips }) => fips)).toEqual(source.reportingFips);
    for (const row of rows) {
      expect(row).toMatchObject({ standing: true, status: "restricted", scope: source.scope, officialUrl: source.officialUrl,
        validFrom: "2026-11-25T07:00:00.000Z", validUntil: "2026-11-27T07:00:00.000Z" });
    }
  }
  const rule = coLocalBurningRules.find(({ source }) => source.id === "co-kit-carson-controlled-burn");
  const changed = text(rule.fixture).replace("All burns must be approved", "Some burns may be approved");
  await expect(rule.parse(new Response(changed), nov25)).rejects.toThrow("rule changed");
});

test("county-pass fixture replay moves restricted areas only and creates no countywide ban or all-clear", async () => {
  const inputs = await Promise.all([...currentFixtures, ...calendarFixtures].map(async ({ source, parse }) => fresher(source, await parse())));
  const { counties: projected } = mergeSources(null, inputs, nov25).snapshot;
  const counts = { ban: 0, none: 0, restricted: 0, unknown: 0 };
  for (const { fips } of counties) counts[projected[fips]?.status ?? "unknown"]++;
  expect(counts).toEqual({ ban: 0, none: 0, restricted: 40, unknown: 24 });
  expect(projected["08017"]).toMatchObject({ status: "restricted", scopedBan: true, orders: [{ scope: "part", status: "ban" }] });
  expect(projected["08019"]).toMatchObject({ status: "restricted", scope: "part", standing: true });
  expect(projected["08081"]).toBeUndefined();
  expect(coLocalFireSources).toHaveLength(currentFixtures.length);
});

test("Colorado county fixture parsing stays below 5 ms p95", async () => {
  let slowest = { name: "", ms: 0 };
  for (const { source, parse } of [...currentFixtures, ...calendarFixtures]) {
    for (let rep = 0; rep < 10; rep++) await parse();
    const samples = [];
    for (let rep = 0; rep < 40; rep++) {
      const started = process.threadCpuUsage();
      await parse();
      const { user, system } = process.threadCpuUsage(started);
      samples.push((user + system) / 1_000);
    }
    const p95 = samples.sort((a, b) => a - b)[37];
    if (p95 > slowest.ms) slowest = { name: source.id, ms: p95 };
  }
  console.log(`CO county fixture parse thread CPU p95 max ${slowest.ms.toFixed(3)} ms (${slowest.name})`);
  expect(slowest.ms).toBeLessThan(5);
});
