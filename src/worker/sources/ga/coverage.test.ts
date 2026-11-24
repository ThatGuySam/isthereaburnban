// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractHtml, parseHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { gaEpdNonSummer, gaEpdSummer, parseEpdSeasonal } from "./epd";
import { gaGwinnett, parseGwinnett } from "./gwinnett";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.html`, import.meta.url), "utf8");
const summer = fixture("epd-summer");
const nonSummer = fixture("epd-non-summer");
const gwinnett = fixture("gwinnett");
const captured = new Date("2026-11-24T05:57:00Z");
const decisionDay = new Date("2026-11-23T16:00:00Z");
const parseDaily = (html = gwinnett, at = decisionDay) => parseGwinnett(parseHtml(html), at);

test("Georgia EPD's official maps distinguish the 19 and 35 summer counties and 27 October–April counties", async () => {
  const summerRows = parseEpdSeasonal(await extractHtml(summer), new Date("2026-07-01T14:00Z"), "summer");
  expect(summerRows).toHaveLength(54);
  expect(summerRows.filter(({ note }) => note.includes("prescribed burning here"))).toHaveLength(19);
  expect(summerRows.find(({ county }) => county === "Gwinnett County")?.note).toContain("prescribed burning here");
  const laterRows = parseEpdSeasonal(await extractHtml(nonSummer), captured, "nonSummer");
  expect(laterRows).toHaveLength(27);
  expect(laterRows.every(({ status, scope }) => status === "restricted" && scope === "county")).toBe(true);
  expect(laterRows.find(({ fips }) => fips === "13135")).toMatchObject({
    label: "October–April open burning restrictions",
    validFrom: "2026-11-24T05:00:00.000Z", validUntil: "2026-11-25T05:00:00.000Z", sourceUpdated: null,
  });
  expect(laterRows.some(({ county }) => county === "Banks County" || county === "Chatham County")).toBe(false);
  expect([gaEpdSummer.recurring, gaEpdNonSummer.recurring]).toEqual([true, true]);
});

test("Georgia EPD changes seasons at Eastern midnight and fails on layout, date, activity or county changes", () => {
  for (const [time, summerCount, otherCount] of [
    ["2026-05-01T03:59:59Z", 0, 27], ["2026-05-01T04:00:00Z", 54, 0],
    ["2026-10-01T03:59:59Z", 54, 0], ["2026-10-01T04:00:00Z", 0, 27],
  ]) {
    const at = new Date(time);
    expect(parseEpdSeasonal(parseHtml(summer), at, "summer")).toHaveLength(summerCount);
    expect(parseEpdSeasonal(parseHtml(nonSummer), at, "nonSummer")).toHaveLength(otherCount);
  }
  for (const html of [
    nonSummer.replace("Non-Summer Legal Burn Types", "Other rules"),
    nonSummer.replace("October 1", "October 15"),
    nonSummer.replace("12, and 13", "12, and 14"),
    nonSummer.replace("<li>Walker</li>", ""),
    nonSummer.replace(">Walker<", ">Chatham<"),
    nonSummer.replace(">Walker<", ">Walton<"),
  ]) expect(() => parseEpdSeasonal(parseHtml(html), captured, "nonSummer")).toThrow("GA EPD");
});

test("Gwinnett's real BURN DAY heading is advisory and expires at Eastern midnight", () => {
  const rows = parseDaily();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "13135", status: "unknown", scope: "part",
    scopeNote: "Gwinnett County Fire and EMS District, excluding the City of Loganville",
    since: "2026-11-23", validUntil: "2026-11-24T05:00:00.000Z", sourceUpdated: null,
  });
  expect(() => parseDaily(gwinnett, captured)).toThrow("decision date does not match 2026-11-24 Eastern");
  expect(() => parseDaily(gwinnett.replace("Monday", "Tuesday"))).toThrow("decision date does not match");
  expect(() => parseDaily(gwinnett.replace("BURN DAY in", "CHECK CONDITIONS in"))).toThrow("expected one dated");
  expect(() => parseDaily(gwinnett.replace(/<h2[^>]+>Monday[^]*?<\/h2>/, ""))).toThrow("expected one dated");
});

test("Gwinnett's explicit no-burn decision stays scoped and survives alongside the county EPD restriction", () => {
  const rows = parseDaily(gwinnett.replace("a BURN DAY in", "a NO BURN DAY in"));
  expect(rows[0]).toMatchObject({ status: "ban", scope: "part" });
  const local = { source: gaGwinnett, rows, checked: decisionDay.toISOString() };
  const statewide = { source: gaEpdNonSummer, rows: parseEpdSeasonal(parseHtml(nonSummer), decisionDay, "nonSummer"), checked: local.checked };
  const order = { status: "ban", scope: "part", scopeNote: expect.stringContaining("excluding the City of Loganville") };
  expect(mergeSources(null, [local], decisionDay).snapshot.counties["13135"]).toMatchObject({
    status: "restricted", orders: [order],
  });
  expect(mergeSources(null, [local, statewide], decisionDay).snapshot.counties["13135"]).toMatchObject({
    status: "restricted", scope: "county", sourceId: gaEpdNonSummer.id, orders: [order],
  });
});

test("Georgia fixture extraction and mapping p95 is under 5 ms for each source", async () => {
  const jobs = [
    async () => parseGwinnett(await extractHtml(gwinnett), decisionDay),
    async () => parseEpdSeasonal(await extractHtml(nonSummer), captured, "nonSummer"),
    async () => parseEpdSeasonal(await extractHtml(summer), new Date("2026-07-01T14:00Z"), "summer"),
  ];
  for (const job of jobs) {
    for (let i = 0; i < 20; i++) await job();
    const samples: number[] = [];
    for (let i = 0; i < 120; i++) {
      const start = performance.now();
      await job();
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    expect(samples[113]).toBeLessThan(5);
  }
});
