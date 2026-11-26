// @ts-expect-error Bun provides the test module at runtime.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { countyDecision } from "../../county-decision";
import { projectMapStatus } from "../../map-status";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { njLocalBurnRules } from "./local-rules";
import { njRestrictions, parseNjRestrictions } from "./restrictions";

const audit = new Date("2026-11-24T05:15:00Z");
const checked = audit.toISOString();
const jobs = njLocalBurnRules.map(({ source, parse, fixture }) => {
  const bytes = readFileSync(new URL(`./fixtures/county-pass/${fixture}`, import.meta.url));
  const body = Uint8Array.from(bytes).buffer;
  const run = fixture.endsWith(".headers.json")
    ? () => parse(new Response(null, { headers: JSON.parse(bytes.toString("utf8")) }), audit)
    : () => parse(new Response(body), audit);
  return { source, run, parse, bytes };
});

test("the reviewed NJ rules are registered as recurring, positive-only, and scoped", async () => {
  for (const { source, run } of jobs) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ mode: "positive-only", coverage: "restrictions", recurring: true, scope: "part" });
    const rows = await run();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      fips: source.reportingFips[0], state: "NJ", standing: true, status: "restricted",
      scope: "part", officialUrl: source.officialUrl,
    });
    expect(row.scopeNote).toBeTruthy();
    expect(Date.parse(row.validFrom ?? "")).toBeLessThanOrEqual(audit.getTime());
    expect(Date.parse(row.validUntil ?? "")).toBeGreaterThan(audit.getTime());
  }
});

test("NJ map changes 21 unknowns to scoped restrictions without a countywide answer", async () => {
  const original = (name: string) =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}-2026-11-24.json`, import.meta.url), "utf8"));
  const njdep = { source: njRestrictions, rows: parseNjRestrictions(original("divisions"), original("counties"), audit), checked };
  const before = mergeSources(null, [njdep], audit).snapshot;
  expect(projectMapStatus("before", [before], audit.getTime()).counties).toEqual({});

  const local = await Promise.all(jobs.map(async ({ source, run }) => ({ source, rows: await run(), checked })));
  const { snapshot, transitions } = mergeSources(before, [njdep, ...local], audit);
  const expected = Object.fromEntries(countiesInState("NJ").map(({ fips }) => [fips, "restricted"]));
  expect(Object.keys(expected)).toHaveLength(21);
  expect(projectMapStatus("after", [snapshot], audit.getTime()).counties).toEqual(expected);
  expect(transitions).toEqual([]);
  for (const row of Object.values(snapshot.counties)) {
    const decision = countyDecision(row, audit.getTime());
    expect(decision).toMatchObject({ status: "restricted", scope: "part", standing: true });
    expect(decision.countywide).toBeUndefined();
  }
  expect(countyDecision(snapshot.counties["34021"], audit.getTime()).orders).toContainEqual(
    expect.objectContaining({ scopeNote: "Hopewell Township in Mercer County" }),
  );
});

test("an ordinance edit, changed PDF edition, or missing published rule prevents renewal", async () => {
  const [atlantic, bergen] = jobs;
  const changed = atlantic.bytes.toString("utf8").replace("responsible individual", "supervising adult");
  expect(changed).not.toBe(atlantic.bytes.toString("utf8"));
  await expect(atlantic.parse(new Response(changed), audit)).rejects.toThrow("reviewed local burning rule changed");
  await expect(atlantic.parse(new Response("<p>Publisher landing page</p>"), audit)).rejects.toThrow("published eCode360 section");
  await expect(bergen.parse(new Response(null, {
    headers: { "content-type": "application/pdf", etag: '"a different edition"' },
  }), audit)).rejects.toThrow("reviewed local burning rule changed");

  const { snapshot } = mergeSources(null, [{ source: atlantic.source, rows: await atlantic.run(), checked }], audit);
  const stale = new Date(audit.getTime() + 48 * 60 * 60 * 1_000);
  expect(projectMapStatus("stale", [snapshot], stale.getTime()).counties).toEqual({});
});

test("every NJ county rule fixture parses under 5 ms p95 thread CPU", async () => {
  let maxP95 = 0;
  let slowest = "";
  for (const { source, run } of jobs) {
    for (let i = 0; i < 5; i++) await run();
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const start = process.threadCpuUsage();
      await run();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1_000);
    }
    const p95 = samples.sort((a, b) => a - b)[28];
    if (p95 > maxP95) {
      maxP95 = p95;
      slowest = source.id;
    }
    expect(p95).toBeLessThan(5);
  }
  console.log(`NJ standing rule fixture p95 max ${maxP95.toFixed(3)} ms thread CPU (${slowest})`);
});
