// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  butteBurnDay, colusaBurnDay, elDoradoBurnDay, featherRiverBurnDay, imperialBurnDay,
  tehamaBurnDay, venturaAgriculturalBurn, yoloSolanoBurnDay,
} from "./district-html";
import { mendocinoDaily, parseSacramentoWoodSmoke, parseValleyBurnDeclarations, sacramentoWoodSmoke, sacramentoWoodSmokeUrl, valleyAirBurnDeclarations } from "./district-json";
import { placerBurnMap, southCoastWoodSmoke } from "./district-maps";
import { sanBernardinoFire, parseSanBernardinoFire } from "./fire-district";
import { portolaCurtailment } from "./portola";
import { countiesInState } from "../../counties";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { caCountySources } from "./county-sources";
import { caLocalBurningRules } from "./local-rules";

const now = new Date("2026-11-25T20:30:00Z");
const yesterday = new Date("2026-11-24T20:30:00Z");
const read = (name, suffix = "html", date = "2026-11-25") =>
  readFileSync(new URL(`./fixtures/county/${name}-${date}.${suffix}`, import.meta.url), "utf8");
const fixture = (name, source, suffix = "html") => {
  const raw = read(name, suffix);
  return { source: source.source, raw, parse: (clock = now, input = raw) => source.parse(new Response(input), clock) };
};

const placer = fixture("placer", placerBurnMap, "json");
const coast = fixture("coast", southCoastWoodSmoke, "json");
const mendo = fixture("mendo", mendocinoDaily, "json");
const elDorado = fixture("eldor", elDoradoBurnDay);
const yolo = fixture("yolo", yoloSolanoBurnDay);
const imperial = fixture("imperial", imperialBurnDay);
const colusa = fixture("colusa", colusaBurnDay);
const ventura = fixture("ventura", venturaAgriculturalBurn);
const feather = fixture("sierra-ag", featherRiverBurnDay);
const butte = fixture("butte", butteBurnDay);
const tehama = fixture("tehama-now", tehamaBurnDay);
const portola = fixture("no-portola", portolaCurtailment);
const countyFire = fixture("sbcfire", { source: sanBernardinoFire, parse: parseSanBernardinoFire });
const valleyToday = read("valley", "json", "2026-11-24");
const valleyTomorrow = read("valley", "json");
const valley = (clock = now, input = valleyToday, next = valleyTomorrow) =>
  parseValleyBurnDeclarations(JSON.parse(input), JSON.parse(next), clock);

test("Valley Air publishes eight covered counties and excludes voluntary advisories", () => {
  expect(valley()).toHaveLength(16);
  expect(valley(yesterday)).toHaveLength(32);
  expect(valley().every(({ scope, expires }) => scope === "part" && expires === "2026-11-25")).toBe(true);
  expect(valley().find(({ fips, status }) => fips === "06029" && status === "ban")).toMatchObject({
    fips: "06029", scopeNote: expect.stringContaining("San Joaquin Valley air basin"),
    label: "Hazard-reduction pile burning prohibited", officialUrl: expect.stringContaining("/daily-burn-declarations/"),
  });
  expect(() => valley(now, valleyToday.replace('"Stanislaus"', '"San Joaquin"'))).toThrow("unexpected declaration area");
  expect(() => valley(now, valleyToday, valleyToday)).toThrow("out-of-order forecast dates");
  expect(() => valley(new Date("2026-11-26T09:00Z"))).toThrow("no current dated decisions");
});

test("Placer preserves residential zones, local dates and pending versus no-burn codes", async () => {
  const rows = await placer.parse();
  expect(rows.filter(({ expires }) => expires === "2026-11-25")).toHaveLength(3);
  expect(rows.filter(({ status, validFrom }) => status === "ban" && validFrom === "2026-11-26T08:00:00.000Z")).toHaveLength(6);
  expect(rows.every(({ fips, scope }) => fips === "06061" && scope === "part")).toBe(true);
  await expect(placer.parse(now, placer.raw.replaceAll("4-8to6", "n/a"))).rejects.toThrow("unrecognized burn status");
  await expect(placer.parse(new Date("2026-11-27T09:00Z"))).rejects.toThrow("no current dated decisions");
});

test("dated district widget reports preserve permits, geography and no-burn days", async () => {
  expect(await mendo.parse()).toMatchObject([{ fips: "06045", status: "restricted", note: expect.stringContaining("permits are required") }]);
  expect(await imperial.parse()).toMatchObject([{ fips: "06025", status: "ban" }]);
  expect(await colusa.parse()).toMatchObject([
    { fips: "06011", status: "ban", expires: "2026-11-25" },
    { fips: "06011", status: "ban", expires: "2026-11-26" },
  ]);
  expect(await yolo.parse()).toMatchObject([
    { fips: "06113", status: "ban", expires: "2026-11-25" },
    { fips: "06095", status: "ban", expires: "2026-11-25", scopeNote: expect.stringContaining("northeastern Solano") },
  ]);
  await expect(mendo.parse(now, mendo.raw.replace('"Permissive"}', '"Unknown"}'))).rejects.toThrow();
  await expect(yolo.parse(new Date("2026-11-26T09:00Z"))).rejects.toThrow("no current dated decisions");
  await expect(imperial.parse(now, imperial.raw.replace("No Burn Day", "Possibly a Burn Day"))).rejects.toThrow("unrecognized burn decision");
  await expect(colusa.parse(now, colusa.raw.replace("25 - 27th", "27 - 25th"))).rejects.toThrow("invalid burn date range");
});

