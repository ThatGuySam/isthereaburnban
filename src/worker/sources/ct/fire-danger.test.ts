// @ts-nocheck -- bun test types are not installed; this file runs under Bun.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { ctDeepFireDanger, parseCtFireDanger } from "./fire-danger";

const fixture = readFileSync(new URL("./fixtures/fire-danger-2026-11-24.html", import.meta.url), "utf8");
const captured = new Date("2026-11-24T15:15:32Z");
const midnightEastern = new Date("2026-11-25T05:00:00Z");

test("Connecticut maps DEEP's High report to scoped restrictions across the eight counties", async () => {
  expect(SOURCES).toContain(ctDeepFireDanger);
  expect(ctDeepFireDanger).toMatchObject({ mode: "positive-only", coverage: "restrictions", scope: "part" });
  const rows = await parseCtFireDanger(fixture, captured);
  expect(rows.map(({ fips }) => fips).sort()).toEqual([
    "09001", "09003", "09005", "09007", "09009", "09011", "09013", "09015",
  ]);
  for (const row of rows) {
    expect(row).toMatchObject({
      status: "restricted", scope: "part", checked: captured.toISOString(),
      label: "Brush burning restricted by high fire danger",
      scopeNote: "Brush burning within 100 feet of woodland or grassland",
      sourceUpdated: "2026-11-24", validFrom: "2026-11-24T05:00:00.000Z", validUntil: midnightEastern.toISOString(),
    });
  }
  const input = { source: ctDeepFireDanger, rows, checked: captured.toISOString() };
  const { snapshot } = mergeSources(null, [input], captured);
  expect(snapshot.counties["09001"].orders).toHaveLength(1);
  expect(snapshot.counties["09001"].status).toBe("restricted");
  expect(snapshot.sources[0]).toMatchObject({ counties: 8, bans: 0 });
  expect(mergeSources(snapshot, [input], midnightEastern).snapshot.counties).toEqual({});
});

test("Connecticut accepts supported ratings and never issues an all-clear", async () => {
  for (const rating of ["VERY HIGH", "EXTREME"]) {
    const rows = await parseCtFireDanger(fixture.replaceAll("HIGH", rating), captured);
    expect(rows).toHaveLength(8);
    expect(rows[0].label).toBe(`Brush burning restricted by ${rating.toLowerCase()} fire danger`);
  }
  for (const rating of ["LOW", "MODERATE"]) {
    expect(await parseCtFireDanger(fixture.replaceAll("HIGH", rating), captured)).toEqual([]);
  }
});

test("Connecticut rejects stale and future reports, changed layout and uncertain geography", async () => {
  await expect(parseCtFireDanger(fixture, midnightEastern)).rejects.toThrow("today's Eastern report");
  await expect(parseCtFireDanger(fixture, new Date("2026-11-24T04:59:00Z"))).rejects.toThrow("today's Eastern report");
  await expect(parseCtFireDanger(fixture.replace("Tuesday,", "Monday,"), captured)).rejects.toThrow("today's Eastern report");
  await expect(parseCtFireDanger(fixture.replace("Daily Forest Fire Danger Report", "Maintenance"), captured)).rejects.toThrow("report cell");
  await expect(parseCtFireDanger(fixture.replaceAll("HIGH", "SEVERE"), captured)).rejects.toThrow("unrecognized fire danger rating");
  for (const geography of ["", "All counties MODERATE", "All counties HIGH except Litchfield County west of Route 8"]) {
    await expect(parseCtFireDanger(fixture.replace("All counties HIGH", geography), captured)).rejects.toThrow("all-counties rating");
  }
});

test("Connecticut retries a rejected 200 with the current report's public embed headers", async () => {
  const requests = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, { headers }) => {
    requests.push({ url, referer: headers.get("referer"), cache: headers.get("cache-control") });
    return new Response(requests.length === 1 ? "<h1>The requested URL was rejected</h1>" : fixture);
  };
  try {
    const { rows } = await ctDeepFireDanger.fetch({ now: captured });
    expect(rows).toHaveLength(8);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ referer: ctDeepFireDanger.officialUrl, cache: "no-cache" });
    expect(rows[0].officialUrl).toBe(ctDeepFireDanger.sourceUrl);
  } finally {
    globalThis.fetch = original;
  }
});

test("Connecticut's dated HTML parser stays below 4 ms p95 thread CPU", async () => {
  for (let i = 0; i < 10; i++) await parseCtFireDanger(fixture, captured);
  const samples = [];
  for (let i = 0; i < 60; i++) {
    const start = process.threadCpuUsage();
    await parseCtFireDanger(fixture, captured);
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
});
