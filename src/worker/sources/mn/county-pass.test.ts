// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { countiesInState } from "../../counties";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { mnLocalCalendars } from "./local-rules";
import { mnOlmstedOrders, parseOlmstedOrders } from "./olmsted";
import { mnRestrictions, parseMinnesotaRestrictions } from "./restrictions";

const fixture = (name, extension) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.${extension}`, import.meta.url));
const html = (name) => gunzipSync(fixture(name, "html.gz")).toString("utf8");
const captured = new Date("2026-11-25T04:55:00Z");
const checked = captured.toISOString();
const dnr = fixture("restrictions", "json").toString("utf8");

const olmstedArchive = html("olmsted-news");
const olmstedIssue = html("olmsted-ban");
const olmstedLift = html("olmsted-lift");
const readOlmsted = async (url) => url.includes("-ended-") ? olmstedLift : olmstedIssue;

const jobs = mnLocalCalendars.map(({ id, kind, source, parse }) => {
  if (kind === "pdf-etag") {
    const head = JSON.parse(fixture(`rule-${id}`, "json"));
    return { source, parse: (now) => parse(new Response(null, head), now) };
  }
  const body = kind === "pdf" ? fixture(`rule-${id}`, "pdf") : html(`rule-${id}`);
  return { source, parse: (now) => parse(new Response(body), now) };
});

test("Minnesota county fixture replay yields only supported, scoped restrictions", async () => {
  const baseline = { source: mnRestrictions, rows: parseMinnesotaRestrictions(dnr, captured), checked };
  const before = mergeSources(null, [baseline], captured).snapshot;
  const inputs = [{ source: mnOlmstedOrders, rows: await parseOlmstedOrders(olmstedArchive, captured, readOlmsted), checked }];
  for (const { source, parse } of jobs) {
    expect(SOURCES.find(({ id }) => id === source.id)).toBe(source);
    expect(source).toMatchObject({ recurring: true, mode: "positive-only", cadence: { kind: "daily" } });
    const rows = await parse(captured);
    expect(rows.map(({ fips }) => fips)).toEqual(source.reportingFips);
    for (const row of rows) {
      expect(row).toMatchObject({
        status: "restricted", state: "MN", sourceId: source.id, scope: source.scope,
        officialUrl: source.officialUrl, validUntil: "2026-11-26T06:00:00.000Z",
      });
      expect(row.scopeNote.length).toBeGreaterThan(0);
    }
    inputs.push({ source, rows, checked });
  }

  const { snapshot, transitions } = mergeSources(before, [baseline, ...inputs], captured);
  const changes = countiesInState("MN").map(({ fips }) => [
    statusFor(before, fips, captured.getTime()).status, statusFor(snapshot, fips, captured.getTime()).status,
  ]);
  expect(changes.filter(([then, now]) => then === "unknown" && now === "restricted")).toHaveLength(54);
  expect(changes.filter(([, now]) => now === "unknown")).toHaveLength(32);
  expect(changes.every(([, now]) => now === "unknown" || now === "restricted")).toBe(true);
  expect(transitions).toEqual([]);
  expect(statusFor(snapshot, "27053", captured.getTime()).orders).toMatchObject([
    { scope: "part", scopeNote: "City of Minneapolis" },
  ]);
  expect(statusFor(snapshot, "27125", captured.getTime()).orders).toMatchObject([
    { scope: "part", scopeNote: "Red Lake County outside city limits" },
  ]);
});

test("a changed document or HTML section requires a new review", async () => {
  const blueEarth = mnLocalCalendars.find(({ id }) => id === "blue-earth");
  const body = html("rule-blue-earth");
  await expect(blueEarth.parse(new Response(body.replace("Insurance Agency", "Insurance Provider")), captured))
    .resolves.toHaveLength(1);
  await expect(blueEarth.parse(new Response(body.replace("They are required", "They are optional")), captured))
    .rejects.toThrow("reviewed local burning rule changed");
  const wadena = mnLocalCalendars.find(({ id }) => id === "wadena-city");
  await expect(wadena.parse(new Response(null, { headers: { etag: '"other"', "content-type": "application/pdf" } }), captured))
    .rejects.toThrow("reviewed local burning rule changed");
});

test("Moorhead and Rochester rules survive regenerated accordion IDs", async () => {
  for (const id of ["clay-moorhead", "olmsted-rochester"]) {
    const rule = mnLocalCalendars.find((item) => item.id === id);
    const body = html(`rule-${id}`);
    const refreshed = body.replaceAll(/collapse_[\da-f-]+_(\d+)/gi, "collapse_new_$1");
    expect(refreshed).not.toBe(body);
    expect(await rule.parse(new Response(refreshed), captured)).toHaveLength(1);
  }
});

test("Olmsted sheriff's order applies countywide until the local-time lift", async () => {
  const before = new Date("2023-09-07T12:59:59Z");
  const rows = await parseOlmstedOrders(olmstedArchive, before, readOlmsted);
  expect(rows).toMatchObject([{
    fips: "27109", status: "ban", scope: "county", since: "2023-09-01", expires: null,
    validUntil: "2023-09-07T13:00:00.000Z",
    officialUrl: expect.stringContaining("burn-ban-olmsted-county-effective-immediately"),
  }]);
  expect(await parseOlmstedOrders(olmstedArchive, new Date("2023-09-07T13:00:00Z"), readOlmsted)).toEqual([]);
  expect(await parseOlmstedOrders(olmstedArchive, captured, () => { throw new Error("historical notice fetched"); })).toEqual([]);
});

test("Olmsted rejects missing dates, out-of-scope notices and a changed index", async () => {
  const now = new Date("2023-09-04T17:00:00Z");
  await expect(parseOlmstedOrders("<h1>News</h1>", now, readOlmsted)).rejects.toThrow("expected the Sheriff's Office News");
  await expect(parseOlmstedOrders(olmstedArchive.replaceAll("Sep 01, 2023", "Recent"), now, readOlmsted))
    .rejects.toThrow("undated or malformed");
  await expect(parseOlmstedOrders(olmstedArchive, now, async () => olmstedIssue.replace("all of Olmsted County", "county parks")))
    .rejects.toThrow("unrecognized issuing authority, scope or effective dates");
});

test("Minnesota county sources stay under 7 ms p95 CPU per fixture", async () => {
  const readers = [
    ...jobs.map(({ source, parse }) => [source.id, () => parse(captured)]),
    [mnOlmstedOrders.id, () => parseOlmstedOrders(olmstedArchive, new Date("2023-09-07T12:00:00Z"), readOlmsted)],
  ];
  for (const [id, run] of readers) {
    for (let i = 0; i < 8; i++) await run();
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const start = process.threadCpuUsage();
      await run();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    const p95 = samples.sort((a, b) => a - b)[28];
    expect(p95, id).toBeLessThan(7);
  }
});
