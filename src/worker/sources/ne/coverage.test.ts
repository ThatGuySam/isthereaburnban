// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { neLincolnLancasterAir, parseNeLincolnAir } from "./lincoln-air";
import { neOpenBurningLaw, parseNeOpenBurning } from "./open-burning";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.html`, import.meta.url), "utf8");
const statute = fixture("statute-81-520-01");
const lincolnAir = fixture("lincoln-air");
const now = new Date("2026-11-24T16:32:38Z");

test("Nebraska publishes 93 standing restrictions and keeps both Lancaster scopes in the merged result", async () => {
  const sources = [neOpenBurningLaw, neLincolnLancasterAir];
  for (const source of sources) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ coverage: "restrictions", mode: "positive-only", recurring: true });
  }

  const stateRows = await parseNeOpenBurning(statute, now);
  expect(stateRows).toHaveLength(93);
  expect(new Set(stateRows.map(({ fips }) => fips)).size).toBe(93);
  expect(stateRows.every(({ fips, scope, status, since, expires, validFrom, validUntil }) =>
    fips.startsWith("31") && scope === "state" && status === "restricted" && since === null && expires === null &&
    validFrom === "2026-11-24T06:00:00.000Z" && validUntil === "2026-11-26T06:00:00.000Z")).toBe(true);

  const localRows = await parseNeLincolnAir(lincolnAir, now);
  expect(localRows).toMatchObject([
    { fips: "31109", scope: "part", status: "restricted", scopeNote: "City of Lincoln, under Lincoln Municipal Code § 8.06.140" },
    { fips: "31109", scope: "part", status: "restricted", scopeNote: "Lancaster County outside the City of Lincoln, under the county air pollution rules" },
  ]);
  expect(localRows).toHaveLength(2);
  const { snapshot } = mergeSources(null, [stateRows, localRows].map((rows, i) => ({
    source: sources[i], rows, checked: now.toISOString(),
  })), now);
  expect(snapshot.counties["31109"]).toMatchObject({ status: "restricted", scope: "state", orders: [
    { scopeNote: localRows[0].scopeNote }, { scopeNote: localRows[1].scopeNote },
  ] });
  expect(snapshot.counties["31013"]).toMatchObject({ county: "Box Butte County", status: "restricted" });
  expect(snapshot.counties["31013"].orders).toBeUndefined();
});

test("Nebraska rejects changed statute and stale or unknown effective dates", async () => {
  expect(await parseNeOpenBurning(statute, new Date("2026-07-18T04:59:59Z"))).toEqual([]);
  expect(await parseNeOpenBurning(statute, new Date("2026-07-18T05:00:00Z"))).toHaveLength(93);
  for (const changed of [
    statute.replace("July 18, 2026", "July 18, 2024"),
    statute.replace("July 18, 2026", "unknown"),
    statute.replace("may waive the open burning ban in the local", "may not waive the open burning ban in the local"),
    "<h1>Site unavailable</h1>",
  ]) {
    await expect(parseNeOpenBurning(changed, now)).rejects.toThrow("reviewed statute or effective date changed");
  }
});

test("Lincoln-Lancaster rejects changed rules and missing jurisdiction headings", async () => {
  for (const changed of [
    lincolnAir.replace("within 100 yards", "within 200 yards"),
    lincolnAir.replace("Open Burning Rules Within the City Limits of Lincoln", "Open Burning Rules Within the City Limits"),
  ]) {
    await expect(parseNeLincolnAir(changed, now)).rejects.toThrow("reviewed permit rules changed");
  }
});

test("Nebraska source fixtures stay below 4 ms p95 thread CPU", async () => {
  for (const parse of [() => parseNeOpenBurning(statute, now), () => parseNeLincolnAir(lincolnAir, now)]) {
    for (let i = 0; i < 10; i++) await parse();
    const samples = [];
    for (let i = 0; i < 60; i++) {
      const start = process.threadCpuUsage();
      await parse();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    samples.sort((a, b) => a - b);
    expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
  }
});
