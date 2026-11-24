// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { mdSummerAir, parseMdSummerAir } from "./summer-air";
import { mdDnrWoodland, parseMdWoodland } from "./woodland";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.html`, import.meta.url), "utf8");
const forest = fixture("dnr-woodland");
const air = fixture("comar-26.11.07.03");
const captured = new Date("2026-11-24T13:26:23Z");
const summer = new Date("2027-06-01T04:00:00Z");
const woodlandAt = async (now = captured, html = forest) => parseMdWoodland(await extractHtml(html), now);
const airAt = async (now = captured, html = air) => parseMdSummerAir(await extractHtml(html), now);

test("Maryland's standing woodland rule reaches covered areas of 23 counties year-round", async () => {
  const rows = await woodlandAt();
  expect(rows.map(({ fips }) => fips)).toEqual(countiesInState("MD").filter(({ fips }) => fips !== "24510").map(({ fips }) => fips));
  expect(rows).toHaveLength(23);
  for (const row of rows) expect(row).toMatchObject({
    status: "restricted", scope: "part", scopeNote: expect.stringContaining("outside incorporated towns"),
    checked: captured.toISOString(), sourceUpdated: null, since: null, expires: null,
    validFrom: "2026-11-24T05:00:00.000Z", validUntil: "2026-11-26T05:00:00.000Z",
    note: expect.stringContaining("Snow cover lifts the hours limit"),
  });
  expect(await airAt()).toEqual([]);
  const { snapshot } = mergeSources(null, [{ source: mdDnrWoodland, rows, checked: captured.toISOString() }], captured);
  expect(snapshot.counties["24045"]).toMatchObject({ status: "restricted", orders: [{ scope: "part", status: "restricted" }] });
  expect(snapshot.counties["24510"]).toBeUndefined();
});

test("the summer restriction maps only the listed jurisdictions and follows Eastern dates", async () => {
  const rows = await airAt(summer);
  expect(rows.map(({ fips }) => fips).sort()).toEqual([
    "24003", "24005", "24009", "24013", "24015", "24017", "24021", "24025", "24027", "24031", "24033", "24510",
  ]);
  for (const row of rows) expect(row).toMatchObject({
    status: "restricted", scope: "county", note: expect.stringContaining("recreational fires"),
    validFrom: "2027-06-01T04:00:00.000Z", validUntil: "2027-06-03T04:00:00.000Z",
  });
  const seasonEnd = await airAt(new Date("2027-09-01T03:59:59Z"));
  expect(seasonEnd).toHaveLength(12);
  expect(seasonEnd[0].validUntil).toBe("2027-09-01T04:00:00.000Z");
  expect(await airAt(new Date("2027-09-01T04:00:00Z"))).toEqual([]);
});

test("missing, ambiguous and changed rule text fails closed", async () => {
  for (const html of [forest.replace("Open Air Burning</h3>", "Fire Information</h3>"),
    forest.replace("4 p.m.", "weather-dependent hours"), `${forest}${forest}`]) {
    expect(html).not.toBe(forest);
    await expect(woodlandAt(captured, html)).rejects.toThrow("reviewed woodland burning guidance changed or is missing");
  }
  for (const html of [air.replace("August 31", "September 30"), air.replaceAll("Calvert, Carroll, Cecil", "Calvert, Caroline, Cecil"),
    air.replace("Open fires for recreational purposes", "No exceptions for recreational fires"),
    air.replace("C.</span> Prohibition on Open Burning.", "C.</span> Advisory on Open Burning.")]) {
    expect(html).not.toBe(air);
    await expect(airAt(captured, html)).rejects.toThrow("reviewed summer burning clause changed or is missing");
  }
});

test("overlapping recurring rules preserve the woodland scope and avoid alerts or all-clears", async () => {
  const checked = "2027-05-31T13:00:00.000Z";
  const sources = [mdDnrWoodland, mdSummerAir];
  const rows = await Promise.all([woodlandAt(new Date(checked)), airAt(new Date(checked))]);
  const inputs = sources.map((source, index) => ({ source, rows: rows[index], checked }));
  for (const source of sources) expect(source).toMatchObject({ recurring: true, mode: "positive-only" });
  const prior = mergeSources(null, inputs, new Date("2027-06-01T03:59:59Z"));
  const next = mergeSources(prior.snapshot, inputs, summer);
  expect(prior.snapshot.counties["24510"]).toBeUndefined();
  expect(next.snapshot.counties["24510"]).toMatchObject({ status: "restricted", sourceId: mdSummerAir.id });
  expect(next.snapshot.counties["24005"]).toMatchObject({
    status: "restricted", sourceId: mdSummerAir.id, orders: [{ scope: "part", sourceId: mdDnrWoodland.id }],
  });
  expect(next.snapshot.counties["24045"]).toMatchObject({ status: "restricted", sourceId: mdDnrWoodland.id });
  expect(next.transitions).toEqual([]);
  const expired = mergeSources(next.snapshot, inputs, new Date("2027-06-02T04:00:00Z"));
  expect(expired.snapshot.counties["24510"]).toBeUndefined();
  expect(expired.transitions).toEqual([]);
});

test("both Maryland fixtures use less than 4 ms combined p95 thread CPU", async () => {
  const parse = async () => {
    await woodlandAt(summer);
    await airAt(summer);
  };
  for (let i = 0; i < 15; i++) await parse();
  const samples = [];
  for (let i = 0; i < 60; i++) {
    const start = process.threadCpuUsage();
    await parse();
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
});