test("district tables and notices keep activity and zone boundaries", async () => {
  expect(await elDorado.parse()).toEqual([]);
  expect(await elDorado.parse(now, elDorado.raw.replaceAll(">BURN DAY<", ">NO BURN DAY<"))).toMatchObject([
    { fips: "06017", scopeNote: expect.stringContaining("West Slope") },
    { fips: "06017", scopeNote: expect.stringContaining("South Lake Tahoe Basin") },
  ]);
  const rows = await ventura.parse();
  expect(rows).toHaveLength(7);
  expect(rows.every(({ fips, status }) => fips === "06111" && status === "ban")).toBe(true);
  expect(await feather.parse()).toHaveLength(22);
  expect(await butte.parse()).toHaveLength(3);
  expect(await tehama.parse()).toMatchObject([
    { fips: "06103", label: "Agricultural burning limited to prunings" },
    { fips: "06103", scopeNote: expect.stringContaining("outside Red Bluff"), status: "restricted" },
  ]);
  await expect(ventura.parse(now, ventura.raw.replace(/6\s*(?:\ventura.raw.replace("6 &gt; 3k ft", "8")gt;|>)\s*3k ft/, "8"))).rejects.toThrow("unknown burn region or code");
  await expect(tehama.parse(now, tehama.raw.replace("Pruning’s only agricultural burn day", "unknown decision"))).rejects.toThrow("unrecognized daily decision");
});

test("South Coast wood smoke returns only scoped prohibitions", async () => {
  expect(await coast.parse()).toEqual([]);
  expect(await coast.parse(now, coast.raw.replaceAll("Wood Burning Permitted", "Wood Burning Prohibited"))).toMatchObject([
    { fips: "06037", status: "ban", scope: "part" },
    { fips: "06059", status: "ban", scope: "part" },
    { fips: "06065", status: "ban", scope: "part" },
    { fips: "06071", status: "ban", scope: "part" },
  ]);
  await expect(coast.parse(now, coast.raw.replaceAll("Exempt Areas", "Unknown"))).rejects.toThrow("changed designation");
});

const sacHistory = read("sac-history", "json");
const sac = (clock = now, input = sacHistory) => parseSacramentoWoodSmoke(JSON.parse(input), clock);

test("Sacramento uses date-keyed history for Rule 421 decisions", () => {
  expect(sac()).toEqual([]);
  expect(sac(new Date("2026-11-09T20:30Z"))).toEqual([]);
  expect(sac(now, sacHistory.replace('"2026-11-25":6', '"2026-11-25":8'))).toMatchObject([
    { fips: "06067", status: "restricted", scope: "part", expires: "2026-11-25" },
  ]);
  expect(sac(now, sacHistory.replace('"2026-11-25":6', '"2026-11-25":9'))).toMatchObject([
    { fips: "06067", status: "ban", scope: "part", expires: "2026-11-25" },
  ]);
  expect(() => sac(new Date("2026-11-26T20:30Z"))).toThrow("no current dated");
  expect(() => sac(now, sacHistory.replace('"2026-11-25":6', '"2026-11-25":4'))).toThrow("unrecognized");
  expect(sac(new Date("2027-03-01T17:00Z"))).toEqual([]);
  expect(sacramentoWoodSmokeUrl("2027-01-01")).toContain("2026-2027");
  expect(sacramentoWoodSmokeUrl("2027-11-01")).toContain("2027-2028");
});

const dailyFixtures = [
  { source: sacramentoWoodSmoke, parse: sac },
  { source: valleyAirBurnDeclarations, parse: valley },
  placer, coast, mendo, elDorado, yolo, imperial, colusa, ventura, feather, butte, tehama, portola, countyFire,
];
const localFixtures = caLocalBurningRules.map(({ fixture, parse, source }) => {
  const bytes = readFileSync(new URL(`./fixtures/county/${fixture}`, import.meta.url));
  return { source, parse: (clock = now, input = bytes) => parse(new Response(input), clock) };
});

