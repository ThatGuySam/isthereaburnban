// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { mergeSources } from "../merge";
import { parseWestVirginiaSeasonal, wvForestryFireSeason } from "./seasonal";

const fixture = readFileSync(new URL("./fixtures/forestry-fire-laws-2026-11-24.json", import.meta.url), "utf8");
const captured = new Date("2026-11-24T13:16:05Z");
const rowsAt = (when, data = fixture) => parseWestVirginiaSeasonal(JSON.parse(data), new Date(when));

test("Forestry's published fall rule covers all 55 counties during Eastern daytime", async () => {
  const rows = await rowsAt(captured);
  const today = rows.filter(({ validFrom }) => validFrom === "2026-11-24T12:00:00.000Z");
  expect(today.map(({ fips }) => fips)).toEqual(countiesInState("WV").map(({ fips }) => fips));
  expect(today).toHaveLength(55);
  for (const row of today) expect(row).toMatchObject({
    status: "restricted", scope: "state",
    validUntil: "2026-11-24T22:00:00.000Z", sourceUpdated: "2024-04-02T23:12:08Z",
    checked: captured.toISOString(), since: null, expires: null,
  });
  expect(rows).toHaveLength(110);
});

test("the two seasons honor inclusive dates and Eastern daylight saving time", async () => {
  for (const [at, starts, ends] of [
    ["2026-10-01T11:00:00Z", "2026-10-01T11:00:00.000Z", "2026-10-01T21:00:00.000Z"],
    ["2026-12-31T21:59:59Z", "2026-12-31T12:00:00.000Z", "2026-12-31T22:00:00.000Z"],
    ["2027-03-01T12:00:00Z", "2027-03-01T12:00:00.000Z", "2027-03-01T22:00:00.000Z"],
    ["2027-05-31T20:59:59Z", "2027-05-31T11:00:00.000Z", "2027-05-31T21:00:00.000Z"],
  ]) {
    const rows = await rowsAt(at);
    expect(rows.filter(({ validFrom }) => validFrom === starts)).toHaveLength(55);
    expect(rows[0].validUntil).toBe(ends);
  }
  for (const at of ["2026-09-29T12:00:00Z", "2026-12-31T22:00:00Z", "2027-05-31T21:00:00Z", "2027-06-01T12:00:00Z"]) {
    expect(await rowsAt(at)).toEqual([]);
  }
});

test("changed hours, missing terms, unknown values and future revisions fail the parse", async () => {
  for (const changed of [
    fixture.replace("Burning Season Guidelines", "Current Weather"),
    fixture.replace("from 7 a.m. to 5 p.m.", "from 6 a.m. to 5 p.m."),
    fixture.replace("from 7 a.m. to 5 p.m.", "at hours pending review"),
    fixture.replace("one inch of snow or more", "two inches of snow or more"),
  ]) {
    expect(changed).not.toBe(fixture);
    await expect(rowsAt(captured, changed)).rejects.toThrow("seasonal burning guidance changed or is missing");
  }
  await expect(rowsAt(captured, fixture.replace("2024-04-02T23:12:08", "2026-11-25T00:00:00")))
    .rejects.toThrow("Future WordPress page update");
});

test("the daily restriction starts and expires without alerts or inferred all-clears", async () => {
  const checked = "2026-11-24T05:07:00.000Z";
  const inputs = [{ source: wvForestryFireSeason, rows: await rowsAt(checked), checked }];
  const before = mergeSources(null, inputs, new Date("2026-11-24T11:59:59Z"));
  const during = mergeSources(before.snapshot, inputs, new Date("2026-11-24T12:00:00Z"));
  const after = mergeSources(during.snapshot, inputs, new Date("2026-11-24T22:00:00Z"));
  expect(before.snapshot.counties["54003"]?.status ?? "unknown").toBe("unknown");
  expect(during.snapshot.counties["54003"].status).toBe("restricted");
  expect(after.snapshot.counties["54003"]?.status ?? "unknown").toBe("unknown");
  expect(during.transitions).toEqual([]);
  expect(after.transitions).toEqual([]);
});

test("the Forestry fixture and county projection use less than 4 ms p95 thread CPU", async () => {
  for (let i = 0; i < 15; i++) await rowsAt(captured);
  const samples = [];
  for (let i = 0; i < 60; i++) {
    const start = process.threadCpuUsage();
    await rowsAt(captured);
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
});
