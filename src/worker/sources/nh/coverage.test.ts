// @ts-nocheck -- bun test types are not installed; this file runs under Bun.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { forestServiceAlertCards } from "../lib/usfs";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { nhOpenBurningPermits, parseNhOpenBurning } from "./open-burning";
import { nhTownHallRoad, parseTownHallRoad } from "./town-hall-road";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.html`, import.meta.url), "utf8");
const statute = fixture("rsa-227-l-17");
const listing = fixture("usfs-alerts");
const detail = fixture("usfs-town-hall-road");
const now = new Date("2026-11-24T16:20:16Z");
const readDetail = async () => detail;

test("NH applies the standing permit rule in all ten counties and preserves the Carroll County order", async () => {
  expect(SOURCES).toContain(nhOpenBurningPermits);
  expect(SOURCES).toContain(nhTownHallRoad);
  expect(nhOpenBurningPermits).toMatchObject({ mode: "positive-only", coverage: "restrictions", recurring: true });
  expect(nhTownHallRoad).toMatchObject({ mode: "positive-only", coverage: "restrictions", scope: "part" });
  const stateRows = await parseNhOpenBurning(statute, now);
  const orderRows = await parseTownHallRoad(listing, readDetail, now);
  expect(stateRows.map(({ fips }) => fips).sort()).toEqual([
    "33001", "33003", "33005", "33007", "33009", "33011", "33013", "33015", "33017", "33019",
  ]);
  expect(stateRows.every((row) => row.scope === "state" && row.status === "restricted" &&
    row.validFrom === "2026-11-24T05:00:00.000Z" && row.validUntil === "2026-11-26T05:00:00.000Z")).toBe(true);
  expect(orderRows).toHaveLength(1);
  expect(orderRows[0]).toMatchObject({
    fips: "33003", scope: "part", status: "restricted", since: "2026-06-01", expires: "2031-06-01",
    validUntil: "2031-06-01T04:00:00.000Z",
  });
  const checked = now.toISOString();
  const { snapshot } = mergeSources(null, [
    { source: nhOpenBurningPermits, rows: stateRows, checked },
    { source: nhTownHallRoad, rows: orderRows, checked },
  ], now);
  expect(snapshot.counties["33003"]).toMatchObject({ status: "restricted", orders: [{
    sourceId: nhTownHallRoad.id,
    scopeNote: "National Forest lands within a quarter mile of the signed road segments in Jackson and Chatham",
  }] });
  expect(snapshot.counties["33007"]).toMatchObject({ status: "restricted" });
  expect(snapshot.counties["33007"].orders).toBeUndefined();
});

test("NH rejects changed permit terms, order scope, identity and publisher dates", async () => {
  await expect(parseNhOpenBurning(statute.replace("covered with snow", "covered with water"), now)).rejects.toThrow("statute changed");
  await expect(parseTownHallRoad(listing.replace("#R9‑22‑05‑26‑04", "#unknown"), readDetail, now)).rejects.toThrow("listing changed");
  await expect(parseTownHallRoad(listing.replace("June 8, 2026", "June 8, 2027"), readDetail, now)).rejects.toThrow("listing changed");
  await expect(parseTownHallRoad(listing, async () => detail.replace("Jackson and Chatham", "Jackson and Bartlett"), now))
    .rejects.toThrow("order changed");
  await expect(parseTownHallRoad(listing, async () => detail.replace("June 1, 2031", "June 2, 2031"), now))
    .rejects.toThrow("order changed");
});

test("the reviewed NH law survives an HTTP outage and expires on its review date", async () => {
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Origin temporarily unavailable", { status: 520 });
  try {
    const result = await nhOpenBurningPermits.fetch({ now });
    expect(result.fallback).toMatchObject({ reviewedAt: expect.any(String), reason: expect.stringContaining("520") });
    expect(result.rows).toHaveLength(10);
    expect(result.rows[0]).toMatchObject({ status: "restricted", note: expect.stringContaining("last reviewed") });
    await expect(nhOpenBurningPermits.fetch({ now: new Date(result.fallback.reviewBy) })).rejects.toThrow("review window");
  } finally {
    globalThis.fetch = fetch;
  }
});

test("the USFS reader uses current alert cards and an absent or expired order stays unknown", async () => {
  const withoutOrder = listing.replace(/<li class="usa-card usa-card--flag wfs-alert-flag caution">(?:(?!<\/li>)[\s\S])*?Town Hall Road[\s\S]*?<\/li>/, "");
  const archiveLink = '<nav><a href="/r09/whitemountain/alerts/town-hall-road-camping-and-fire-restrictions">Town Hall Road</a></nav>';
  expect((await forestServiceAlertCards(withoutOrder + archiveLink)).some(({ title }) => title.includes("Town Hall Road"))).toBe(false);
  await expect(forestServiceAlertCards(archiveLink)).rejects.toThrow("missing alerts view");
  const unused = async () => { throw new Error("detail should not be requested"); };
  expect(await parseTownHallRoad(withoutOrder + archiveLink, unused, now)).toEqual([]);
  expect(await parseTownHallRoad(listing, unused, new Date("2031-06-01T04:00:00Z"))).toEqual([]);
});

test("NH fixture parsers stay below 4 ms p95 thread CPU", async () => {
  for (const parse of [() => parseNhOpenBurning(statute, now), () => parseTownHallRoad(listing, readDetail, now)]) {
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
