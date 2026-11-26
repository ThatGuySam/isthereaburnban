// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { latestWpNotice } from "../lib/wordpress";
import { parseLaketownNotices, parseSolonNotices } from "./local-notices";

const read = (name) => readFileSync(new URL(`./fixtures/${name}-wp-notices-2026-11-25.json`, import.meta.url), "utf8");
const solon = read("solon");
const laketown = read("laketown");
const captured = new Date("2026-11-25T06:44:00Z");
const asOf = (fixture, now) => JSON.parse(fixture).filter(({ date_gmt }) => Date.parse(`${date_gmt}Z`) <= now.getTime());

test("Solon's restored permits supersede its dated issue and continuation", () => {
  const issue = new Date("2026-07-13T20:00:00Z");
  const continuation = new Date("2026-07-18T12:00:00Z");
  const lift = new Date("2026-07-27T14:00:00Z");
  expect(parseSolonNotices(asOf(solon, issue), issue)).toMatchObject([{
    fips: "26081", status: "restricted", scope: "part", scopeNote: "Solon Township",
    officialUrl: "https://solonfire.org/burn-ban-in-effect-9/",
  }]);
  expect(parseSolonNotices(asOf(solon, continuation), continuation)).toMatchObject([{
    status: "restricted", officialUrl: "https://solonfire.org/burn-ban-continues/",
  }]);
  expect(parseSolonNotices(asOf(solon, lift), lift)).toEqual([]);
  expect(parseSolonNotices(JSON.parse(solon), captured)).toEqual([]);
  const stale = new Date("2026-07-25T12:00:00Z");
  expect(parseSolonNotices(asOf(solon, stale), stale)).toEqual([]);
});

test("Laketown uses the scope and dates of the actual permit suspension", () => {
  const september = new Date("2025-09-20T14:00:00Z");
  expect(parseLaketownNotices(asOf(laketown, september), september)).toMatchObject([{
    fips: "26005", status: "restricted", scope: "part", scopeNote: "Laketown Township",
    since: "2025-09-19", validUntil: "2025-09-21T04:00:00.000Z",
  }]);
  const weekend = new Date("2023-06-03T12:00:00Z");
  expect(parseLaketownNotices(asOf(laketown, weekend), weekend)).toMatchObject([{
    fips: "26005", status: "restricted", scope: "part",
    scopeNote: "Laketown Township and the part of Fillmore Township served by Graafschap Fire Department",
    validUntil: "2023-06-05T04:00:00.000Z",
  }]);
  const expired = new Date("2023-06-05T04:00:00.000Z");
  expect(parseLaketownNotices(asOf(laketown, expired), expired)).toEqual([]);
  expect(parseLaketownNotices(JSON.parse(laketown), captured)).toEqual([]);
});

test("latest WordPress notice checks dates, page completeness and article identity", () => {
  const [lift, , continuation] = JSON.parse(solon);
  const select = (items, options) => latestWpNotice(items, {
    site: "https://solonfire.org/", now: captured, limit: 50, matches: (title) => /burn ban/i.test(title), ...options,
  });
  expect(select([continuation, lift]).url).toBe(lift.link);
  expect(select([])).toBeUndefined();
  expect(() => select([lift], { limit: 1 })).toThrow("page limit");
  expect(() => select([lift, lift])).toThrow("duplicate");
  expect(() => select([lift, { ...continuation, date_gmt: lift.date_gmt }])).toThrow("Ambiguous");
  expect(() => select([{ ...lift, date_gmt: "2026-12-01T00:00:00" }])).toThrow("Invalid");
  expect(() => select([{ ...lift, link: "https://example.com/burn-ban-lifted" }])).toThrow("Invalid");
});

test("both real WordPress notice fixtures parse under 5 ms p95", () => {
  for (const [fixture, parse] of [[solon, parseSolonNotices], [laketown, parseLaketownNotices]]) {
    const run = () => parse(JSON.parse(fixture), captured);
    for (let i = 0; i < 10; i++) run();
    const samples = Array.from({ length: 30 }, () => {
      const start = process.threadCpuUsage();
      run();
      const { user, system } = process.threadCpuUsage(start);
      return (user + system) / 1_000;
    }).sort((a, b) => a - b);
    expect(samples[28]).toBeLessThan(5);
  }
});
