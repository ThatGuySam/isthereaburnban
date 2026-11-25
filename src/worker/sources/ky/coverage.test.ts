// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { kyForestryCountyBans, parseKentuckyCountyBans } from "./county-bans";
import { kySeasonal, parseKentuckySeasonal } from "./seasonal";

const fromFixture = (file) => readFileSync(new URL(`./fixtures/${file}`, import.meta.url));
const sharePoint = fromFixture("county-burn-bans-2026-11-24.json").toString();
const archivedEmpty = fromFixture("county-burn-bans-empty-2026-07-22.html").toString();
const statute = fromFixture("krs-149.400-2026-11-24.pdf");
const captured = new Date("2026-11-24T07:31:07Z");
const modified = "2026-11-20T23:41:51Z";
const parseCountyBans = (now = captured, change = (page) => page) =>
  parseKentuckyCountyBans({ value: [change(JSON.parse(sharePoint).value[0])] }, now);
const withContent = (change) => (page) => ({ ...page, Main_x0020_Content: change(page.Main_x0020_Content) });
const parseSeasonal = (now = captured) => parseKentuckySeasonal(new Response(statute), now);
const input = (source, rows) => ({ source, rows, checked: captured.toISOString(), staleMs: source.staleMs });

test("Kentucky's current SharePoint edition yields two reported county orders with an editorial date", async () => {
  const rows = await parseCountyBans();
  expect(rows.map(({ fips, county }) => [fips, county])).toEqual([["21061", "Edmonson County"], ["21085", "Grayson County"]]);
  for (const row of rows) {
    expect(row).toMatchObject({
      status: "ban", scope: "county", checked: captured.toISOString(), sourceUpdated: new Date(modified).toISOString(),
      since: null, expires: null, validUntil: "2026-12-20T23:41:51.000Z",
    });
  }

  const expiry = new Date(rows[0].validUntil);
  const recentlyChecked = new Date(expiry.getTime() - 60_000);
  const lastSeen = { source: kyForestryCountyBans, rows: await parseCountyBans(recentlyChecked), checked: recentlyChecked.toISOString() };
  const expired = mergeSources(null, [lastSeen], expiry);
  expect(statusFor(expired.snapshot, "21061", Date.parse(expired.snapshot.generated)).status).toBe("unknown");
});

test("The archived empty wording publishes no rows, even if the last edit is old", async () => {
  const rows = await parseCountyBans(captured, (page) => ({
    ...page, Main_x0020_Content: archivedEmpty, Modified: "2026-07-22T17:24:23Z",
  }));
  expect(rows).toEqual([]);
  const previous = mergeSources(null, [input(kyForestryCountyBans, await parseCountyBans())], captured);
  const empty = mergeSources(previous.snapshot, [input(kyForestryCountyBans, rows)], captured);
  expect(statusFor(empty.snapshot, "21061", Date.parse(empty.snapshot.generated)).status).toBe("unknown");
  expect(empty.transitions).toEqual([]);
});

test("Kentucky rejects missing sections, missing entries and outdated or future editions", async () => {
  await expect(parseCountyBans(captured, withContent((html) => html.replace("Current Burn Bans", "Archived Burn Bans"))))
    .rejects.toThrow("heading or description missing");
  await expect(parseCountyBans(captured, withContent((html) => html.split('<p class="agencyElement-P"><strong>')[0])))
    .rejects.toThrow("list entries missing");
  await expect(parseCountyBans(new Date("2026-12-20T23:41:51Z"))).rejects.toThrow("over 30 days old");
  await expect(parseCountyBans(new Date("2026-11-19T00:00:00Z"))).rejects.toThrow("in the future");
});

test("Unmapped entries and city names cannot become countywide orders", async () => {
  const other = withContent((html) => html.replace("Grayson", "City of Grayson").replace("Edmonson", "Unrecognized Place"));
  await expect(parseCountyBans(captured, other)).rejects.toThrow("no county entries could be verified");
  const edit = "2026-11-23T17:00:00Z";
  const changed = await parseCountyBans(captured, (page) => ({ ...page, Modified: edit }));
  expect(changed.map(({ fips }) => fips)).toEqual(["21061"]);
  const qualified = await parseCountyBans(captured, (page) => ({
    ...page, Modified: edit, Main_x0020_Content: page.Main_x0020_Content.replace("Grayson", "Grayson County"),
  }));
  expect(qualified.map(({ fips }) => fips)).toEqual(["21061", "21085"]);
});