test("Portola avoids applying dated municipal curtailment to the whole county", async () => {
  const rows = await portola.parse();
  expect(rows).toHaveLength(4);
  expect(rows.slice(0, 2)).toMatchObject([
    { fips: "06063", status: "ban", scope: "part", scopeNote: expect.stringContaining("Zone 1 outside City of Portola"), expires: "2026-11-25" },
    { fips: "06063", status: "restricted", scope: "part", scopeNote: expect.stringContaining("uncertified wood stoves"), expires: "2026-11-25" },
  ]);
  await expect(portola.parse(new Date("2026-12-02T16:00Z"))).rejects.toThrow("no current dated decisions");
  await expect(portola.parse(now, portola.raw.replace("11/25, 11/26", "11/32, 11/26"))).rejects.toThrow("invalid curtailment date");
});

test("San Bernardino County Fire's explicit status table preserves its division boundaries and permit rule", async () => {
  const rows = await countyFire.parse();
  expect(rows).toHaveLength(5);
  expect(rows.every(({ fips, scope, status }) => fips === "06071" && scope === "part" && status === "restricted")).toBe(true);
  expect(rows[2].scopeNote).toContain("except for within Running Springs Fire District");
  const suspended = await countyFire.parse(now, countyFire.raw.replace("Burning Allowed", "Burning Suspended"));
  expect(suspended[0]).toMatchObject({ status: "ban", scope: "part" });
  await expect(countyFire.parse(now, countyFire.raw.replace("Burning Allowed", "Unavailable"))).rejects.toThrow("unknown burn status");
  await expect(countyFire.parse(now, countyFire.raw.replace("You MUST obtain", "You can obtain"))).rejects.toThrow("missing permit policy");
});

test("reviewed rules use recurring status, have a seasonal boundary, and reject changed evidence", async () => {
  for (const { source, parse } of localFixtures) {
    const isBackyardPermit = source.id === "ca-monterey-bay-backyard-permits";
    const rows = await parse(isBackyardPermit ? new Date("2026-12-01T10:00Z") : now);
    expect(source).toMatchObject({ recurring: true, mode: "positive-only", coverage: "restrictions" });
    expect(rows.map(({ fips }) => fips)).toEqual(source.reportingFips);
    expect(rows.every(({ standing, status, scope, officialUrl }) =>
      standing && status === "restricted" && scope === "part" && officialUrl === source.officialUrl)).toBe(true);
  }
  const monterey = localFixtures.find(({ source }) => source.id === "ca-monterey-bay-backyard-season");
  expect(await monterey.parse(new Date("2026-12-01T08:00Z"))).toEqual([]);
  const permits = localFixtures.find(({ source }) => source.id === "ca-monterey-bay-backyard-permits");
  expect(await permits.parse()).toEqual([]);
  expect(await permits.parse(new Date("2026-12-01T08:00Z"))).toHaveLength(3);
  await expect(monterey.parse(now, "<h4>Backyard Burning is the burning of green waste material</h4>")).rejects.toThrow(/reviewed/i);
});

test("the county pass produces scoped restrictions in all 58 California counties through the normal merge", async () => {
  const fixtures = [...dailyFixtures, ...localFixtures];
  expect(fixtures.map(({ source }) => source.id).sort()).toEqual(caCountySources.map(({ id }) => id).sort());
  expect(fixtures.every(({ source }) => SOURCES.includes(source))).toBe(true);
  const checked = now.toISOString();
  const inputs = await Promise.all(fixtures.map(async ({ source, parse }) => ({ source, rows: await parse(), checked })));
  const activeReports = inputs.slice(0, dailyFixtures.length).flatMap(({ rows }) =>
    rows.filter(({ validFrom }) => !validFrom || validFrom <= checked));
  expect(new Set(activeReports.map(({ fips }) => fips)).size).toBe(21);
  const { snapshot } = mergeSources(null, inputs, now);
  const results = countiesInState("CA").map(({ fips }) => statusFor(snapshot, fips, now.getTime()));
  expect(results).toHaveLength(58);
  expect(results.filter(({ status }) => status !== "restricted")).toEqual([]);
  expect(results.every(({ scope, countywide }) => scope === "part" && countywide === undefined)).toBe(true);
  expect(statusFor(snapshot, "06071", now.getTime()).orders).toEqual(expect.arrayContaining([
    expect.objectContaining({ officialUrl: countyFire.source.officialUrl, scope: "part" }),
  ]));
});

test("CA county publishers parse their fixtures below 6 ms p95", async () => {
  const fixtures = [...dailyFixtures, ...localFixtures];
  let slowest = { id: "", p95: 0 };
  for (const { source: { id }, parse } of fixtures) {
    for (let i = 0; i < 8; i++) await parse();
    const samples = [];
    for (let i = 0; i < 40; i++) {
      const start = performance.now();
      await parse();
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    if (samples[37] > slowest.p95) slowest = { id, p95: samples[37] };
  }
  console.log(`CA daily fixture parse p95 max ${slowest.p95.toFixed(3)} ms (${slowest.id})`);
  expect(slowest.p95).toBeLessThan(6);
});
