// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { parseRapidanAlerts, vaRapidanAlerts } from "./rapidan";
import { parseVirginiaSeasonal, vaSeasonal } from "./seasonal";
import { parseShenandoahAlerts, vaShenandoahAlerts } from "./shenandoah";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const statute = fixture("section-10.1-1142-2026-11-24.html");
const rapidan = fixture("rapidan-wma-2026-11-24.html");
const park = fixture("shen-park-alerts-2026-11-24.json");
const today = new Date("2026-11-24T13:01:00Z");
const spring = new Date("2027-02-15T05:00:00Z");
const parkAlert = (alert) => alert.title.startsWith("Fire Restriction begins");
const statuteAt = async (when = today, html = statute) => parseVirginiaSeasonal(await extractHtml(html), when);
const rapidanAt = async (html = rapidan) => parseRapidanAlerts(await extractHtml(html), today);

test("Virginia's 4 p.m. rule applies only within covered areas and Eastern spring windows", async () => {
  expect(vaSeasonal.recurring).toBe(true);
  expect(await statuteAt()).toEqual([]);
  const opening = await statuteAt(spring);
  const next = (await statuteAt(new Date("2027-02-15T21:00:00Z"))).find(({ fips }) => fips === "51600");
  expect(new Set(opening.map(({ fips }) => fips)).size).toBe(133);
  expect(opening.every(({ status, scope }) => status === "restricted" && scope === "part")).toBe(true);
  expect(opening[0]).toMatchObject({ validFrom: "2027-02-15T05:00:00.000Z", validUntil: "2027-02-15T21:00:00.000Z" });
  expect(next).toMatchObject({ validFrom: "2027-02-16T05:00:00.000Z", validUntil: "2027-02-16T21:00:00.000Z" });
  const last = await statuteAt(new Date("2027-04-30T19:59:59Z"));
  expect(last).toHaveLength(133);
  expect(last[0].validUntil).toBe("2027-04-30T20:00:00.000Z");
  expect(await statuteAt(new Date("2027-04-30T20:00:00Z"))).toEqual([]);
  await expect(statuteAt(today, statute.replace("April 30", "April 20"))).rejects.toThrow("burning clauses changed");
});

test("NPS maps the park-wide fire ban to eight partial county scopes and uses the stated start", () => {
  const rows = parseShenandoahAlerts(JSON.parse(park), today);
  expect(rows.map(({ fips }) => fips).sort()).toEqual([
    "51003", "51015", "51079", "51113", "51139", "51157", "51165", "51187",
  ]);
  for (const row of rows) expect(row).toMatchObject({
    status: "ban", scope: "part", scopeNote: "Within Shenandoah National Park", since: "2026-11-21", expires: null,
    validFrom: "2026-11-21T13:00:00.000Z", validUntil: "2026-11-25T04:59:00.000Z",
  });
});

test("NPS omits absent, expired, lifted and disabled alerts and rejects unexpected inputs", () => {
  const input = JSON.parse(park);
  const alert = input.find(parkAlert);
  expect(parseShenandoahAlerts(input.filter((item) => !parkAlert(item)), today)).toEqual([]);
  expect(parseShenandoahAlerts(input, new Date("2026-11-25T04:59:00Z"))).toEqual([]);
  expect(parseShenandoahAlerts([{ ...alert, is_active: 0 }], today)).toEqual([]);
  expect(parseShenandoahAlerts([{ ...alert, title: "Fire Restriction Lifted" }], today)).toEqual([]);
  expect(() => parseShenandoahAlerts([{ ...alert, is_active: 2 }], today)).toThrow();
  expect(() => parseShenandoahAlerts([{ ...alert, site_code: "other" }], today)).toThrow("unexpected park code");
  expect(() => parseShenandoahAlerts([{ ...alert, end_date: "November, 31 2026 23:59:00" }], today)).toThrow("unrecognized alert timestamp");
  expect(() => parseShenandoahAlerts([{ ...alert, description: "Only one campground is affected." }], today))
    .toThrow("unrecognized park fire restriction");
});

test("Rapidan confirms an open-ended order inside the WMA and handles changed notices safely", async () => {
  const titled = rapidan.replace("Rapidan WMA:</span>", "Rapidan WMA: Fires Prohibited</span>");
  expect((await rapidanAt(titled)).map(({ fips }) => fips)).toEqual(["51079", "51113"]);
  const rows = await rapidanAt();
  expect(rows.map(({ fips }) => fips).sort()).toEqual(["51079", "51113"]);
  for (const row of rows) expect(row).toMatchObject({
    status: "ban", scope: "part", scopeNote: "Within Rapidan Wildlife Management Area",
    since: "2026-11-21", expires: null, validFrom: "2026-11-21T13:00:00.000Z",
  });
  expect(await rapidanAt(rapidan.replace(/<section class="alerts">.*?<\/section>/, ""))).toEqual([]);
  expect(await rapidanAt(rapidan.replace(/<span class="alert_description">.*?<\/span>/,
    '<span class="alert_description">The fire ban has been lifted.</span>'))).toEqual([]);
  await expect(rapidanAt(rapidan.replace("Madison and Greene Counties", "Madison County"))).rejects.toThrow("county footprint changed");
  await expect(rapidanAt(rapidan.replace("8 a.m.", "25 a.m."))).rejects.toThrow("unrecognized Rapidan fire restriction time");
  await expect(rapidanAt(rapidan.replace("only affects Rapidan WMA", "affects two WMAs"))).rejects.toThrow("unrecognized Rapidan fire restriction terms");
});

test("Virginia's November restrictions stay scoped, overlap in two counties, and expire to unknown", async () => {
  const checked = today.toISOString();
  const inputs = [
    { source: vaSeasonal, rows: await statuteAt(), checked },
    { source: vaShenandoahAlerts, rows: parseShenandoahAlerts(JSON.parse(park), today), checked, staleMs: vaShenandoahAlerts.staleMs },
    { source: vaRapidanAlerts, rows: await rapidanAt(), checked, staleMs: vaRapidanAlerts.staleMs },
  ];
  const { snapshot } = mergeSources(null, inputs, today);
  const counts = Object.groupBy(countiesInState("VA"), ({ fips }) => snapshot.counties[fips]?.status ?? "unknown");
  expect(Object.fromEntries(Object.entries(counts).map(([status, counties]) => [status, counties.length])))
    .toEqual({ restricted: 8, unknown: 125 });
  for (const fips of ["51079", "51113"]) {
    expect(snapshot.counties[fips].orders.map(({ scopeNote }) => scopeNote))
      .toEqual(["Within Shenandoah National Park", "Within Rapidan Wildlife Management Area"]);
  }
  const stale = mergeSources(snapshot, inputs, new Date("2026-11-24T19:02:00Z"));
  expect(Object.values(stale.snapshot.counties).every(({ status }) => status === "unknown")).toBe(true);
  expect(stale.transitions).toEqual([]);
});

test("Virginia fixtures and the in-season calendar stay below 4 ms p95 thread CPU", async () => {
  const run = async () => {
    await statuteAt(spring);
    parseShenandoahAlerts(JSON.parse(park), today);
    await rapidanAt();
  };
  for (let index = 0; index < 15; index++) await run();
  const samples = [];
  for (let index = 0; index < 60; index++) {
    const start = process.threadCpuUsage();
    await run();
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
});
