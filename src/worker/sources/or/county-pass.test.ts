// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { countiesInState } from "../../counties";
import { countyDecision } from "../../county-decision";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { HOUR_MS, isDue } from "../schedule";
import {
  orCrookBurnDay, orMultnomahWoodSmoke, orUmatillaBurnDay, orUnionSmokeLine,
  parseCrookBurnDay, parseMultnomahWoodSmoke, parseUmatillaBurnDay, parseUnionSmokeLine,
} from "./county-status";
import { orDeqCountyRules, parseDeqCountyRules } from "./deq-county-rules";
import {
  orCrookedRiverRanch, orDepoeBay, orTillamookPermitWindow, orTvfrBurnBan,
  parseCrookedRiverRanch, parseDepoeBay, parseTillamookPermitWindow, parseTvfrBurnBan,
} from "./district-status";
import { orCountyRules } from "./local-rules";

const fixture = (file: string) => readFileSync(new URL(`./fixtures/county/${file}`, import.meta.url), "utf8");
const umatilla = fixture("umatilla-2026-11-25.html");
const crook = fixture("crook-2026-11-25.html");
const multnomah = fixture("multnomah-2026-11-25.html");
const union = fixture("union-2026-11-25.csv");
const deq = fixture("deq-domestic-2026-11-26.json");
const ranch = fixture("crooked-river-ranch-2026-11-26.html");
const depoe = fixture("depoe-bay-2026-11-26.html");
const tillamook = fixture("tillamook-bay-2026-11-26.html");
const tvfr = fixture("tvfr-webmap-2026-11-26.json");
const now = new Date("2026-11-25T21:00:00Z");
const tomorrow = new Date("2026-11-26T08:00:00Z");
const countyCheck = new Date("2026-11-26T10:15:00Z");

test("Umatilla's holiday no-burn decisions retain the county permit scope and dates", async () => {
  const rows = await parseUmatillaBurnDay(umatilla, now);
  expect(rows).toMatchObject([
    {
      status: "ban", scope: "part", fips: "41059", scopeNote: "Open burning under Umatilla County's burn permit program",
      sourceUpdated: "2026-11-25T13:34:00.000Z", validFrom: "2026-11-25T13:34:00.000Z", validUntil: tomorrow.toISOString(),
    },
    { status: "ban", expires: "2026-11-26", validFrom: tomorrow.toISOString(), validUntil: "2026-11-27T08:00:00.000Z" },
  ]);
  expect(await parseUmatillaBurnDay(umatilla, tomorrow)).toHaveLength(1);
  const open = umatilla.replace("ARE NOT A BURN DAY", "ARE BURN DAYS");
  expect((await parseUmatillaBurnDay(open, now))[0].status).toBe("restricted");
  await expect(parseUmatillaBurnDay(umatilla, new Date("2026-11-25T13:00:00Z"))).rejects.toThrow("stale");
  await expect(parseUmatillaBurnDay(umatilla.replace("Thurs.", "Tues."), now)).rejects.toThrow("stale");
  const nonconsecutive = umatilla.replace("Thurs. November 26th", "Fri. November 27th");
  expect(await parseUmatillaBurnDay(nonconsecutive, now)).toHaveLength(1);
  await expect(parseUmatillaBurnDay(nonconsecutive, tomorrow)).rejects.toThrow("stale");
  await expect(parseUmatillaBurnDay(umatilla.replace("ARE NOT A BURN DAY", "Pending"), now)).rejects.toThrow("unrecognized");
});

test("Crook's visible Elementor card determines outdoor debris and burn-barrel limits", async () => {
  expect(await parseCrookBurnDay(crook, now)).toMatchObject([{
    fips: "41013", scope: "part", status: "restricted", validUntil: tomorrow.toISOString(),
    label: "Burn barrels and debris piles limited to 9 a.m. to sunset",
  }]);
  const closed = crook.replace("ae-visibility-hidden elementor-element elementor-element-d222e84", "elementor-element elementor-element-d222e84")
    .replace("elementor-element elementor-element-1d1459b", "ae-visibility-hidden elementor-element elementor-element-1d1459b");
  expect(await parseCrookBurnDay(closed, now)).toMatchObject([{ status: "ban" }]);
  await expect(parseCrookBurnDay(crook, tomorrow)).rejects.toThrow("stale");
  await expect(parseCrookBurnDay(crook.replaceAll("ae-visibility-hidden", ""), now)).rejects.toThrow("unrecognized");
  await expect(parseCrookBurnDay(crook.replace("Regulated Burn Day", "Pending"), now)).rejects.toThrow("unrecognized");
});

