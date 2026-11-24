// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractHtml, parseHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { azAreaASummer, parseArizonaAreaA } from "./area-a";
import { azGrandCanyonFire, parseGrandCanyonFire } from "./grand-canyon";
import { azPimaWildfire, parsePimaWildfire } from "./pima";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.html`, import.meta.url), "utf8");
const pima = fixture("pima-wildfire");
const grandCanyon = fixture("grand-canyon-fire");
const statute = fixture("section-49-501");
const checked = "2026-11-24T07:12:00.000Z";
const now = new Date(checked);
const summer = new Date("2026-07-01T07:00:00Z");

test("Pima's visible clear advisory leaves countywide status unconfirmed", async () => {
  const rows = parsePimaWildfire(await extractHtml(pima), now);
  expect(rows).toEqual([expect.objectContaining({
    fips: "04019", status: "unknown", scope: "part", scopeNote: "Pima County-owned property",
    checked, sourceUpdated: null, since: null, expires: null,
  })]);
  const { snapshot } = mergeSources(null, [{ source: azPimaWildfire, rows, checked }], now);
  expect(snapshot.counties["04019"]).toMatchObject({
    status: "unknown", label: "Countywide status unconfirmed", note: expect.stringContaining("County-owned property"),
  });
});

test("Pima recognizes an explicit active stage and rejects ambiguous text or scope changes", () => {
  const message = "There are currently no fire restrictions in effect. Always use caution with any activity that could start a wildfire.";
  const read = (html: string) => parsePimaWildfire(parseHtml(html), now);
  expect(read(pima.replace(message, "Stage II fire restrictions are currently in effect."))[0])
    .toMatchObject({ status: "restricted", scope: "part", label: "Stage II fire restrictions" });
  expect(() => read(pima.replace(message, "Check for updates soon."))).toThrow("unrecognized alert message");
  expect(() => read(pima.replace("Current Fire Restrictions Status", "Archived Notices"))).toThrow("expected one alert message");
  expect(() => read(pima.replace("apply to County-owned property", "apply throughout the county"))).toThrow("expected County-owned property");
  expect(() => read(pima + pima)).toThrow("expected one alert message");
});

test("Grand Canyon keeps the named rim stages separate within Coconino County", async () => {
  const rows = parseGrandCanyonFire(await extractHtml(grandCanyon), now);
  expect(rows).toHaveLength(2);
  expect(rows.every(({ fips, scope, status, validUntil, sourceUpdated, since, expires }) =>
    fips === "04005" && scope === "part" && status === "restricted" && validUntil === "2026-12-04T07:00:00.000Z" &&
    sourceUpdated === "2026-11-04" && since === null && expires === null)).toBe(true);

  const { snapshot } = mergeSources(null, [{ source: azGrandCanyonFire, rows, checked }], now);
  expect(snapshot.counties["04005"]).toMatchObject({
    status: "restricted",
    orders: [
      { scopeNote: "Grand Canyon National Park, South Rim", label: "Stage 1 fire restrictions" },
      { scopeNote: "Grand Canyon National Park, North Rim", label: "Stage 2 fire restrictions" },
    ],
  });
  expect(snapshot.counties["04015"]).toBeUndefined();
});

test("Grand Canyon rejects stale or changed bulletins and omits a lifted or unknown rim", () => {
  const read = (html: string, at = now) => parseGrandCanyonFire(parseHtml(html), at);
  expect(() => read(grandCanyon, new Date("2026-12-04T07:00Z"))).toThrow("stale update date");
  expect(() => read(grandCanyon, new Date("2026-11-04T06:59:59Z"))).toThrow("future");
  expect(() => read(grandCanyon.replace("Last updated:", "Information updated:"))).toThrow("missing");
  expect(() => read(grandCanyon + grandCanyon)).toThrow("missing");
  expect(() => read(grandCanyon.replaceAll(/Stage [12] Fire Restrictions/g, "Other advice"))).toThrow("no recognized rim decision");
  const states = [
    grandCanyon.replace("Stage 2 Fire Restrictions", "No Fire Restrictions"),
    grandCanyon.replace("Stage 2 Fire Restrictions", "Stage 9 Fire Restrictions"),
  ];
  for (const bulletin of states) {
    expect(read(bulletin)).toEqual([expect.objectContaining({ scopeNote: "Grand Canyon National Park, South Rim" })]);
  }
});

test("Area A follows Arizona midnight and limits only the three statutory county parts", async () => {
  const parts = await extractHtml(statute);
  for (const [time, count] of [
    ["2026-05-01T06:59:59Z", 0], ["2026-05-01T07:00:00Z", 3],
    ["2026-10-01T06:59:59Z", 3], ["2026-10-01T07:00:00Z", 0],
    [checked, 0],
  ]) {
    expect(await parseArizonaAreaA(parts, new Date(time))).toHaveLength(count);
  }
  const rows = await parseArizonaAreaA(parts, summer);
  expect(rows.map(({ fips }) => fips)).toEqual(["04013", "04021", "04025"]);
  for (const row of rows) expect(row).toMatchObject({
    status: "restricted", scope: "part", scopeNote: expect.stringContaining("Area A"),
    validFrom: "2026-07-01T07:00:00.000Z", validUntil: "2026-07-02T07:00:00.000Z",
  });
  expect(azAreaASummer.recurring).toBe(true);
  await expect(parseArizonaAreaA(parseHtml(statute.replace("September 30", "September 29")), summer)).rejects.toThrow("changed");
  await expect(parseArizonaAreaA(parseHtml(statute.replaceAll("49-501", "49-502")), summer)).rejects.toThrow("missing");
});

test("Arizona fixture extraction and mapping p95 stays below 5 ms per source", async () => {
  const jobs = [
    async () => parsePimaWildfire(await extractHtml(pima), now),
    async () => parseGrandCanyonFire(await extractHtml(grandCanyon), now),
    async () => parseArizonaAreaA(await extractHtml(statute), summer),
  ];
  for (const run of jobs) {
    for (let i = 0; i < 20; i++) await run();
    const samples: number[] = [];
    for (let i = 0; i < 120; i++) {
      const start = performance.now();
      await run();
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    expect(samples[113]).toBeLessThan(5);
  }
});
