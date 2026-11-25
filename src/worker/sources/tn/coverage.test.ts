// @ts-nocheck -- bun test types are not installed.
import { expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { parseHamiltonBurnDecision, tnHamiltonDailyBurning } from "./hamilton";
import { parseTennesseePermitHolds, parseTennesseePermitRoster, tnForestryPermitHolds } from "./permit-holds";
import { parseTennesseePermitSeason, tnSeasonalBurnPermits } from "./seasonal";

const fixture = (path) => readFileSync(new URL(`./fixtures/${path}`, import.meta.url), "utf8");
const roster = fixture("permit-roster-2026-11-24.json");
const details = fixture("permit-details-2026-11-24.json");
const guidance = fixture("permit-season-2026-11-24.html");
const hamilton = fixture("hamilton-burn-widget-2026-11-24.html");
const captured = new Date("2026-11-24T12:31:02Z");
const holdsAt = (now = captured) => parseTennesseePermitHolds(details, parseTennesseePermitRoster(roster), now);
const seasonAt = async (now = captured) => parseTennesseePermitSeason(await extractHtml(guidance), now);

test("the dated fiResponse roster only identifies county records and details establish permit holds", () => {
  expect(parseTennesseePermitRoster(roster).size).toBe(8);
  const rows = holdsAt();
  expect(rows.map(({ county }) => county).sort()).toEqual([
    "Claiborne County", "Grainger County", "Hancock County", "Jackson County", "Putnam County",
  ]);
  expect(rows.every((row) => row.scope === "part" && row.status === "restricted")).toBe(true);
  expect(rows.find(({ county }) => county === "Jackson County")).toMatchObject({
    fips: "47087", scopeNote: "Division of Forestry permit area in Jackson County",
    validFrom: "2026-11-24T06:01:00.000Z", validUntil: "2026-11-25T06:00:00.000Z",
  });
  expect(rows.find(({ county }) => county === "Claiborne County")).toMatchObject({
    fips: "47025", validFrom: "2026-11-23T05:00:00.000Z", validUntil: "2026-11-26T04:59:00.001Z",
  });
});

test("expired holds, absent details, and the map's standing local referrals yield no all-clear", () => {
  const expired = new Date("2026-11-30T05:00:00Z");
  expect(holdsAt(expired)).toEqual([]);
  const nextDay = holdsAt(new Date("2026-11-25T12:00:00Z"));
  expect(nextDay.some(({ county }) => county === "Jackson County")).toBe(false);
  expect(nextDay.some(({ county }) => county === "Claiborne County")).toBe(true);
  const tomorrow = details.replace("2026-11-24T00:00:00", "2026-11-25T00:00:00");
  expect(parseTennesseePermitHolds(tomorrow, parseTennesseePermitRoster(roster), captured)
    .some(({ county }) => county === "Hancock County")).toBe(false);
  expect(parseTennesseePermitHolds("[]", parseTennesseePermitRoster(roster), captured)).toEqual([]);
  const noHolds = mergeSources(null, [{ source: tnForestryPermitHolds, rows: [], checked: captured.toISOString() }], captured);
  expect(noHolds.snapshot.counties).toEqual({});
});

test("changed fiResponse schemas, unknown reasons, and mismatched divisions fail validation", () => {
  const divisions = parseTennesseePermitRoster(roster);
  const decode = (body) => parseTennesseePermitHolds(body, divisions, captured);
  expect(() => parseTennesseePermitRoster('{"divisions":[]}')).toThrow();
  expect(() => decode(details.replace("33540ce2-a887-49cb-afb1-3a98a663bb8c", "new-reason"))).toThrow();
  expect(() => decode(details.replace('"Hancock County"', '"Hamilton County"'))).toThrow("unexpected county");
  expect(() => decode(details.replace("2026-11-29T00:00:00", "2026-11-41T00:00:00"))).toThrow("invalid permit restriction dates");
});

test("the seasonal requirement observes both Tennessee zones and excludes local permit programs", async () => {
  const rows = await seasonAt();
  expect(rows).toHaveLength(92);
  expect(rows.filter((row) => row.validFrom.endsWith("T05:00:00.000Z"))).toHaveLength(29);
  expect(rows.filter((row) => row.validFrom.endsWith("T06:00:00.000Z"))).toHaveLength(63);
  expect(rows.some(({ county }) => /Davidson|Knox|Shelby/.test(county))).toBe(false);
  const opening = await seasonAt(new Date("2026-10-15T04:07:00Z"));
  expect(opening.find(({ county }) => county === "Hancock County")?.validFrom).toBe("2026-10-15T12:00:00.000Z");
  expect(opening.find(({ county }) => county === "Rutherford County")?.validFrom).toBe("2026-10-15T13:00:00.000Z");
  const end = await seasonAt(new Date("2027-05-16T04:30:00Z"));
  expect(end).toHaveLength(63);
  expect(end[0].validUntil).toBe("2027-05-16T05:00:00.000Z");
  expect(await seasonAt(new Date("2027-05-16T05:00:00Z"))).toEqual([]);
  expect(tnSeasonalBurnPermits.recurring).toBe(true);
  expect(tnForestryPermitHolds.recurring).toBeUndefined();
  expect(() => parseTennesseePermitSeason({ blocks: [] }, captured)).toThrow("guidance changed");
});

test("the seasonal requirement uses the pinned rule on access blocks and still rejects changed guidance", async () => {
  const fetch = spyOn(globalThis, "fetch");
  try {
    fetch.mockImplementation(async () => new Response("Forbidden", { status: 403 }));
    const { rows } = await tnSeasonalBurnPermits.fetch({ now: captured });
    expect(rows).toHaveLength(92);
    expect(rows[0].note).toContain("Current guidance could not be verified");

    fetch.mockImplementation(async () => new Response(guidance.replace("through May 15", "through May 16")));
    await expect(tnSeasonalBurnPermits.fetch({ now: captured })).rejects.toThrow("guidance changed");
  } finally {
    fetch.mockRestore();
  }
});

test("Hamilton's dated air bureau bulletin applies to permitted open burning", async () => {
  const rows = await parseHamiltonBurnDecision(hamilton, captured);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "47065", status: "restricted", scope: "part", officialUrl: "https://apcb.org/",
    validFrom: "2026-11-24T05:00:00.000Z", validUntil: "2026-11-25T05:00:00.000Z",
  });
  expect(rows[0].note).toContain("9:00 a.m. to 3:30 p.m. Eastern");
  const noBurn = hamilton.replace('class="widget-text-b2">Yes', 'class="widget-text-b2">No');
  expect((await parseHamiltonBurnDecision(noBurn, captured))[0].label).toBe("Hamilton County no-burn day");
  expect(await parseHamiltonBurnDecision(hamilton, new Date("2026-11-25T05:00:00Z"))).toEqual([]);
  await expect(parseHamiltonBurnDecision(hamilton.replace("A valid permit is required.", ""), captured)).rejects.toThrow("permit requirement");
  await expect(parseHamiltonBurnDecision(hamilton.replace('class="widget-text-b2">Yes', 'class="widget-text-b2">Maybe'), captured)).rejects.toThrow("daily burning widget");
  await expect(parseHamiltonBurnDecision(hamilton + hamilton, captured)).rejects.toThrow("daily burning widget");
  expect(tnHamiltonDailyBurning.mode).toBe("positive-only");
});