test("Union County's smoke-line export reports the latest local decision for unincorporated areas", () => {
  expect(parseUnionSmokeLine(union, now)).toMatchObject([{
    fips: "41061", scope: "part", status: "restricted", label: "Union County Smoke Line: afternoon burning only",
    sourceUpdated: "2026-11-25T13:30:03.000Z", validUntil: tomorrow.toISOString(),
  }]);
  const nov24 = union.replace(/^Wed Nov 25[^\n]+\n/m, "");
  expect(parseUnionSmokeLine(nov24, new Date("2026-11-24T21:00:00Z"))).toMatchObject([
    { status: "ban", label: "Union County Smoke Line: no open burning today", expires: "2026-11-24" },
  ]);
  expect(() => parseUnionSmokeLine(union, tomorrow)).toThrow("no current");
  expect(() => parseUnionSmokeLine(union.replace(",0,0,1,0,", ",1,0,1,0,"), now)).toThrow("errored");
  expect(() => parseUnionSmokeLine(union.replace(",0,0,1,0,", ",0,0,1,1,"), now)).toThrow("errored");
});

test("Multnomah advisory follows its noon-to-noon local publication window", async () => {
  expect(await parseMultnomahWoodSmoke(multnomah, now)).toEqual([]);
  expect(await parseMultnomahWoodSmoke(multnomah, tomorrow)).toEqual([]);
  const restricted = multnomah.replace("No Restrictions", "Mandatory Wood Burning Restriction");
  expect(await parseMultnomahWoodSmoke(restricted, new Date("2026-11-25T18:00:00Z"))).toMatchObject([{
    fips: "41051", scope: "part", status: "restricted", sourceUpdated: "2026-11-25T16:41:00.000Z",
    validFrom: "2026-11-25T20:00:00.000Z", validUntil: "2026-11-26T20:00:00.000Z",
  }]);
  await expect(parseMultnomahWoodSmoke(multnomah, new Date("2026-11-26T20:00:00Z"))).rejects.toThrow("expired");
  await expect(parseMultnomahWoodSmoke(multnomah.replace("No Restrictions", "Pending"), now)).rejects.toThrow("unrecognized");
});

test("DEQ's mapped county rules use the actual permit zones and winter or summer boundaries", () => {
  const features = JSON.parse(deq);
  const winter = parseDeqCountyRules(features, now);
  expect(winter.map(({ fips }) => fips)).toEqual(["41005", "41051", "41067", "41029", "41037"]);
  expect(winter.every(({ scope, status }) => scope === "part" && status === "restricted")).toBe(true);
  const spring = parseDeqCountyRules(features, new Date("2027-03-01T20:00:00Z"));
  expect(spring.map(({ county }) => county)).toEqual(["Clackamas County", "Multnomah County", "Washington County", "Lake County"]);
  const summer = parseDeqCountyRules(features, new Date("2027-07-01T20:00:00Z"));
  expect(summer.filter(({ label }) => label.includes("outside spring and fall")).map(({ county }) => county)).toEqual([
    "Benton County", "Linn County", "Marion County", "Polk County", "Yamhill County", "Clackamas County", "Multnomah County",
  ]);
  expect(() => parseDeqCountyRules({ ...features, exceededTransferLimit: true }, now)).toThrow("Incomplete");
  features.features.splice(0, 1);
  expect(() => parseDeqCountyRules(features, now)).toThrow("mapped domestic burning rule changed");
  expect(orDeqCountyRules.recurring).toBe(true);
});

