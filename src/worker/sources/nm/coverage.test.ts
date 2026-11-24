// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { nmAngelFirePermits, parseAngelFirePermits } from "./angel-fire";
import { nmBernalilloOpenBurning, nmOpenBurning, parseNmOpenBurning } from "./open-burning";
import { nmStateParks, parseNmStateParks } from "./state-parks";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.html`, import.meta.url));
const parks = fixture("state-parks").toString("utf8");
const village = fixture("angel-fire").toString("utf8");
const stateCode = fixture("open-burning-nmac");
const bernalilloCode = fixture("bernalillo-open-burning-nmac");
const captured = new Date("2026-11-24T14:00:00Z");
const bytes = (buffer: Buffer) => Uint8Array.from(buffer).buffer;
const parseState = (buffer = stateCode) => parseNmOpenBurning(bytes(buffer), "state", captured);
const parseBernalillo = (buffer = bernalilloCode) => parseNmOpenBurning(bytes(buffer), "bernalillo", captured);

test("the State Parks active listing yields park-only orders across 12 counties", async () => {
  const rows = await parseNmStateParks(parks, captured);
  expect(rows).toHaveLength(17);
  expect(new Set(rows.map(({ fips }) => fips)).size).toBe(12);
  expect(rows.every(({ scope }) => scope === "part")).toBe(true);
  expect(rows.filter(({ scopeNote }) => scopeNote.startsWith("Navajo Lake"))).toEqual(
    ["35039", "35045"].map((fips) => expect.objectContaining({ fips, status: "restricted", scope: "part" })),
  );
  expect(rows).toContainEqual(expect.objectContaining({
    fips: "35013", status: "ban", expires: "2027-01-31", validUntil: "2027-02-01T07:00:00.000Z",
    officialUrl: expect.stringMatching(/\/WebDisplay\/Detail\/38$/),
  }));
  expect(rows.some(({ scopeNote }) => /Bluewater|Santa Rosa|Rio Grande Nature/.test(scopeNote))).toBe(false);
});

test("park notices obey local posting dates and withhold a changed stage or geography", async () => {
  const future = await parseNmStateParks(parks, new Date("2026-09-30T06:59:59Z"));
  expect(future.some(({ scopeNote }) => scopeNote.startsWith("Coyote Creek"))).toBe(false);
  const expired = await parseNmStateParks(parks, new Date("2027-02-01T07:00:00Z"));
  expect(expired.some(({ fips }) => fips === "35013")).toBe(false);
  const newStage = parks.replaceAll("Stage I Fire Restrictions:", "Stage III Fire Restrictions:");
  const changedPark = parks.replace(/>Navajo Lake\s*</, ">A different park<");
  expect((await parseNmStateParks(newStage, captured)).some(({ scopeNote }) => scopeNote.startsWith("Navajo Lake"))).toBe(false);
  expect((await parseNmStateParks(changedPark, captured)).some(({ scopeNote }) => scopeNote.startsWith("Navajo Lake"))).toBe(false);
  await expect(parseNmStateParks(parks.replace("State Park Restrictions", "An error occurred"), captured))
    .rejects.toThrow("active park restrictions listing");
  await expect(parseNmStateParks(parks.replace("10/5/2026 - ongoing", "2/30/2026 - ongoing"), captured))
    .rejects.toThrow("invalid posting dates for Coyote Creek");
});

test("Angel Fire's dated rescission retains a village permit requirement", async () => {
  expect(await parseAngelFirePermits(village, captured)).toEqual([expect.objectContaining({
    fips: "35007", status: "restricted", scope: "part", scopeNote: "Village of Angel Fire",
    note: expect.stringContaining("lifted its temporary ban on 2026-09-21"),
  })]);
  await expect(parseAngelFirePermits(village, new Date("2026-09-20T14:00:00Z"))).rejects.toThrow("dated lift");
  await expect(parseAngelFirePermits(village.replace("has been officially lifted", "may be lifted soon"), captured))
    .rejects.toThrow("dated lift");
});

test("air-quality rules cover separate jurisdictions and fail closed on a code change", async () => {
  const state = await parseState();
  const bernalillo = await parseBernalillo();
  expect(state.map(({ fips }) => fips)).toEqual(countiesInState("NM").filter(({ fips }) => fips !== "35001").map(({ fips }) => fips));
  expect(state.every(({ scopeNote }) => scopeNote.includes("outside Bernalillo County and tribal lands"))).toBe(true);
  expect(bernalillo).toEqual([expect.objectContaining({
    fips: "35001", status: "restricted", scope: "part",
    validFrom: "2026-11-24T07:00:00.000Z", validUntil: "2026-11-26T07:00:00.000Z",
  })]);
  const amended = Buffer.from(stateCode.toString("latin1").replace("ten acres per day", "nine acres per day"), "latin1");
  await expect(parseState(amended)).rejects.toThrow("reviewed open-burning rule changed or is missing");
  await expect(parseBernalillo(stateCode)).rejects.toThrow("reviewed open-burning rule changed or is missing");
});

test("the registry publishes only restrictions and suppresses alerts from standing rules", async () => {
  const sources = [nmStateParks, nmAngelFirePermits, nmOpenBurning, nmBernalilloOpenBurning];
  for (const source of sources) expect(SOURCES).toContain(source);
  for (const source of sources.slice(1)) expect(source.recurring).toBe(true);
  expect(nmStateParks.recurring).toBeUndefined();
  const rows = [await parseNmStateParks(parks, captured), await parseAngelFirePermits(village, captured),
    await parseState(), await parseBernalillo()];
  const { snapshot } = mergeSources(null, sources.map((source, i) => ({
    source, rows: rows[i], checked: captured.toISOString(),
  })), captured);
  expect(Object.values(snapshot.counties).map(({ status }) => status)).toEqual(Array(33).fill("restricted"));
  expect(snapshot.counties["35007"].orders).toEqual(expect.arrayContaining([
    expect.objectContaining({ scope: "part", status: "ban", scopeNote: expect.stringContaining("Sugarite Canyon") }),
    expect.objectContaining({ scope: "part", status: "restricted", scopeNote: "Village of Angel Fire" }),
  ]));
  expect(snapshot.counties["35001"].orders).toHaveLength(1);
});

for (const [name, parse] of [
  ["State Parks", () => parseNmStateParks(parks, captured)],
  ["Angel Fire", () => parseAngelFirePermits(village, captured)],
  ["state code", parseState],
  ["Bernalillo code", parseBernalillo],
] as const) {
  test(`New Mexico ${name} fixture uses less than 4 ms p95 thread CPU`, async () => {
    for (let i = 0; i < 15; i++) await parse();
    const samples = [];
    for (let i = 0; i < 60; i++) {
      const start = process.threadCpuUsage();
      await parse();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    samples.sort((a, b) => a - b);
    expect(samples[Math.ceil(0.95 * samples.length) - 1]).toBeLessThan(4);
  });
}
