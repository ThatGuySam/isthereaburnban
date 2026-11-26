// @ts-nocheck -- bun test types are not installed.
import { expect, spyOn, test } from "bun:test";
import { gunzipSync } from "node:zlib";
import { countiesInState } from "../../counties";
import { countyDecision } from "../../county-decision";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { RuleChangedError } from "../statutory-fallback";
import { akLocalRules } from "./local-rules";
import { akFairbanksAirAlert, parseFairbanksAirAlert, parseJuneauWoodsmoke } from "./local-status";
import { akDecWinterBurning, parseAlaskaWinterBurning } from "./seasonal";

const audit = new Date("2026-11-24T23:30:00Z");
const captured = new Date("2026-11-26T10:31:00Z");
const file = (name) => Bun.file(new URL(`./fixtures/${name}`, import.meta.url));
const countyFixture = (name) => file(`county-pass/${name}`);
const juneau = await countyFixture("juneau-woodsmoke-alert.html").text();
const fairbanks = await countyFixture("fairbanks-air-alert.html").text();
const scheduled = await countyFixture("fairbanks-air-alert-scheduled.html").text();
const cancelled = await countyFixture("fairbanks-air-alert-cancelled.html").text();
const overlap = await countyFixture("fairbanks-air-alert-overlap.html").text();

async function fixtureInput(name) {
  const fixture = countyFixture(name);
  if (name.endsWith(".headers.json")) {
    const headers = await fixture.json();
    return () => new Response(null, { headers });
  }
  const bytes = await fixture.arrayBuffer();
  const pdf = name.endsWith(".pdf.gz");
  const body = pdf ? gunzipSync(bytes) : bytes;
  return () => new Response(body, { headers: { "content-type": pdf ? "application/pdf" : "text/html" } });
}

test("Alaska county merge adds only verified restrictions and keeps local scope", async () => {
  const checked = audit.toISOString();
  const dec = await parseAlaskaWinterBurning(
    await file("18-aac-50-065-2026-11-24.html").text(),
    await file("18-aac-50-015-through-025-2026-11-24.html").text(), audit,
  );
  const baseline = [{ source: akDecWinterBurning, rows: dec, checked }];
  const local = [];
  for (const { source, parse, fixture } of akLocalRules) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ mode: "positive-only", coverage: "restrictions", recurring: true });
    const sample = await fixtureInput(fixture);
    const rows = await parse(sample(), audit);
    for (const row of rows) {
      expect(source.reportingFips).toContain(row.fips);
      expect(row).toMatchObject({ state: "AK", status: "restricted", scope: source.scope,
        standing: true, officialUrl: source.officialUrl, sourceUpdated: null });
    }
    local.push({ source, rows, checked });
  }
  local.push({ source: akFairbanksAirAlert, rows: await parseFairbanksAirAlert(fairbanks, audit), checked });

  const previous = mergeSources(null, baseline, audit).snapshot;
  const { snapshot, transitions } = mergeSources(previous, [...baseline, ...local], audit);
  const counties = countiesInState("AK");
  expect(counties).toHaveLength(30);
  const results = counties.map(({ fips }) => {
    const row = snapshot.counties[fips];
    return [fips, row ? countyDecision(row, audit.getTime()).status : "unknown"];
  });
  const moved = results.filter(([fips, status]) => !previous.counties[fips] && status === "restricted");
  expect(moved.map(([fips]) => fips)).toEqual([
    "02013", "02016", "02020", "02063", "02066", "02068", "02070", "02100", "02105", "02122",
    "02130", "02150", "02170", "02185", "02195", "02198", "02220", "02230", "02275",
  ]);
  expect(results.filter(([, status]) => status === "unknown")).toHaveLength(9);
  expect(results.filter(([, status]) => status === "ban" || status === "none")).toEqual([]);
  expect(transitions).toEqual([]);
  expect(snapshot.counties["02122"].orders.map(({ scopeNote }) => scopeNote).sort()).toEqual(["City of Homer", "City of Kenai"]);
  expect(snapshot.counties["02105"].orders.map(({ scopeNote }) => scopeNote).sort()).toEqual(["City of Hoonah", "City of Pelican"]);
  expect(snapshot.counties["02170"].orders.map(({ sourceId }) => sourceId)).toContain("ak-denali-park-winter-fires");
  expect(snapshot.counties["02090"].orders.map(({ sourceId }) => sourceId)).toContain("ak-fairbanks-air-alert");
  expect(snapshot.counties["02013"]).toMatchObject({ scope: "part", scopeNote: "City of Akutan" });
  expect(snapshot.counties["02020"]).toMatchObject({ scope: "county", status: "restricted" });
});

test("seasonal local clauses use Alaska dates and reject a changed publisher rule", async () => {
  const anderson = akLocalRules.find(({ source }) => source.id === "ak-anderson-brush-season");
  const fixture = await fixtureInput(anderson.fixture);
  expect(await anderson.parse(fixture(), audit)).toEqual([]);
  expect(await anderson.parse(fixture(), new Date("2026-09-15T19:00:00Z"))).toEqual([expect.objectContaining({
    fips: "02068", scope: "part", since: "2026-06-15", expires: "2026-09-15", validUntil: "2026-09-16T08:00:00.000Z",
  })]);
  const amended = (await countyFixture(anderson.fixture).text()).replace("September 15", "September 14");
  await expect(anderson.parse(new Response(amended), audit)).rejects.toThrow("reviewed local burning rule changed");
});

