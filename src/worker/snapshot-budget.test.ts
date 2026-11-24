// @ts-nocheck -- bun test types aren't installed.
import { expect, test } from "bun:test";
import { nationalFixture, snapshotBenchmarks, timings } from "../../scripts/snapshot-benchmark";

test("every projected state fits the merge and cold shard read CPU budgets", () => {
  const now = new Date("2026-11-24T11:07:00.000Z");
  const benchmark = snapshotBenchmarks(nationalFixture(now), now);
  expect(benchmark.stateCases).toHaveLength(51);
  expect(benchmark.counts.sources).toBe(120);
  expect(benchmark.counts.counties).toBe(3143);
  for (const { state, merge, read } of benchmark.stateCases) {
    expect(timings(merge).p95, `${state} state merge p95 (ms)`).toBeLessThanOrEqual(4);
    expect(timings(read).p95, `${state} cold shard read p95 (ms)`).toBeLessThanOrEqual(2);
  }
}, 30_000);

test("national v2 publication and read invocations fit the CPU budget with all counties active", () => {
  const now = new Date("2026-11-24T11:07:00.000Z");
  const benchmark = snapshotBenchmarks(nationalFixture(now, true), now);
  const invocations = [
    ["compact publication", benchmark.writeCompact],
    ["pretty publication", benchmark.writePretty],
    ["catalog publication", benchmark.writeCatalog],
    ["coverage", benchmark.readCoverage],
    ["fire weather", benchmark.readWeather],
    ["legacy-compatible REST active feed", benchmark.readActive],
    ["MCP first page", benchmark.readActiveMcp],
    ["MCP first page with expired orders", benchmark.readActiveExpired],
  ];
  for (const [name, invoke] of invocations) {
    expect(timings(invoke).p95, `${name} p95 (ms)`).toBeLessThanOrEqual(10);
  }
}, 30_000);
