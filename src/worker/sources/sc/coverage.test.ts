// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { mergeSources } from "../merge";
import { scAirQuality, parseScAirQuality } from "./air-quality";
import { scfcDebris, parseScfcDebris } from "./debris";

const captured = new Date("2026-11-24T10:50:00Z");
const debris = await Bun.file(new URL("./fixtures/scfc-debris-2026-11-24.json", import.meta.url)).text();
const pdf = await Bun.file(new URL("./fixtures/des-61-62-2-2026-11-24.pdf", import.meta.url)).arrayBuffer();
const horry = JSON.parse(debris).find(({ county }) => county === "Horry");
const scfc = scfcDebris.find(({ id }) => id === "sc-scfc-debris-pee-dee");
const lookup = { name: "Horry", wpId: 183, sourceId: scfc.id };
const regulation = (time: Date | string) => parseScAirQuality(new Response(pdf), new Date(time));
const parseBatch = () => JSON.parse(debris).flatMap((data) => parseScfcDebris(data, captured,
  { name: data.county, wpId: Number(data.status.county), sourceId: scfc.id }));

// The capture has only negative flags. Exercise the alternate code documented by the county selector.
const closed = { ...horry, burn_ban: "--yes", status: { ...horry.status, post_date_gmt: "2026-11-24 10:00:00" } };

test("SCFC's 46 real records yield no closures or all-clears on November 24", () => {
  expect(JSON.parse(debris)).toHaveLength(46);
  expect(parseBatch()).toEqual([]);
  expect(parseScfcDebris(horry, new Date("2026-11-23T17:00:00Z"), lookup)).toEqual([]);
});

test("a fresh affirmative SCFC flag is scoped to debris burning outside municipalities", () => {
  const rows = parseScfcDebris(closed, captured, lookup);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "45051", county: "Horry County", status: "ban", scope: "part",
    scopeNote: "Residential yard-debris burning outside city and town limits",
    sourceUpdated: "2026-11-24T10:00:00.000Z", validFrom: "2026-11-24T10:00:00.000Z",
    validUntil: "2026-11-25T05:00:00.000Z", since: null, expires: null,
  });
  const { snapshot } = mergeSources(null, [{ source: scfc, rows, checked: captured.toISOString() }], captured);
  expect(snapshot.counties["45051"]).toMatchObject({
    status: "restricted", orders: [{ status: "ban", scope: "part" }],
  });
});

test("SCFC rejects changed codes, wrong counties and invalid timestamps", () => {
  expect(() => parseScfcDebris({ ...closed, burn_ban: "closed" }, captured, lookup)).toThrow("invalid debris status");
  expect(() => parseScfcDebris({ ...closed, county: "Marion" }, captured, lookup)).toThrow("invalid debris status");
  expect(() => parseScfcDebris({ ...closed, status: { ...closed.status, county: "190" } }, captured, lookup)).toThrow("invalid debris status");
  expect(() => parseScfcDebris({ ...closed, status: { ...closed.status, post_date_gmt: "2026-11-31 10:00:00" } }, captured, lookup))
    .toThrow("invalid debris status");
  expect(parseScfcDebris({ ...horry, burn_ban: "--yes" }, captured, lookup)).toEqual([]);
  expect(parseScfcDebris(closed, new Date("2026-11-24T09:59:59Z"), lookup)).toEqual([]);
  expect(parseScfcDebris(closed, new Date("2026-11-25T05:00:00Z"), lookup)).toEqual([]);
});

test("the reviewed regulation maps scoped hours to all 46 counties and produces no scheduled alerts", async () => {
  const rows = await regulation(captured);
  const before = [{ source: scAirQuality, rows, checked: captured.toISOString() }];
  const { snapshot } = mergeSources(null, before, captured);
  expect(Object.values(snapshot.counties)).toHaveLength(46);
  expect(Object.values(snapshot.counties).every(({ status, scope }) => status === "restricted" && scope === "part")).toBe(true);
  expect(snapshot.counties["45051"].orders).toHaveLength(4);
  expect(scAirQuality.recurring).toBe(true);
  const daytime = mergeSources(snapshot, before, new Date("2026-11-24T14:00:00Z"));
  expect(daytime.snapshot.counties["45051"].status).toBe("unknown");
  const evening = mergeSources(daytime.snapshot, before, new Date("2026-11-24T20:00:00Z"));
  expect(evening.snapshot.counties["45051"].status).toBe("restricted");
  expect(daytime.transitions).toEqual([]);
  expect(evening.transitions).toEqual([]);
});

test("the construction rule uses inclusive ozone dates and Eastern clock changes", async () => {
  const construction = async (time: string, label: string) => (await regulation(time))
    .filter((row) => row.fips === "45051" && row.label === label);
  const season = "Ozone-season construction burning restriction";
  const hours = "Residential construction burn hours";
  expect(await construction("2026-03-31T17:00:00Z", season)).toEqual([]);
  expect(await construction("2026-04-01T17:00:00Z", season)).toMatchObject([{
    validFrom: "2026-04-01T04:00:00.000Z", validUntil: "2026-04-02T04:00:00.000Z",
  }]);
  expect(await construction("2026-10-30T17:00:00Z", season)).toHaveLength(1);
  expect(await construction("2026-10-31T17:00:00Z", season)).toEqual([]);
  expect(await construction("2026-10-31T17:00:00Z", hours)).toMatchObject([{
    validFrom: "2026-10-31T19:00:00.000Z", validUntil: "2026-11-01T04:00:00.000Z",
  }]);
  expect(await construction("2026-11-01T13:59:59Z", hours)).toMatchObject([
    { validFrom: "2026-11-01T04:00:00.000Z", validUntil: "2026-11-01T14:00:00.000Z" },
    { validFrom: "2026-11-01T20:00:00.000Z", validUntil: "2026-11-02T05:00:00.000Z" },
  ]);
  await expect(parseScAirQuality(new Response("%PDF-changed"), captured)).rejects.toThrow("PDF changed");
});

test("SCFC fixture parsing and the DES PDF calendar stay below 5 ms p95", async () => {
  const run = async () => {
    parseBatch();
    parseScfcDebris(closed, captured, lookup);
    await regulation(captured);
  };
  for (let i = 0; i < 10; i++) await run();
  const timings: number[] = [];
  for (let i = 0; i < 60; i++) {
    const start = performance.now();
    await run();
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  expect(timings[Math.ceil(timings.length * 0.95) - 1]).toBeLessThan(5);
});
