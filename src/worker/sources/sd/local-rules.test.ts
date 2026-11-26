// @ts-expect-error Bun provides the test module at runtime.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SOURCES } from "../registry";
import { sdLocalBurnRules } from "./local-rules";

const now = new Date("2026-11-26T15:00:00Z");
const jobs = sdLocalBurnRules.map(({ source, parse, fixture }) => {
  const bytes = readFileSync(new URL(`./fixtures/county-pass/${fixture}`, import.meta.url));
  const body = Uint8Array.from(bytes).buffer;
  const run = fixture.endsWith(".headers.json")
    ? () => parse(new Response(null, { headers: JSON.parse(bytes.toString("utf8")) }), now)
    : () => parse(new Response(body), now);
  return { source, run };
});

test("SD local rules report active and correctly scoped restrictions from reviewed documents", async () => {
  for (const { source, run } of jobs) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ mode: "positive-only", coverage: "restrictions", recurring: true });
    const rows = await run();
    expect(rows.map(({ fips }) => fips)).toEqual(source.reportingFips);
    for (const row of rows) {
      expect(row).toMatchObject({
        state: "SD", status: "restricted", scope: source.scope, standing: true, officialUrl: source.officialUrl,
      });
      expect(row.scopeNote).toBeTruthy();
      expect(Date.parse(row.validFrom ?? "")).toBeLessThanOrEqual(now.getTime());
      expect(Date.parse(row.validUntil ?? "")).toBeGreaterThan(now.getTime());
    }
    if (source.id === "sd-sioux-falls-burning") {
      expect(rows.map(({ fips, scopeNote }) => [fips, scopeNote])).toEqual([
        ["46099", "City of Sioux Falls"], ["46083", "City of Sioux Falls"],
      ]);
    }
  }
});

test("a changed ordinance or document edition cannot extend its standing rule", async () => {
  const clay = sdLocalBurnRules.find(({ source }) => source.id === "sd-clay-open-burning");
  const beadle = sdLocalBurnRules.find(({ source }) => source.id === "sd-beadle-notification");
  if (!clay || !beadle) throw new Error("Expected Clay and Beadle rules");
  await expect(clay.parse(new Response(null, { headers: { "content-type": "application/pdf", etag: '"new"' } }), now))
    .rejects.toThrow("reviewed local burning rule changed");
  const page = readFileSync(new URL(`./fixtures/county-pass/${beadle.fixture}`, import.meta.url), "utf8");
  await expect(beadle.parse(new Response(page.replace("Huron Police Dispatch", "a different authority")), now))
    .rejects.toThrow("reviewed local burning rule changed");
});

test("SD standing rule fixtures parse below 5 ms p95 thread CPU", async () => {
  let maxP95 = 0;
  for (const { run } of jobs) {
    for (let i = 0; i < 5; i++) await run();
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const start = process.threadCpuUsage();
      await run();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1_000);
    }
    maxP95 = Math.max(maxP95, samples.sort((a, b) => a - b)[28]);
  }
  console.log(`SD standing rule fixture p95 max ${maxP95.toFixed(3)} ms thread CPU`);
  expect(maxP95).toBeLessThan(5);
});