test("the Tennessee merge reports scoped restrictions and keeps uncovered countywide status unknown", async () => {
  const checked = captured.toISOString();
  const { snapshot } = mergeSources(null, [
    { source: tnForestryPermitHolds, rows: holdsAt(), checked },
    { source: tnSeasonalBurnPermits, rows: await seasonAt(), checked },
  ], captured);
  const counts = {};
  for (const { fips } of countiesInState("TN")) {
    const status = snapshot.counties[fips]?.status ?? "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  expect(counts).toEqual({ restricted: 92, unknown: 3 });
  expect(snapshot.counties["47025"].orders.map(({ sourceId }) => sourceId)).toEqual([
    tnForestryPermitHolds.id, tnSeasonalBurnPermits.id,
  ]);
});

test("blocked Tennessee guidance keeps the reviewed statutory season and its local exceptions", async () => {
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Forbidden", { status: 403 });
  try {
    const result = await tnSeasonalBurnPermits.fetch({ now: captured });
    expect(result.fallback).toMatchObject({ reviewedAt: expect.stringContaining("2026-11-24"), reason: expect.stringContaining("403") });
    expect(result.rows).toHaveLength(92);
    expect(result.rows.find(({ fips }) => fips === "47001")).toMatchObject({
      status: "restricted", note: expect.stringContaining("last reviewed"), validUntil: expect.any(String),
    });
    expect(result.rows.some(({ county }) => /Davidson|Knox|Shelby/.test(county))).toBe(false);
    await expect(tnSeasonalBurnPermits.fetch({ now: new Date("2027-06-02T12:00Z") })).rejects.toThrow("review window");
  } finally {
    globalThis.fetch = fetch;
  }
});

test("the real Tennessee JSON, calendar and Hamilton bulletin parse below 4 ms p95 thread CPU", async () => {
  const parse = async () => {
    holdsAt();
    await seasonAt();
    await parseHamiltonBurnDecision(hamilton, captured);
  };
  for (let index = 0; index < 15; index++) await parse();
  const samples = [];
  for (let index = 0; index < 60; index++) {
    const start = process.threadCpuUsage();
    await parse();
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
});
