// @ts-expect-error Bun provides the test module at runtime.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SOURCES } from "../registry";
import { davisonBurnStatus, sdCountyBulletins, spinkBurnStatus, sullyBurnStatus, yanktonBurnStatus } from "./county-status";

const captured = new Date("2026-11-26T06:00:00Z");
const read = (file: string) => readFileSync(new URL(`./fixtures/county-pass/${file}`, import.meta.url), "utf8");
const fixtures: Record<string, string> = {
  "sd-davison-ema": read("davison.json"),
  "sd-spink-ema": read("spink.html"),
  "sd-sully-commission": read("sully.html"),
  "sd-yankton-ema": read("yankton.html"),
};

test("registered South Dakota county bulletins preserve the authority and its decision scope", async () => {
  for (const [bulletin, fips, status] of [
    [davisonBurnStatus, "46035", "none"],
    [spinkBurnStatus, "46115", "none"],
    [sullyBurnStatus, "46119", "restricted"],
    [yanktonBurnStatus, "46135", "none"],
  ] as const) {
    const { source, parse } = bulletin;
    expect(SOURCES).toContain(source);
    const scoped = source.id === "sd-sully-commission";
    expect(source).toMatchObject(scoped
      ? { mode: "positive-only", reportingFips: [fips] }
      : { mode: "full", expectedFips: [fips] });
    const rows = await parse(new Response(fixtures[source.id]), captured);
    expect(rows).toEqual([expect.objectContaining({
      fips, status, scope: scoped ? "part" : "county", officialUrl: source.officialUrl,
    })]);
  }
});

test("Yankton rejects expired, future, malformed and equivocal decisions", async () => {
  const { parse, source } = yanktonBurnStatus;
  const fixture = fixtures[source.id];
  const decide = (html: string, now = captured) => parse(new Response(html), now);
  expect(await decide(fixture, new Date("2026-11-30T06:00:00Z"))).toMatchObject([{ status: "unknown" }]);
  for (const date of ["11-27-2026", "11-31-2026"]) {
    expect(await decide(fixture.replace("11-23-2026", date))).toMatchObject([{ status: "unknown" }]);
  }
  expect(await decide(fixture.replace("is allowed", "may be allowed"))).toMatchObject([{ status: "unknown" }]);
  expect(await decide(fixture.replace("is allowed", "is not allowed"))).toMatchObject([
    { status: "ban", validUntil: "2026-11-30T06:00:00.000Z" },
  ]);
});

test("Spink deduplicates the repeated notice and rejects conflicting or future decisions", async () => {
  const { parse, source } = spinkBurnStatus;
  const decide = (html: string) => parse(new Response(html), captured);
  const fixture = fixtures[source.id];
  expect(await decide(fixture.replace("Burn Ban cancelled on", "Burn Ban in effect on"))).toMatchObject([{ status: "unknown" }]);
  expect(await decide(fixture.replaceAll("9/22/26", "12/1/26"))).toMatchObject([{ status: "unknown" }]);
  expect(await decide(fixture.replaceAll("Burn Ban cancelled on", "Burn Ban in effect on"))).toMatchObject([
    { status: "ban", since: "2026-09-22" },
  ]);
});

test("Davison ignores the illustrative ban language outside the current bulletin", async () => {
  const { parse, source } = davisonBurnStatus;
  const decide = (body: string) => parse(new Response(body), captured);
  const fixture = fixtures[source.id];
  expect(await decide(fixture.replace("BURN BAN INFORMATION:", "PAST BANS:"))).toMatchObject([{ status: "unknown" }]);
  expect(await decide(fixture.replace(/Davison County is not currently in a burn ban\.[^<]+/, "Davison County is currently under a burn ban.")))
    .toMatchObject([{ status: "ban" }]);
  await expect(decide(fixture.replace('"id":114', '"id":117'))).rejects.toThrow("Invalid public WordPress page");
});

test("Sully preserves the partial scope during an emergency and never converts a missing banner to an all-clear", async () => {
  const { parse, source } = sullyBurnStatus;
  const fixture = fixtures[source.id];
  const regular = "REGULAR BURN BAN ORDINANCE IN EFFECT, USE CAUTION.";
  expect(await parse(new Response(fixture.replace(regular, "")), captured)).toEqual([]);
  expect(await parse(new Response(fixture.replace(regular, "EMERGENCY BURN BAN IN EFFECT. NO OPEN BURNING ALLOWED")), captured))
    .toMatchObject([{ status: "ban", scope: "part", scopeNote: "Sully County outside municipalities and planned unit developments" }]);
});

test("SD county bulletin fixtures parse below 4 ms p95 thread CPU", async () => {
  for (const { source, parse } of sdCountyBulletins) {
    const run = () => parse(new Response(fixtures[source.id]), captured);
    for (let i = 0; i < 5; i++) await run();
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const start = process.threadCpuUsage();
      await run();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1_000);
    }
    expect(samples.sort((a, b) => a - b)[28]).toBeLessThan(4);
  }
});
