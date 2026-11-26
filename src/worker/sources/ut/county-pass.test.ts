// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { countyDecision } from "../../county-decision";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { parseUtahAirActions, utDaqCountyAirActions } from "./air-status";
import { utCountyBulletins } from "./county-bulletins";
import { utLocalRules } from "./local-rules";
import { parseUtahOrders, utFfslFireOrders } from "./orders";
import { parseUtahPermitConditions, utDaqLocalOpenBurnPermits } from "./permit-status";

const captured = new Date("2026-11-26T11:35:00Z");
const fixtures = [
  ["ut-box-elder-burning-permit", "box-ordinance.pdf", "49003"],
  ["ut-cache-open-burning-permit", "cache.html", "49005"],
  ["ut-layton-open-burning", "layton.html", "49011"],
  ["ut-grand-open-burning-permit", "grand.html", "49019"],
  ["ut-iron-open-season-permit", "iron.html", "49021"],
  ["ut-juab-district-burning-permit", "eureka.pdf", "49023"],
  ["ut-kanab-burning-permit", "kanab.html", "49025"],
  ["ut-morgan-highlands-open-burning", "morgan-other.html", "49029"],
  ["ut-unified-residential-open-burning", "ufaperm.html", "49035"],
  ["ut-salt-lake-city-open-burning", "slc.html", "49035"],
  ["ut-fayette-residential-burning-season", "fayette.pdf", "49039", new Date("2026-10-20T11:30:00Z")],
  ["ut-stansbury-open-burning", "tooele.html", "49045"],
  ["ut-utah-county-open-burning-permit", "ucounty-intent.html", "49049"],
  ["ut-wayne-burn-permit-season", "wayne.html", "49055"],
];
const bulletins = [
  ["ut-washington-municipal-permits", "washington.html", "49053"],
  ["ut-weber-fire-district-open-burn", "weber.html", "49057"],
  ["ut-manila-current-fire-rules", "manila.html", "49009"],
];
const file = (name) => Bun.file(new URL(`./fixtures/county/${name}`, import.meta.url));
const forecast = await file("forecast.html").text();
const permitForm = await file("permit-form.html").text();
const permitConfig = await file("permit-config.js").text();

async function fixtureCheck(sources, [id, filename, fips, activeAt = captured]) {
  const { source, parse } = sources.find(({ source }) => source.id === id);
  const body = filename.endsWith(".pdf") ? await file(filename).arrayBuffer() : await file(filename).text();
  const check = (now = captured) => parse(new Response(body), now);
  return { source, check, fips, activeAt };
}

const rules = await Promise.all(fixtures.map((fixture) => fixtureCheck(utLocalRules, fixture)));
const notices = await Promise.all(bulletins.map((fixture) => fixtureCheck(utCountyBulletins, fixture)));

test("registered Utah local publishers emit verified and explicitly scoped restrictions", async () => {
  expect(rules).toHaveLength(utLocalRules.length);
  expect(notices).toHaveLength(utCountyBulletins.length);
  for (const { source, check, fips, activeAt } of [...rules, ...notices]) {
    expect(SOURCES.find(({ id }) => id === source.id)).toMatchObject(source);
    expect(source).toMatchObject({ mode: "positive-only", coverage: "restrictions" });
    expect(await check(activeAt)).toEqual([expect.objectContaining({
      fips, state: "UT", scope: source.scope, status: "restricted",
      scopeNote: expect.any(String), officialUrl: source.officialUrl,
    })]);
  }
  for (const { source, check, activeAt } of rules) {
    expect(source.recurring).toBe(true);
    expect((await check(activeAt))[0].standing).toBe(true);
  }
});

test("permit banners distinguish an explicit closure from an open permit form", async () => {
  const [washington, weber, manila] = bulletins.map(([id]) => utCountyBulletins.find(({ source }) => source.id === id));
  const w = await file("washington.html").text();
  const open = w.replace("There are no permits currently open", "Burn Permit is for today only (November 26, 2026)");
  expect(await washington.parse(new Response(open), captured)).toEqual([]);
  await expect(washington.parse(new Response(open.replace("November 26", "November 25")), captured)).rejects.toThrow("today's date");
  await expect(washington.parse(new Response(w.replace("There are no permits currently open", "Call for permit")), captured)).rejects.toThrow("Unrecognized");
  const district = await file("weber.html").text();
  expect(await weber.parse(new Response(district.replace(">CLOSED<", ">OPEN<")), captured)).toEqual([]);
  await expect(weber.parse(new Response(district.replace(">CLOSED<", ">CHECK BACK<")), captured)).rejects.toThrow("Unrecognized");
  const town = await file("manila.html").text();
  await expect(manila.parse(new Response(town.replace("effective August 21, 2026", "effective January 1, 2027")), captured)).rejects.toThrow("effective date");
});