test("Before You Burn districts validate the zone identity and explicit debris decisions", async () => {
  const rows = await parseCrookedRiverRanch(ranch, countyCheck);
  expect(rows.map(({ fips }) => fips)).toEqual(["41017", "41031"]);
  expect(rows.every(({ scope, status }) => scope === "part" && status === "restricted")).toBe(true);
  const closed = ranch.replaceAll(">Open<", ">Closed<");
  expect((await parseCrookedRiverRanch(closed, countyCheck))[0]).toMatchObject({
    status: "ban", validUntil: "2026-11-27T08:00:00.000Z",
  });
  await expect(parseCrookedRiverRanch(ranch + ranch, countyCheck)).rejects.toThrow("Expected one status section");
  await expect(parseCrookedRiverRanch(ranch.replace(">Crooked River Ranch Fire Rescue<", ">A neighboring agency<"), countyCheck))
    .rejects.toThrow("changed Before You Burn area");
  expect(await parseDepoeBay(depoe, countyCheck)).toEqual([]);
  const depoeClosed = depoe.replace(">Open<", ">Closed<").replace("Open. Burn season through May 31", "Closed. Burn season opens Oct 15");
  expect(await parseDepoeBay(depoeClosed, countyCheck)).toMatchObject([{ scope: "part", status: "restricted", fips: "41041" }]);
  await expect(parseDepoeBay(depoeClosed.replace("Burn season opens Oct 15", "Permit required"), countyCheck)).rejects.toThrow("unrecognized");
});

test("TVF&R reads the published ban overlay rather than the base service area or its hidden historical text", () => {
  const data = JSON.parse(tvfr);
  expect(parseTvfrBurnBan(data, countyCheck)).toEqual([]);
  const overlay = data.operationalLayers.find(({ title }) => title === "TVF&R Burn Ban in Effect");
  overlay.visibility = true;
  expect(parseTvfrBurnBan(data, new Date("2026-06-13T07:00:00Z"))).toEqual([]);
  const rows = parseTvfrBurnBan(data, new Date("2026-06-13T07:01:00Z"));
  expect(rows.map(({ fips }) => fips)).toEqual(["41005", "41051", "41067", "41071"]);
  expect(rows.every(({ scope, status, since }) => scope === "part" && status === "ban" && since === "2026-06-13")).toBe(true);
  data.operationalLayers.push(overlay);
  expect(() => parseTvfrBurnBan(data, countyCheck)).toThrow("duplicate");
});

test("Tillamook Bay reports the published permit window with a definite end", async () => {
  expect(await parseTillamookPermitWindow(tillamook, countyCheck)).toMatchObject([{
    fips: "41057", scope: "part", status: "restricted", since: "2026-10-01", expires: "2027-06-30",
  }]);
  expect(orTillamookPermitWindow.recurring).toBe(true);
  expect(await parseTillamookPermitWindow(tillamook, new Date("2027-07-01T07:00:00Z"))).toEqual([]);
  await expect(parseTillamookPermitWindow(tillamook.replace("June 30, 2027", "June 30, 2026"), countyCheck)).rejects.toThrow("unrecognized");
});

const localJobs = orCountyRules.map(({ source, parse, fixture: file }) => {
  const bytes = readFileSync(new URL(`./fixtures/county/${file}`, import.meta.url));
  const headerOnly = file.endsWith(".headers.json");
  const body = headerOnly ? null : file.endsWith(".gz") ? gunzipSync(bytes) : bytes;
  const headers = headerOnly ? JSON.parse(bytes.toString("utf8"))
    : { "content-type": file.includes(".pdf") ? "application/pdf" : "text/html" };
  return {
    source,
    read: (date = countyCheck) => parse(new Response(body, { headers }), date),
    parseChanged: () => parse(new Response("<p>Superseded rule</p>", { headers: { "content-type": "text/html" } }), countyCheck),
  };
});

test("reviewed local rules keep their exact city or district scope and reject changes", async () => {
  for (const { source, read, parseChanged } of localJobs) {
    expect(source.recurring).toBe(true);
    const rows = await read();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toMatchObject({ fips: source.reportingFips[0], scope: "part", standing: true, officialUrl: source.officialUrl });
    }
    await expect(parseChanged()).rejects.toThrow();
  }
  const corvallis = localJobs.find(({ source }) => source.id === "or-corvallis-season");
  expect(await corvallis.read(new Date("2027-05-01T20:00:00Z"))).toEqual([]);
  const ontario = localJobs.find(({ source }) => source.id === "or-ontario-burn-permit");
  expect((await ontario.read())[0].validFrom).toBe("2026-11-26T07:00:00.000Z");
  const wallowa = localJobs.find(({ source }) => source.id === "or-wallowa-burn-barrels");
  expect((await wallowa.read())[0].validUntil).toBe("2026-11-26T18:00:00.000Z");
  expect((await wallowa.read(new Date("2026-11-26T20:00:00Z")))[0].validFrom).toBe("2026-11-27T02:00:00.000Z");
});