test("Kentucky's fire-season law follows both time zones and reports only a partial restriction", async () => {
  const rows = await parseSeasonal();
  expect(rows.map(({ fips }) => fips).sort()).toEqual(countiesInState("KY").map(({ fips }) => fips).sort());
  const east = rows.filter(({ validFrom }) => validFrom === "2026-11-24T11:00:00.000Z");
  const central = rows.filter(({ validFrom }) => validFrom === "2026-11-24T12:00:00.000Z");
  expect(east).toHaveLength(79);
  expect(central).toHaveLength(41);
  expect(east.map(({ fips }) => fips)).toContain("21231"); // Wayne
  expect(central.map(({ fips }) => fips)).toContain("21227"); // Warren
  expect(central[0]).toMatchObject({
    scope: "part", status: "restricted", scopeNote: "In or within 150 feet of woodland or brushland",
    validUntil: "2026-11-25T00:00:00.000Z",
  });
  expect(east[0].validUntil).toBe("2026-11-24T23:00:00.000Z");

  const spring = await parseSeasonal(new Date("2026-04-30T10:00:00Z"));
  expect(spring).toHaveLength(120);
  expect(spring.find(({ fips }) => fips === "21227")?.validFrom).toBe("2026-04-30T11:00:00.000Z");
  for (const day of ["2026-02-14", "2026-05-01", "2026-09-30", "2026-12-16"]) {
    expect(await parseSeasonal(new Date(`${day}T15:00:00Z`))).toEqual([]);
  }
  expect(await parseSeasonal(new Date("2026-12-15T15:00:00Z"))).toHaveLength(120);
  await expect(parseKentuckySeasonal(new Response("%PDF-replaced"), captured)).rejects.toThrow("PDF changed");
});

test("Merged Kentucky status keeps local bans and changes seasonal restrictions without alerts", async () => {
  const inputs = [input(kyForestryCountyBans, await parseCountyBans()), input(kySeasonal, await parseSeasonal())];
  const before = mergeSources(null, inputs, captured);
  const split = mergeSources(before.snapshot, inputs, new Date("2026-11-24T11:30:00Z"));
  const day = mergeSources(split.snapshot, inputs, new Date("2026-11-24T12:00:00Z"));
  const night = mergeSources(day.snapshot, inputs, new Date("2026-11-25T00:00:00Z"));

  const counts = (snapshot) => countiesInState("KY").reduce((result, { fips }) => {
    result[statusFor(snapshot, fips, Date.parse(snapshot.generated)).status]++;
    return result;
  }, { ban: 0, restricted: 0, unknown: 0, none: 0 });

  expect(kySeasonal.recurring).toBe(true);
  expect(counts(before.snapshot)).toEqual({ ban: 2, restricted: 0, unknown: 118, none: 0 });
  expect(counts(split.snapshot)).toEqual({ ban: 2, restricted: 79, unknown: 39, none: 0 });
  expect(counts(day.snapshot)).toEqual({ ban: 2, restricted: 118, unknown: 0, none: 0 });
  expect(counts(night.snapshot)).toEqual({ ban: 2, restricted: 0, unknown: 118, none: 0 });
  expect(split.transitions).toEqual([]);
  expect(day.transitions).toEqual([]);
  expect(night.transitions).toEqual([]);
});

for (const [source, parse] of [[kyForestryCountyBans, () => parseKentuckyCountyBans(JSON.parse(sharePoint), captured)], [kySeasonal, () => parseSeasonal()]]) {
  test(`${source.id} parses its real fixture in under 5 ms p95`, async () => {
    for (let i = 0; i < 20; i++) await parse();
    const samples = [];
    for (let i = 0; i < 120; i++) {
      const start = performance.now();
      await parse();
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    expect(samples[113]).toBeLessThan(5);
  });
}
