// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { statusFor } from "../../lookup";
import { countiesInState } from "../../counties";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { mtDeqFall, parseDeqFall } from "./deq-fall";
import { mtLocalBurningRules } from "./local-rules";
import { mtMissoulaSeasons, parseMissoulaSeasons } from "./missoula";

const read = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const now = new Date("2026-11-24T09:25:38Z");
const checked = now.toISOString();
const jobs = mtLocalBurningRules.map(({ source, parse, evidenceKind }) => {
  const suffix = evidenceKind === "pdf-etag" ? "json" : evidenceKind === "pdf" ? "pdf" : "html";
  const bytes = read(`${source.id.slice(3)}-2026-11-26.${suffix}`);
  const body = Uint8Array.from(bytes).buffer;
  const input = () => suffix === "json"
    ? new Response(null, { headers: JSON.parse(bytes.toString("utf8")) })
    : new Response(body);
  return { source, parse, input };
});
const rule = (id) => jobs.find(({ source }) => source.id === `mt-rule-${id}`);

test("Montana local rules preserve published scope and add only standing restrictions", async () => {
  const inputs = [];
  for (const { source, parse, input } of jobs) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ scope: "part", recurring: true, mode: "positive-only" });
    const rows = await parse(input(), now);
    for (const row of rows) {
      expect(source.reportingFips).toContain(row.fips);
      expect(row).toMatchObject({
        state: "MT", status: "restricted", standing: true, scope: "part", officialUrl: source.officialUrl,
      });
      expect(row.scopeNote).toBeTruthy();
    }
    inputs.push({ source, rows, checked });
  }
  const baseline = [
    { source: mtDeqFall, checked, rows: parseDeqFall(JSON.parse(read("deq-fall-2026-11-24.json").toString()), now) },
    { source: mtMissoulaSeasons, checked, rows: parseMissoulaSeasons(await extractHtml(read("missoula-2026-11-24.html").toString()), now) },
  ];
  const previous = mergeSources(null, baseline, now).snapshot;
  const { snapshot } = mergeSources(null, [...baseline, ...inputs], now);
  const added = Object.keys(snapshot.counties).filter((fips) => !previous.counties[fips]).sort();
  expect(added).toHaveLength(29);
  expect(added.every((fips) => statusFor(snapshot, fips, now.getTime()).status === "restricted")).toBe(true);
  expect(countiesInState("MT")
    .filter(({ fips }) => statusFor(snapshot, fips, now.getTime()).status === "unknown")
    .map(({ name }) => name.replace(/ County$/, ""))).toEqual([
    "Carter", "Daniels", "Liberty", "Meagher", "Sheridan", "Sweet Grass", "Toole", "Treasure", "Wheatland", "Wibaux",
  ]);
  expect(statusFor(snapshot, "30025", now.getTime()).orders).toEqual(expect.arrayContaining([
    expect.objectContaining({ scopeNote: "Baker Rural Fire District in Fallon County" }),
    expect.objectContaining({ scopeNote: "Plevna Rural Fire District in Fallon County" }),
  ]));
  expect(statusFor(snapshot, "30013", now.getTime()).orders).toContainEqual(
    expect.objectContaining({ scopeNote: "City of Great Falls" }),
  );
  expect(statusFor(snapshot, "30111", now.getTime()).orders).toContainEqual(
    expect.objectContaining({ scopeNote: expect.stringContaining("outside Billings, Broadview and Laurel") }),
  );
  expect(statusFor(snapshot, "30035", now.getTime()).orders).toContainEqual(
    expect.objectContaining({ scopeNote: "Glacier National Park" }),
  );
});

test("annual resolutions expire and recurring summer closures follow local dates", async () => {
  const carbon = rule("carbon-season");
  expect(await carbon.parse(carbon.input(), new Date("2026-12-31T23:00:00Z"))).toEqual([
    expect.objectContaining({
      since: "2026-01-01", expires: "2026-12-31", validUntil: "2027-01-01T07:00:00.000Z",
    }),
  ]);
  expect(await carbon.parse(carbon.input(), new Date("2027-01-01T07:00:00Z"))).toEqual([]);
  const summer = rule("flathead-summer");
  expect(await summer.parse(summer.input(), now)).toEqual([]);
  expect(await summer.parse(summer.input(), new Date("2027-07-01T06:00:00Z"))).toEqual([
    expect.objectContaining({ since: "2027-07-01", expires: "2027-09-30", validFrom: "2027-07-01T06:00:00.000Z" }),
  ]);
  const cskt = rule("flathead-reservation-debris");
  expect(await cskt.parse(cskt.input(), now)).toEqual([]);
  const december = await cskt.parse(cskt.input(), new Date("2026-12-01T07:00:00Z"));
  expect(december.map(({ fips }) => fips)).toEqual(["30029", "30047", "30063", "30089"]);
  expect(december.every(({ scopeNote }) => scopeNote === "Debris burning on the Flathead Indian Reservation")).toBe(true);
});

test("changed publisher rules require review before publishing another calendar window", async () => {
  const dawson = rule("dawson-permit");
  await expect(dawson.parse(new Response(null, { headers: { etag: '"changed"', "content-type": "application/pdf" } }), now))
    .rejects.toThrow("reviewed local burning rule changed");
  const greatFalls = rule("cascade-great-falls");
  const html = await greatFalls.input().text();
  await expect(greatFalls.parse(new Response(html.replace("November 30th", "October 31st")), now))
    .rejects.toThrow("reviewed local burning rule changed");
});

test("Montana standing rule fixtures parse under 5 ms p95 thread CPU", async () => {
  let maxP95 = 0;
  for (const { parse, input } of jobs) {
    for (let i = 0; i < 5; i++) await parse(input(), now);
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const response = input();
      const start = process.threadCpuUsage();
      await parse(response, now);
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    maxP95 = Math.max(maxP95, samples.sort((a, b) => a - b)[28]);
  }
  console.log(`MT local rules max p95 ${maxP95.toFixed(3)} ms thread CPU`);
  expect(maxP95).toBeLessThan(5);
});
