// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractHtml, parseHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { parseSdBlmRestrictions, sdBlmFireRestrictions } from "./blm";
import { parseBlackHillsPileBurning, sdBlackHillsPileBurning } from "./pile-burning";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const permit = fixture("pile-burning-2026-11-24.html").toString();
const blm = fixture("blm-current-2026-11-24.html").toString();
const order = fixture("blm-stage1-2026-10-01.pdf");
const readOrder = async () => new Response(order);
const now = new Date("2026-11-24T17:03:00Z");
const parsePermit = async () => parseBlackHillsPileBurning(await extractHtml(permit), now);
const parseBlm = () => parseSdBlmRestrictions(blm, now, readOrder);

test("South Dakota publishes ten scoped summaries and keeps both orders where scopes overlap", async () => {
  const permitRows = await parsePermit();
  expect(permitRows.map(({ fips }) => fips)).toEqual(["46033", "46047", "46081", "46093", "46103"]);
  expect(permitRows[0]).toMatchObject({
    scope: "part", scopeNote: "Private-land slash piles in the Black Hills Forest Fire Protection District",
    status: "restricted", since: null, expires: null, sourceUpdated: null,
  });
  expect(permitRows[0].note).toMatch(/2 inches .* 6 inches/);

  const blmRows = await parseBlm();
  expect(blmRows.map(({ fips }) => fips)).toEqual([
    "46019", "46033", "46047", "46055", "46081", "46093", "46103", "46105", "46117", "46137",
  ]);
  expect(blmRows[0]).toMatchObject({
    scope: "part",
    status: "restricted", since: "2026-10-01", expires: null, validFrom: "2026-10-01T06:01:00.000Z",
  });
  expect(blmRows[0].scopeNote).toContain("BLM lands");
  expect(blmRows[0].sourceUrl).toContain("FPO-SD-Stage1-Oct01-2026.pdf");

  const checked = now.toISOString();
  const inputs = [
    { source: sdBlackHillsPileBurning, rows: permitRows, checked, staleMs: sdBlackHillsPileBurning.staleMs },
    { source: sdBlmFireRestrictions, rows: blmRows, checked, staleMs: sdBlmFireRestrictions.staleMs },
  ];
  for (const { source } of inputs) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ coverage: "restrictions", mode: "positive-only", scope: "part" });
  }
  const { snapshot } = mergeSources(null, inputs, now);
  expect(Object.values(snapshot.counties)).toHaveLength(10);
  expect(Object.values(snapshot.counties).every(({ status, scope }) => status === "restricted" && scope === "part")).toBe(true);
  expect(snapshot.counties["46033"].orders.map(({ sourceId }) => sourceId)).toEqual([
    sdBlackHillsPileBurning.id, sdBlmFireRestrictions.id,
  ]);

  const afterFailures = mergeSources(snapshot, inputs.map((input) => ({
    ...input, lastGood: checked, error: "HTTP request failed",
  })), new Date("2026-11-25T20:03:00Z"));
  expect(Object.values(afterFailures.snapshot.counties).every(({ status }) => status === "unknown")).toBe(true);
});

test("South Dakota permit rows with unknown wording or geography establish no status", () => {
  const parse = (html) => parseBlackHillsPileBurning(parseHtml(html), now);
  expect(parse(permit.replace("Custer</font>", "Butte</font>")).map(({ fips }) => fips))
    .toEqual(["46047", "46081", "46093", "46103"]);
  expect(parse(permit.replace("2 inches of snow required", "Unknown")).map(({ fips }) => fips))
    .toEqual(["46047", "46081", "46093", "46103"]);
  expect(() => parse(permit.replace("Custer</font>", "Lawrence</font>"))).toThrow("duplicate condition");
  expect(() => parse(permit.replace("gvConditions", "gvArchive"))).toThrow("Missing or changed HTML status table");
  expect(() => parse(permit.replaceAll("2 inches", "No snow"))).toThrow("no recognized district");
  expect(parse(permit.replace("6 inches", "8 inches"))[0].note).toContain("8 inches for large piles");
});

test("South Dakota BLM requires the current source notice and reviewed signed order", async () => {
  const unavailable = async () => { throw new Error("Should not fetch the order"); };
  for (const changed of [
    blm.replace("currently in effect", "rescinded"),
    blm.replace("FPO-SD-Stage1", "Replacement-Stage1"),
    blm + blm,
    "<h1>South Dakota Fire Restrictions</h1>",
  ]) {
    await expect(parseSdBlmRestrictions(changed, now, unavailable)).rejects.toThrow("current notice or order link changed");
  }
  await expect(parseSdBlmRestrictions(blm, now, async () => new Response("%PDF-other order")))
    .rejects.toThrow("signed order changed");
  expect(await parseSdBlmRestrictions(blm, new Date("2026-10-01T06:00:59Z"), unavailable)).toEqual([]);
});

test("South Dakota fixtures stay below 4 ms p95 thread CPU", async () => {
  for (const parse of [parsePermit, parseBlm]) {
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
