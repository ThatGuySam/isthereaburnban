// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractHtml, parseHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { hiCabNoBurnPeriods, parseHiNoBurnPeriods } from "./no-burn-periods";
import { hiCabOpenBurning, parseHiOpenBurning } from "./open-burning";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.html`, import.meta.url), "utf8");
const bulletin = fixture("cab-no-burn");
const guidance = fixture("cab-open-burning");
const now = new Date("2026-11-24T17:14:33Z");
const parseNotices = async () => parseHiNoBurnPeriods(await extractHtml(bulletin), now);
const parseRules = () => parseHiOpenBurning(guidance, now);

test("Hawaiʻi bulletin covers three districts and keeps the published HST expiration", async () => {
  const rows = await parseNotices();
  expect(parseHiNoBurnPeriods(parseHtml(bulletin), now)).toEqual(rows);
  expect(rows.map(({ fips, status, scope, scopeNote, expires, validUntil, sourceUpdated }) =>
    [fips, status, scope, scopeNote.split(",")[0], expires, validUntil, sourceUpdated])).toEqual([
    ["15001", "ban", "part", "North Kona District", "2026-11-30", "2026-11-30T22:00:00.000Z", null],
    ["15001", "ban", "part", "South Kona District", "2026-11-30", "2026-11-30T22:00:00.000Z", null],
    ["15001", "ban", "part", "Kaʻū District", null, undefined, null],
  ]);
  const atNoon = parseHiNoBurnPeriods(parseHtml(bulletin), new Date("2026-11-30T22:00:00Z"));
  expect(atNoon).toEqual([{ ...rows[2], checked: "2026-11-30T22:00:00.000Z" }]);
});

test("Hawaiʻi bulletin rejects changed terms, unknown districts and invalid deadlines", () => {
  const parse = (html) => parseHiNoBurnPeriods(parseHtml(html), now);
  for (const [old, replacement, error] of [
    ["a waiver is provided", "a permit is present", "HTML panel markers"],
    ["is issuing a mandatory", "may issue a mandatory", "invalid no-burn panel"],
    ["Kau District", "New District", "unmapped district"],
    ["HAWAII ISLAND", "MAUI ISLAND", "unrecognized notice area"],
    ["12 noon", "sometime", "unrecognized notice deadline"],
    ["Monday, November 30", "Tuesday, November 30", "unrecognized notice deadline"],
    ["Kau District", "North Kona District", "duplicate notice"],
  ]) {
    expect(() => parse(bulletin.replace(old, replacement))).toThrow(error);
  }
  expect(parse(bulletin.replace(/<table\b[\s\S]*?<\/table>/, ""))).toEqual([]);
  expect(() => parse("<h1>Access Denied</h1>")).toThrow("homepage changed or is missing");
});

test("standing rules mark all five counties restricted and preserve local no-burn orders", async () => {
  const checked = now.toISOString();
  const rows = await parseRules();
  expect(hiCabOpenBurning.recurring).toBe(true);
  expect(hiCabNoBurnPeriods.recurring).toBeUndefined();
  expect(rows.map(({ fips }) => fips)).toEqual(["15001", "15003", "15005", "15007", "15009"]);
  expect(rows.every(({ status, scope }) => status === "restricted" && scope === "state")).toBe(true);
  expect(rows[0]).toMatchObject({
    validFrom: "2026-11-24T10:00:00.000Z", validUntil: "2026-11-26T10:00:00.000Z",
  });

  const notices = { source: hiCabNoBurnPeriods, rows: await parseNotices(), checked };
  const { snapshot } = mergeSources(null, [{ source: hiCabOpenBurning, rows, checked }, notices], now);
  expect(Object.values(snapshot.counties).map(({ status }) => status)).toEqual(Array(5).fill("restricted"));
  expect(snapshot.counties["15001"].orders.map(({ status }) => status)).toEqual(["ban", "ban", "ban"]);
  expect(snapshot.counties["15005"].orders).toBeUndefined();
  const expired = mergeSources(null, [{ ...notices, staleMs: hiCabNoBurnPeriods.staleMs }],
    new Date(now.getTime() + hiCabNoBurnPeriods.staleMs + 1));
  expect(expired.snapshot.counties["15001"].status).toBe("unknown");
  expect(expired.snapshot.counties["15009"]).toBeUndefined();

  await expect(parseHiOpenBurning(guidance.replace("must obtain an AGP", "may obtain an AGP"), now))
    .rejects.toThrow("reviewed open-burning guidance changed");
});

test("Hawaiʻi fixtures stay below 4 ms p95 thread CPU", async () => {
  for (const parse of [parseNotices, parseRules]) {
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
