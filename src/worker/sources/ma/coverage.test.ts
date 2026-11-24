// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState, STATE_DIR_BY_ABBR } from "../../counties";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { maOpenBurning, parseMaOpenBurning } from "./open-burning";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.json`, import.meta.url), "utf8");
const guidance = fixture("woburn-open-burning");
const captured = new Date("2026-11-24T14:38:39Z");
const parse = (now = captured, input = guidance) => parseMaOpenBurning(JSON.parse(input), now);
const merge = (rows, now = captured, prev = null, checked = now) => mergeSources(
  prev, [{ source: maOpenBurning, rows, checked: checked.toISOString() }], now,
);

test("Massachusetts has statewide brush restrictions and 22 municipal prohibitions", async () => {
  expect(SOURCES).toContain(maOpenBurning);
  expect(maOpenBurning).toMatchObject({ scope: "state", recurring: true, coverage: "restrictions", mode: "positive-only" });
  expect(STATE_DIR_BY_ABBR.get("MA")?.coverage).toBe("restrictions");

  const rows = await parse();
  const { snapshot, transitions } = merge(rows);
  const counties = countiesInState("MA");
  expect(counties).toHaveLength(14);
  expect(counties.map(({ fips }) => snapshot.counties[fips]?.status)).toEqual(Array(14).fill("restricted"));
  expect(transitions).toEqual([]);
  expect(snapshot.counties["25027"]).toMatchObject({
    label: "Residential brush-burning season closed", scope: "state",
    orders: [{ scope: "part", scopeNote: "Municipality of Worcester, Worcester County" }],
  });
  expect(snapshot.counties["25001"].orders).toBeUndefined();
  expect(rows.every(({ sourceUpdated, status }) => sourceUpdated === null && status === "restricted")).toBe(true);

  const mapped = rows.filter(({ scope }) => scope === "part").map(({ fips, scopeNote }) => {
    const town = scopeNote.split(",")[0].slice("Municipality of ".length).toUpperCase();
    return [town, Number(fips)];
  });
  const massgis = JSON.parse(fixture("massgis-municipalities")).features
    .map(({ attributes }) => [attributes.TOWN, attributes.FIPS_STCO]);
  expect(mapped).toHaveLength(22);
  expect(mapped.toSorted()).toEqual(massgis.toSorted());
  expect(new Set(mapped.map(([, fips]) => fips)).size).toBe(7);
});

test("brush rules follow Eastern dates and hours through May 1, and municipal prohibitions stay in force", async () => {
  const jan14 = new Date("2027-01-15T04:58:00Z");
  const janRows = await parse(jan14);
  const firstDay = new Date("2027-01-15T05:00:00Z");
  const firstOpening = new Date("2027-01-15T15:00:00Z");
  const boston = "25025";
  const offSeason = merge(janRows, jan14).snapshot;
  expect(merge(janRows, firstDay, offSeason, jan14).snapshot.counties[boston].label)
    .toBe("Outside residential brush-burning hours");
  const opening = merge(janRows, firstOpening, offSeason, jan14);
  expect(opening.snapshot.counties[boston]).toMatchObject({
    label: "Residential brush-burning permit required",
    orders: [{ scopeNote: "Municipality of Boston, Suffolk County" }, { scopeNote: "Municipality of Chelsea, Suffolk County" }],
  });
  expect(opening.transitions).toEqual([]);

  const lastOpening = new Date("2027-05-01T14:00:00Z");
  const lastClosing = new Date("2027-05-01T20:00:00Z");
  const mayRows = await parse(lastOpening);
  expect(merge(mayRows, lastOpening).snapshot.counties[boston].label).toBe("Residential brush-burning permit required");
  expect(merge(mayRows, lastClosing, null, lastOpening).snapshot.counties[boston].label).toBe("Outside residential brush-burning hours");
  expect(merge(mayRows, new Date("2027-05-02T04:00:00Z"), null, lastOpening).snapshot.counties[boston].label)
    .toBe("Residential brush-burning season closed");
});

test("Massachusetts parser rejects changed guidance, incomplete geography, and unrecognized places", async () => {
  await expect(parse(captured, guidance.replace("January 15 to May 1", "January 15 to May 2")))
    .rejects.toThrow("reviewed brush-burning guidance changed");
  await expect(parse(captured, guidance.replace("West Springfield, Worcester.", "Worcester, Worcester.")))
    .rejects.toThrow("missing or incomplete year-round municipality list");
  await expect(parse(captured, guidance.replace("West Springfield, Worcester.", "West Springvale, Worcester.")))
    .rejects.toThrow("unmapped municipality: West Springvale");
  await expect(parse(captured, guidance.replace("Communities where open burning is prohibited at all times:", "More information:")))
    .rejects.toThrow("reviewed brush-burning guidance changed");
  await expect(parse(new Date("2025-01-15T12:56:04Z"))).rejects.toThrow("Future WordPress page update");
});

test("Missed polls expire Massachusetts calendar rows without producing an all-clear", async () => {
  const rows = await parse();
  const before = merge(rows);
  const expired = merge(rows, new Date("2026-11-26T05:00:00Z"), before.snapshot, captured);
  expect(expired.snapshot.counties).toEqual({});
  expect(expired.transitions).toEqual([]);
});

test("Massachusetts WordPress and calendar fixture parses below 4 ms p95 thread CPU", async () => {
  const inSeason = new Date("2027-04-15T14:00:00Z");
  for (let index = 0; index < 15; index++) await parse(inSeason);
  const samples = [];
  for (let index = 0; index < 60; index++) {
    const start = process.threadCpuUsage();
    await parse(inSeason);
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
});
