// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { moShowMeFireBans, parseShowMeFireBans } from "./show-me-fire";
import { moYardWaste, parseMoYardWaste } from "./yard-waste";

const captured = new Date("2026-11-24T12:15:56Z");
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const activeBody = fixture("show-me-fire-active-2026-11-24.json").toString();
const active = JSON.parse(activeBody);
const sipBody = fixture("epa-sip-2026-11-24.html");
const regulation = fixture("epa-open-burning-2026-11-24.pdf");
const definitions = fixture("epa-definitions-2026-11-24.pdf");
const readPdf = async (url: string) => new Response(url === moYardWaste.officialUrl ? regulation : definitions);
const readSip = (body = sipBody) => extractHtml(new Response(body), { links: true });
const parseSipFixture = async (now = captured) => parseMoYardWaste(await readSip(), now, readPdf);

test("Show Me Fire publishes one active Dallas County report and no all-clears", () => {
  expect(parseShowMeFireBans(active, captured)).toEqual([
    expect.objectContaining({
      fips: "29059", county: "Dallas County", scope: "county", status: "ban",
      since: "2026-10-11", expires: null, sourceUpdated: "2026-10-11T20:31:18.000Z",
      validFrom: "2026-10-11T17:41:00.000Z", validUntil: "2026-11-25T13:00:06.000Z",
    }),
  ]);
  expect(parseShowMeFireBans({ ...active, count: 0, bans: [] }, captured)).toEqual([]);
});

test("active reports respect their stated hours and expire before the map when necessary", () => {
  const expires_at = "2026-11-24T13:00:00Z";
  const expiring = { ...active, bans: [{ ...active.bans[0], request_type: "update", expires_at }] };
  expect(parseShowMeFireBans(expiring, captured)[0]).toMatchObject({
    expires: "2026-11-24", validUntil: "2026-11-24T13:00:00.000Z",
  });
  expect(parseShowMeFireBans(expiring, new Date(expires_at))).toEqual([]);
  const upcoming = { ...active, bans: [{ ...active.bans[0], effective_at: "2026-11-24T13:00:00Z" }] };
  expect(parseShowMeFireBans(upcoming, captured)).toEqual([]);
});

test("stale, changed, or ambiguous active lists fail the poll", () => {
  expect(() => parseShowMeFireBans(active, new Date("2026-11-25T13:00:06Z"))).toThrow("stale");
  expect(() => parseShowMeFireBans({ ...active, map: { updated_at: "2026-11-24T13:00:00Z" } }, captured))
    .toThrow("stale");
  expect(() => parseShowMeFireBans({ ...active, count: 0 }, captured)).toThrow("incomplete");
  const changed = (patch) => ({ ...active, bans: [{ ...active.bans[0], ...patch }] });
  expect(() => parseShowMeFireBans(changed({ request_type: "unknown" }), captured)).toThrow();
  expect(() => parseShowMeFireBans(changed({ county_fips: "48113" }), captured)).toThrow("county FIPS");
  expect(() => parseShowMeFireBans({ ...active, count: 2, bans: [active.bans[0], active.bans[0]] }, captured))
    .toThrow("duplicate");
  expect(() => parseShowMeFireBans(changed({ expires_at: "2026-11-31T12:00:00Z" }), captured)).toThrow("dates");
});

test("the federal yard-waste rule maps the five metro areas and uses inclusive Central dates", async () => {
  const cases = [
    ["2027-04-15T04:59:00Z", "Yard-waste burning limits"],
    ["2027-04-15T05:00:00Z", "Yard-waste burning season closed"],
    ["2027-09-16T04:59:00Z", "Yard-waste burning season closed"],
    ["2027-09-16T05:00:00Z", "Yard-waste burning limits"],
  ];
  expect(moYardWaste.recurring).toBe(true);
  for (const [instant, label] of cases) {
    const rows = await parseSipFixture(new Date(instant));
    expect(rows.map(({ fips }) => fips).sort()).toEqual(["29071", "29099", "29183", "29189", "29510"]);
    expect(rows.every((row) => row.scope === "part" && row.status === "restricted" && row.label === label)).toBe(true);
  }
});

test("changed federal listings or PDF provisions require review", async () => {
  const parts = await readSip();
  await expect(parseMoYardWaste({ ...parts, links: [] }, captured, readPdf)).rejects.toThrow("listing changed");
  await expect(parseMoYardWaste(parts, captured, async () => new Response(definitions)))
    .rejects.toThrow("10-6.045 PDF changed");
  await expect(parseMoYardWaste(parts, captured, async () => new Response(regulation)))
    .rejects.toThrow("10-6.020 PDF changed");
});

test("the Missouri merge publishes one ban, five scoped restrictions, and leaves the remainder unknown", async () => {
  const checked = captured.toISOString();
  const inputs = [
    { source: moShowMeFireBans, checked, rows: parseShowMeFireBans(active, captured) },
    { source: moYardWaste, checked, rows: await parseSipFixture() },
  ];
  const { snapshot } = mergeSources(null, inputs, captured);
  const statuses = countiesInState("MO").map(({ fips }) => snapshot.counties[fips]?.status ?? "unknown");
  expect(statuses.filter((status) => status === "ban")).toHaveLength(1);
  expect(statuses.filter((status) => status === "restricted")).toHaveLength(5);
  expect(statuses.filter((status) => status === "unknown")).toHaveLength(109);
});

test("Missouri fixture parsing uses less than 4 ms of thread CPU at p95", async () => {
  const parse = async () => {
    parseShowMeFireBans(JSON.parse(activeBody), captured);
    await parseSipFixture();
  };
  for (let i = 0; i < 15; i++) await parse();
  const samples: number[] = [];
  for (let i = 0; i < 60; i++) {
    const start = process.threadCpuUsage();
    await parse();
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
});
