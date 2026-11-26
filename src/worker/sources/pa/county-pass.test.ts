// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { paDepAirBasins, parsePaAirBasins } from "./air-basins";
import { paCarbonMunicipalStatus, parseCarbonBurnStatus } from "./carbon";
import { paLocalBurningRules } from "./local-rules";
import { paPikeWebCad, parsePikeWebCad } from "./pike-webcad";

const now = new Date("2026-11-25T20:00:00Z");
const read = (name) => readFileSync(new URL(`./fixtures/local/${name}`, import.meta.url));
const carbon = read("carbon-status.json").toString();
const airRule = read("air-basin-rule.html").toString();
const airBoundaries = read("air-basin-definitions.html").toString();
const pike = read("pike-webcad.html").toString();
const carbonRows = () => parseCarbonBurnStatus(JSON.parse(carbon), now);
const airRows = () => parsePaAirBasins(airRule, airBoundaries, now);
const pikeRows = () => parsePikeWebCad(pike, now);
const local = paLocalBurningRules.map(({ fixture, parse, source }) => {
  const bytes = read(fixture);
  return { source, bytes, rows: () => parse(new Response(bytes), now) };
});

test("Carbon's FeatureServer reports five municipal restrictions without a countywide answer", () => {
  expect(carbonRows().map(({ scopeNote, status }) => [scopeNote, status])).toEqual([
    ["Nesquehoning Borough, outdoor open burning", "restricted"],
    ["Summit Hill Borough, outdoor open burning", "restricted"],
    ["Lansford Borough, outdoor open burning", "ban"],
    ["Lehighton Borough, outdoor open burning", "restricted"],
    ["Palmerton Borough, outdoor open burning", "restricted"],
  ]);
  expect(carbonRows().every(({ fips, scope, sourceUpdated }) => fips === "42025" && scope === "part" && sourceUpdated === null)).toBe(true);
  const allAllowed = JSON.parse(carbon);
  for (const { attributes } of allAllowed.features) attributes.Burn_Status = "Allowed";
  expect(parseCarbonBurnStatus(allAllowed, now)).toEqual([]);
  expect(paCarbonMunicipalStatus.mode).toBe("positive-only");
});

test("Carbon rejects missing, duplicate, truncated and unrecognized decisions", () => {
  const data = JSON.parse(carbon);
  const last = data.features.at(-1);
  const partial = { ...data, features: data.features.slice(1) };
  const duplicate = { ...partial, features: [...partial.features, last] };
  expect(() => parseCarbonBurnStatus(partial, now)).toThrow("roster");
  expect(() => parseCarbonBurnStatus(duplicate, now)).toThrow("duplicate");
  expect(() => parseCarbonBurnStatus({ ...data, exceededTransferLimit: true }, now)).toThrow("Incomplete ArcGIS");
  expect(() => parseCarbonBurnStatus(JSON.parse(carbon.replace("Not Allowed", "Allowed?")), now)).toThrow("unrecognized burn status");
});

test("Pike WebCAD uses its live burn-ban group, publication clock and township scope", async () => {
  expect(await pikeRows()).toMatchObject([{
    fips: "42103", scope: "part", scopeNote: "Palmyra Township in Pike County", status: "ban",
    documentId: "2611000332", since: null, expires: null, sourceUpdated: "2026-11-25T19:55:45.000Z",
    validUntil: "2026-11-25T21:55:45.000Z",
  }]);
  const withoutBanGroup = pike.replace(/<tr id="rptResults_ctl00_trHeader0">[\s\S]+?(?=<tr id="rptResults_ctl01_trHeader0">)/, "");
  expect(await parsePikeWebCad(withoutBanGroup, now)).toEqual([]);
  await expect(parsePikeWebCad(pike, new Date("2026-11-25T21:55:45Z"))).rejects.toThrow("stale or invalid");
  await expect(parsePikeWebCad(pike.replace("PALMYRA", "UNKNOWN CITY"), now)).rejects.toThrow("unrecognized");
  await expect(parsePikeWebCad(pike.replace("Units Assigned", "Status"), now)).rejects.toThrow("WebCAD headers");
  expect(paPikeWebCad.mode).toBe("positive-only");
});