test("DAQ action dates and categories keep voluntary advisories and other counties out of the restriction feed", async () => {
  expect(SOURCES.find(({ id }) => id === utDaqCountyAirActions.id)).toMatchObject(utDaqCountyAirActions);
  expect(utDaqCountyAirActions.reportingFips).toHaveLength(7);
  const rows = await parseUtahAirActions(forecast, captured);
  expect(rows.map(({ fips, expires }) => [fips, expires])).toEqual([["49035", "2026-11-26"], ["49035", "2026-11-27"]]);
  expect(rows[0]).toMatchObject({
    scope: "part", status: "restricted", sourceUpdated: "2026-11-25T22:36:31.000Z",
    validFrom: "2026-11-26T07:00:00.000Z", validUntil: "2026-11-27T07:00:00.000Z",
    officialUrl: "https://air.utah.gov/forecast.php?id=slc",
  });
  const policyCase = forecast
    .replace(/(>Davis<\/a>[\s\S]*?<div>Voluntary<\/div>[\s\S]*?<div>)Voluntary/, "$1Mandatory")
    .replace(/(>Washington<\/a>[\s\S]*?<div>Unrestricted<\/div>[\s\S]*?<div>)Unrestricted/, "$1Mandatory");
  const mandatory = await parseUtahAirActions(policyCase, captured);
  expect(mandatory.find(({ fips }) => fips === "49011")).toMatchObject({ label: "Mandatory solid-fuel heating restriction" });
  expect(mandatory.some(({ fips }) => fips === "49053")).toBe(false);
  await expect(parseUtahAirActions(forecast, new Date("2026-11-27T10:37:00Z"))).rejects.toThrow("stale");
  await expect(parseUtahAirActions(forecast.replace("Thu. Nov. 26", "Mon. Nov. 26"), captured)).rejects.toThrow("current date");
  await expect(parseUtahAirActions(forecast.replace("Voluntary</div>", "Undecided</div>"), captured)).rejects.toThrow("unrecognized action");
  await expect(parseUtahAirActions(forecast.replace(">Davis</a>", ">Salt Lake</a>"), captured)).rejects.toThrow("Unexpected status row");
});

test("the DAQ permit directory maps a dated, low clearing index to the selected jurisdiction only", async () => {
  expect(SOURCES.find(({ id }) => id === utDaqLocalOpenBurnPermits.id)).toMatchObject(utDaqLocalOpenBurnPermits);
  const parse = (html = permitForm, config = permitConfig, now = captured) => parseUtahPermitConditions(html, config, now);
  const rows = await parse();
  expect(rows.map(({ fips }) => fips)).toEqual(["49001", "49015", "49019", "49021", "49031", "49041", "49053"]);
  expect(rows[0]).toMatchObject({
    status: "restricted", scope: "part", scopeNote: expect.stringContaining("Unincorporated Beaver County"),
    note: expect.stringContaining("80 today, below the 250"), validUntil: "2026-11-27T07:00:00.000Z",
  });
  expect(rows[1].scopeNote).toContain("Castle Dale city limits");
  const improved = permitForm.replace("shed2: { today: 80,", "shed2: { today: 250,");
  expect((await parse(improved)).some(({ fips }) => fips === "49001" || fips === "49021")).toBe(false);
  const missingObservation = permitForm.replace("shed12: { today: 90,", "shed12: { today: -99,");
  expect((await parse(missingObservation)).some(({ fips }) => fips === "49015" || fips === "49019")).toBe(false);
  const disabled = permitConfig.replace(/('Menu': 'Castle Dale',[\s\S]*?'OpenBurnPermit': )'1'/, "$1'0'");
  expect((await parse(permitForm, disabled)).some(({ fips }) => fips === "49015")).toBe(false);
  const futureWindow = permitConfig.replace(/('Menu': 'Castle Dale',[\s\S]*?'ValidStart3': )'November 1'/, "$1'December 1'");
  expect((await parse(permitForm, futureWindow)).some(({ fips }) => fips === "49015")).toBe(false);
  await expect(parse(permitForm, permitConfig, new Date("2026-11-27T07:00:00Z"))).rejects.toThrow("clearing-index dates");
  await expect(parse(permitForm, permitConfig.replace("'Menu': 'Castle Dale'", "'Menu': 'Castle Valley'"))).rejects.toThrow("permit area missing");
  await expect(parse(permitForm, permitConfig.replace("'County': 'Emery'", "'County': 'Grand'"))).rejects.toThrow("geography");
});