const jobs = [
  [orUmatillaBurnDay, () => parseUmatillaBurnDay(umatilla, now)],
  [orCrookBurnDay, () => parseCrookBurnDay(crook, now)],
  [orUnionSmokeLine, () => parseUnionSmokeLine(union, now)],
  [orMultnomahWoodSmoke, () => parseMultnomahWoodSmoke(multnomah, now)],
  [orDeqCountyRules, () => parseDeqCountyRules(JSON.parse(deq), now)],
];

const districtJobs = [
  [orCrookedRiverRanch, () => parseCrookedRiverRanch(ranch, countyCheck)],
  [orDepoeBay, () => parseDepoeBay(depoe, countyCheck)],
  [orTillamookPermitWindow, () => parseTillamookPermitWindow(tillamook, countyCheck)],
  [orTvfrBurnBan, () => parseTvfrBurnBan(JSON.parse(tvfr), countyCheck)],
];

test("local burn restrictions enter Oregon's county map as scoped evidence", async () => {
  const inputs = await Promise.all(jobs.map(async ([source, parse]) => ({ source, rows: await parse(), checked: now.toISOString() })));
  const { snapshot } = mergeSources(null, inputs, now);
  expect(Object.values(snapshot.counties)).toHaveLength(8);
  for (const row of Object.values(snapshot.counties)) {
    expect(countyDecision(row, +now)).toMatchObject({ scope: "part", status: "restricted" });
  }
  expect(countyDecision(snapshot.counties["41059"], +now).orders[0]).toMatchObject({ status: "ban" });
});

test("the county pass adds scoped restrictions to 24 of the 27 initial unknown counties", async () => {
  const initialCoverage = new Set(["Benton", "Clackamas", "Lane", "Linn", "Marion", "Multnomah", "Polk", "Washington", "Yamhill"]
    .map((name) => `${name} County`));
  const additions = [
    [orUmatillaBurnDay, () => parseUmatillaBurnDay(umatilla, countyCheck)],
    [orDeqCountyRules, () => parseDeqCountyRules(JSON.parse(deq), countyCheck)],
    ...districtJobs,
    ...localJobs.map(({ source, read }) => [source, read]),
  ];
  const inputs = await Promise.all(additions.map(async ([source, parse]) => {
    expect(SOURCES).toContain(source);
    return { source, rows: await parse(), checked: countyCheck.toISOString() };
  }));
  const { snapshot } = mergeSources(null, inputs, countyCheck);
  const unknown = [];
  let restricted = 0;
  for (const { fips, name } of countiesInState("OR")) {
    if (initialCoverage.has(name)) continue;
    const row = snapshot.counties[fips];
    if (!row) unknown.push(name);
    else {
      expect(countyDecision(row, +countyCheck)).toMatchObject({ status: "restricted", scope: "part" });
      restricted++;
    }
  }
  expect(restricted).toBe(24);
  expect(unknown).toEqual(["Gilliam County", "Sherman County", "Wheeler County"]);
});

test("Oregon's new polls fit the original fifteen daily queue messages", () => {
  const sources = SOURCES.filter(({ state, mode }) => state === "OR" && mode !== "manual");
  const pacificMidnight = Date.parse("2026-11-26T08:07:00Z");
  let messages = 0;
  for (let slot = pacificMidnight; slot < pacificMidnight + 24 * HOUR_MS; slot += HOUR_MS) {
    const due = sources.filter((source) => isDue(source, slot, slot - HOUR_MS));
    messages += new Set(due.map(({ id, pollGroup }) => pollGroup ?? id)).size;
  }
  expect(messages).toBe(15);
});

for (const [source, parse] of [...jobs, ...districtJobs, ...localJobs.map(({ source, read }) => [source, read])]) {
  test(`${source.id} parses its real fixture in under 5 ms p95 thread CPU`, async () => {
    for (let i = 0; i < 10; i++) await parse();
    const samples = [];
    for (let i = 0; i < 80; i++) {
      const started = process.threadCpuUsage();
      await parse();
      const { user, system } = process.threadCpuUsage(started);
      samples.push((user + system) / 1000);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[75];
    console.log(`${source.id} fixture p95 ${p95.toFixed(3)} ms thread CPU`);
    expect(p95).toBeLessThan(5);
  });
}