test("DEP boundaries distinguish four whole counties from the named sub-county air basins", async () => {
  const rows = await airRows();
  expect(rows).toHaveLength(20);
  expect(rows.filter(({ scope }) => scope === "county").map(({ fips }) => fips).sort()).toEqual([
    "42017", "42029", "42045", "42091",
  ]);
  expect(rows.find(({ fips }) => fips === "42095")).toMatchObject({
    scope: "part", standing: true, status: "restricted",
    scopeNote: "Municipalities listed in the Allentown, Bethlehem, Easton air basin in § 121.1",
  });
  expect(rows.some(({ fips }) => ["42003", "42101"].includes(fips))).toBe(false);
  await expect(parsePaAirBasins(airRule.replace("No person may permit", "A person may permit"), airBoundaries, now)).rejects.toThrow("changed");
  await expect(parsePaAirBasins(airRule, airBoundaries.replace("Bucks, Chester", "Bucks, Carbon"), now)).rejects.toThrow("changed");
});

test("local evidence produces standing restrictions and fails closed on a changed rule", async () => {
  const cases = await Promise.all(local.map(async ({ source, rows }) => ({ source, rows: await rows() })));
  for (const { source, rows } of cases) {
    expect(source).toMatchObject({ recurring: true, mode: "positive-only", coverage: "restrictions" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "restricted", scope: source.scope, standing: true, officialUrl: source.officialUrl });
    expect(source.reportingFips).toEqual([rows[0].fips]);
  }
  const east = paLocalBurningRules.find(({ source }) => source.id === "pa-east-stroudsburg-burning");
  const altered = read(east.fixture).toString().replace("Within the Borough limits", "Outside the Borough limits");
  await expect(east.parse(new Response(altered), now)).rejects.toThrow("reviewed local burning rule changed");
  await expect(east.parse(new Response("<html><body></body></html>"), now)).rejects.toThrow("reviewed local burning rule changed");
});

test("PA county lookup preserves scope, citations and unknowns through the source merge", async () => {
  const evidence = [
    { source: paCarbonMunicipalStatus, rows: carbonRows() },
    { source: paDepAirBasins, rows: await airRows() },
    { source: paPikeWebCad, rows: await pikeRows() },
    ...await Promise.all(local.map(async ({ source, rows }) => ({ source, rows: await rows() }))),
  ];
  expect(evidence.every(({ source }) => SOURCES.includes(source))).toBe(true);
  const checked = now.toISOString();
  const { snapshot, transitions } = mergeSources(null, evidence.map((item) => ({ ...item, checked })), now);
  const lookup = (fips) => statusFor(snapshot, fips, now.getTime());
  expect(lookup("42025")).toMatchObject({ status: "restricted", scope: "part", countywide: undefined });
  expect(lookup("42101")).toMatchObject({ status: "restricted", scope: "county", standing: true, countywide: undefined });
  expect(lookup("42091")).toMatchObject({ status: "restricted", scope: "county", standing: true, countywide: undefined });
  expect(lookup("42103")).toMatchObject({ status: "restricted", scope: "part", countywide: undefined, scopedBan: true });
  expect(lookup("42089").orders).toMatchObject([{ scopeNote: "East Stroudsburg Borough", scope: "part" }]);
  expect(lookup("42023").status).toBe("unknown");
  const expected = new Set(evidence.flatMap(({ rows }) => rows.map(({ fips }) => fips)));
  const statuses = countiesInState("PA").map(({ fips }) => lookup(fips));
  expect(statuses.filter(({ status }) => status === "restricted")).toHaveLength(expected.size);
  expect(statuses.filter(({ status }) => status === "unknown")).toHaveLength(67 - expected.size);
  expect(transitions.filter(({ fips }) => fips !== "42025" && fips !== "42103")).toHaveLength(0);
});

test("PA county publishers parse real fixtures below 6 ms p95", async () => {
  const fixtures = [
    { source: paCarbonMunicipalStatus, rows: carbonRows },
    { source: paDepAirBasins, rows: airRows },
    { source: paPikeWebCad, rows: pikeRows },
    ...local,
  ];
  let slowest = { id: "", p95: 0 };
  for (const { source, rows } of fixtures) {
    for (let i = 0; i < 8; i++) await rows();
    const samples = [];
    for (let i = 0; i < 40; i++) {
      const start = process.threadCpuUsage();
      await rows();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1_000);
    }
    samples.sort((a, b) => a - b);
    if (samples[37] > slowest.p95) slowest = { id: source.id, p95: samples[37] };
  }
  console.log(`PA county fixture parse p95 max ${slowest.p95.toFixed(3)} ms (${slowest.id})`);
  expect(slowest.p95).toBeLessThan(6);
});