test("changed standing rules fail verification and seasonal evidence follows local dates", async () => {
  const cache = utLocalRules.find(({ source }) => source.id === "ut-cache-open-burning-permit");
  const cachePage = await file("cache.html").text();
  await expect(cache.parse(new Response(cachePage.replace("must be obtained", "is optional")), captured)).rejects.toThrow("rule changed");
  const wayne = rules.find(({ fips }) => fips === "49055");
  expect((await wayne.check(new Date("2027-02-28T12:00:00Z")))[0].expires).toBe("2027-02-28");
  expect((await wayne.check(new Date("2028-02-29T12:00:00Z")))[0].expires).toBe("2028-02-29");
  expect(await wayne.check(new Date("2027-03-01T07:00:00Z"))).toEqual([]);
  const iron = rules.find(({ fips }) => fips === "49021");
  expect(await iron.check(new Date("2027-06-01T06:00:00Z"))).toEqual([]);
  const fayette = rules.find(({ fips }) => fips === "49039");
  expect(await fayette.check()).toEqual([]);
});

test("the merged Utah county map gains scoped restrictions and retains prior tribal and state orders", async () => {
  const layer = await Bun.file(new URL("./fixtures/layer-2026-11-24.json", import.meta.url)).json();
  const orders = await Bun.file(new URL("./fixtures/orders-2026-11-24.json", import.meta.url)).json();
  const checked = captured.toISOString();
  const baseline = { source: utFfslFireOrders, rows: parseUtahOrders(layer, orders, captured), checked };
  const local = await Promise.all([...rules, ...notices].map(async ({ source, check }) => ({ source, rows: await check(), checked })));
  const air = { source: utDaqCountyAirActions, rows: await parseUtahAirActions(forecast, captured), checked };
  const permits = { source: utDaqLocalOpenBurnPermits, rows: await parseUtahPermitConditions(permitForm, permitConfig, captured), checked };
  const { snapshot } = mergeSources(null, [baseline, ...local, air, permits], captured);
  const prior = new Set(baseline.rows.map(({ fips }) => fips));
  const added = Object.entries(snapshot.counties).filter(([fips]) => !prior.has(fips));
  expect(added.map(([fips]) => fips).sort()).toEqual([
    "49001", "49003", "49005", "49009", "49011", "49015", "49021", "49023", "49025", "49029", "49031",
    "49035", "49041", "49045", "49049", "49053", "49055", "49057",
  ]);
  for (const [, row] of added) expect(countyDecision(row, captured.getTime()).status).toBe("restricted");
  expect(snapshot.counties["49019"].orders.map(({ sourceId }) => sourceId)).toContain("ut-ffsl-fire-orders");
  expect(snapshot.counties["49017"]).toBeUndefined();
});

test("Utah county fixtures parse below 5 ms thread CPU p95", async () => {
  const checks = [
    ...rules, ...notices,
    { source: utDaqCountyAirActions, check: () => parseUtahAirActions(forecast, captured) },
    { source: utDaqLocalOpenBurnPermits, check: () => parseUtahPermitConditions(permitForm, permitConfig, captured) },
  ];
  let max = { id: "", ms: 0 };
  for (const { source, check } of checks) {
    for (let index = 0; index < 5; index++) await check();
    const micros = [];
    for (let index = 0; index < 30; index++) {
      const start = process.threadCpuUsage();
      await check();
      const { user, system } = process.threadCpuUsage(start);
      micros.push(user + system);
    }
    const ms = micros.sort((left, right) => left - right)[28] / 1000;
    if (ms > max.ms) max = { id: source.id, ms };
    expect(ms).toBeLessThan(5);
  }
  console.log(`UT county fixture parse p95 max ${max.ms.toFixed(3)} ms thread CPU (${max.id})`);
});
