// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { wiLocalRules } from "./local-rules";

const checked = "2026-11-25T06:13:00Z";
const captured = new Date(checked);
const fixtures = wiLocalRules.map(({ source, parse, fixture }) => {
  const bytes = readFileSync(new URL(`./fixtures/local/${fixture}`, import.meta.url));
  return { source, parse, fixture, bytes, run: () => parse(new Response(bytes), captured) };
});

test("verified local rules carry source links and preserve boundaries on the Wisconsin map", async () => {
  const inputs = [];
  for (const { source, run } of fixtures) {
    const rows = await run();
    expect(source).toMatchObject({ recurring: true, coverage: "restrictions", mode: "positive-only" });
    expect(rows.map(({ fips }) => fips)).toEqual(source.reportingFips);
    for (const row of rows) {
      expect(row).toMatchObject({ state: "WI", scope: "part", status: "restricted", officialUrl: source.officialUrl });
      expect(row.scopeNote).toBeTruthy();
    }
    inputs.push({ source, rows, checked });
  }
  const { snapshot, transitions } = mergeSources(null, inputs, captured);
  const results = countiesInState("WI").map(({ fips }) => statusFor(snapshot, fips, captured.getTime()));
  expect(results.filter(({ status }) => status === "restricted")).toHaveLength(67);
  expect(results.filter(({ status }) => status === "unknown").map(({ county }) => county)).toEqual([
    "Florence County", "Iron County", "Langlade County", "Pepin County", "Washburn County",
  ]);
  expect(transitions).toEqual([]);
  for (const [fips, scopeNote] of [
    ["55025", "City of Madison"], ["55029", "Unincorporated Door County where the county rule applies"],
    ["55019", "City of Colby within the county"], ["55078", "Within the exterior boundaries of the Menominee Nation in Menominee County"],
  ]) {
    expect(statusFor(snapshot, fips, captured.getTime())).toMatchObject({ scope: "part", scopeNote, status: "restricted" });
  }
  expect(statusFor(snapshot, "55037", captured.getTime()).status).toBe("unknown");
  expect(statusFor(snapshot, "55025", Date.parse("2026-11-27T06:00:00Z")).status).toBe("unknown");
});

test("changed HTML and PDF evidence suspend the rule pending review", async () => {
  const madison = fixtures.find(({ source }) => source.id === "wi-madison-burn-permit");
  const modified = madison.bytes.toString().replace("ceremonial fires", "commercial fires");
  await expect(madison.parse(new Response(modified), captured)).rejects.toThrow("rule changed");
  const door = fixtures.find(({ source }) => source.id === "wi-door-county-burn-permit");
  const changedPdf = Buffer.concat([door.bytes, Buffer.from("\n")]);
  await expect(door.parse(new Response(changedPdf), captured)).rejects.toThrow("rule changed");
  await expect(door.parse(new Response("<html>login</html>"), captured)).rejects.toThrow("Expected a PDF");
});

test("each reviewed local rule parses its fixture in under 6 ms p95", async () => {
  let slowest = { id: "", p95: 0 };
  for (const { source, run } of fixtures) {
    for (let i = 0; i < 4; i++) await run();
    const samples = [];
    for (let i = 0; i < 25; i++) {
      const start = process.threadCpuUsage();
      await run();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1_000);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[23];
    if (p95 > slowest.p95) slowest = { id: source.id, p95 };
  }
  console.log(`WI local rule parsing p95 max ${slowest.p95.toFixed(3)} ms (${slowest.id})`);
  expect(slowest.p95).toBeLessThan(6);
});