test("Haines falls back to the dated ordinance during an access block and stops at review expiry", async () => {
  const haines = akLocalRules.find(({ source }) => source.id === "ak-haines-fire-service-permit");
  const online = await countyFixture(haines.fixture).text();
  const now = new Date("2026-11-26T11:00:00Z");
  const fetch = spyOn(globalThis, "fetch").mockImplementation(async () => new Response("Forbidden", {
    status: 403, headers: { "cf-mitigated": "challenge" },
  }));
  try {
    const result = await haines.source.fetch({ now });
    expect(result.fallback).toMatchObject({ reviewedAt: "2026-11-26T10:44:32.000Z", reason: expect.stringContaining("403") });
    expect(result.rows).toEqual([expect.objectContaining({ fips: "02100", standing: true,
      note: expect.stringContaining("statutory rule was last reviewed"), status: "restricted" })]);
    await expect(haines.source.fetch({ now: new Date(result.fallback.reviewBy) })).rejects.toThrow("outside its review window");
    fetch.mockImplementation(async () => new Response(online.replace("An annual burn permit is required", "An annual burn permit is optional")));
    await expect(haines.source.fetch({ now })).rejects.toBeInstanceOf(RuleChangedError);
  } finally {
    fetch.mockRestore();
  }
});

test("Juneau accepts only one dated known icon and never issues a countywide all-clear", async () => {
  expect(await parseJuneauWoodsmoke(juneau, captured)).toEqual([]);
  const emergency = juneau.replace("green-L.png", "red-L.png");
  expect(await parseJuneauWoodsmoke(emergency, captured)).toEqual([expect.objectContaining({
    fips: "02110", status: "restricted", scope: "part", scopeNote: "Mendenhall Valley Woodsmoke Hazard Area",
    sourceUpdated: "2026-11-25T17:52:48.000Z", validUntil: "2026-11-26T17:52:48.000Z",
  })]);
  await expect(parseJuneauWoodsmoke(juneau, audit)).rejects.toThrow("stale or invalid");
  await expect(parseJuneauWoodsmoke(emergency, new Date("2026-11-26T17:52:48Z"))).rejects.toThrow("stale or invalid");
  await expect(parseJuneauWoodsmoke(juneau.replace("green-L.png", "yellow-L.png"), captured)).rejects.toThrow("unknown wood-smoke icon");
  await expect(parseJuneauWoodsmoke(juneau + juneau, captured)).rejects.toThrow("ambiguous");
});

test("Fairbanks uses the paired DEC body window, retains upcoming starts and recognizes cancellations", async () => {
  expect(await parseFairbanksAirAlert(fairbanks, audit)).toEqual([expect.objectContaining({
    fips: "02090", status: "restricted", scope: "part", label: "North Pole Stage 2 wood-smoke restriction",
    sourceUpdated: "2026-11-24T22:23:00.000Z", expires: "2026-11-26", validUntil: "2026-11-26T23:00:00.000Z",
  })]);
  expect(await parseFairbanksAirAlert(fairbanks, new Date("2026-11-26T23:00:00Z"))).toEqual([]);
  expect(await parseFairbanksAirAlert(scheduled, new Date("2025-11-12T23:00:00Z"))).toEqual([
    expect.objectContaining({ label: "Fairbanks Stage 1 wood-smoke restriction", validFrom: "2025-11-13T02:00:00.000Z", validUntil: "2025-11-13T20:00:00.000Z" }),
    expect.objectContaining({ label: "North Pole Stage 2 wood-smoke restriction", validFrom: "2025-11-13T02:00:00.000Z" }),
  ]);
  expect(await parseFairbanksAirAlert(cancelled, new Date("2025-11-26T18:00:00Z"))).toEqual([]);
  expect(await parseFairbanksAirAlert(overlap, new Date("2025-12-10T23:01:00Z"))).toEqual([]);
  await expect(parseFairbanksAirAlert(fairbanks.replace("Stage 2", "Stage 5"), audit)).rejects.toThrow("unknown decision for North Pole");
  await expect(parseFairbanksAirAlert(fairbanks.replace("AKST THURSDAY", "AKDT THURSDAY"), audit)).rejects.toThrow("no corroborated relay window");
});

test("Alaska county fixtures parse below 5 ms p95 thread CPU", async () => {
  const jobs = await Promise.all(akLocalRules.map(async ({ source, parse, fixture }) => {
    const input = await fixtureInput(fixture);
    return { id: source.id, parse: () => parse(input(), audit) };
  }));
  jobs.push({ id: "ak-juneau-woodsmoke-alert", parse: () => parseJuneauWoodsmoke(juneau, captured) });
  jobs.push({ id: "ak-fairbanks-air-alert", parse: () => parseFairbanksAirAlert(fairbanks, audit) });
  let slowest = { id: "", p95: 0 };
  for (const { id, parse } of jobs) {
    for (let i = 0; i < 5; i++) await parse();
    const cpu = [];
    for (let i = 0; i < 40; i++) {
      const start = process.threadCpuUsage();
      await parse();
      const { user, system } = process.threadCpuUsage(start);
      cpu.push((user + system) / 1000);
    }
    cpu.sort((a, b) => a - b);
    const p95 = cpu[Math.ceil(cpu.length * 0.95) - 1];
    if (p95 > slowest.p95) slowest = { id, p95 };
  }
  console.log(`AK county fixture p95 max ${slowest.p95.toFixed(3)} ms thread CPU (${slowest.id})`);
  expect(slowest.p95).toBeLessThan(5);
});
