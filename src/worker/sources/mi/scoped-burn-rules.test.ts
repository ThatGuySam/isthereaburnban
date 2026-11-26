// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { miPermits, parseMichiganPermits } from "./permits";
import { miScopedBurnRules } from "./scoped-burn-rules";
import { miTownshipBulletins } from "./township-bulletins";

const now = new Date("2026-11-24T05:10:00Z");
const checked = now.toISOString();
const counties = countiesInState("MI");
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const reviewed = miScopedBurnRules.map((entry) => {
  const bytes = fixture(`county-pass/${entry.fixture}`);
  const response = entry.fixture.endsWith(".headers.json")
    ? () => new Response(null, { headers: JSON.parse(bytes.toString()) })
    : () => new Response(bytes);
  return { ...entry, bytes, response, run: () => entry.parse(response(), now) };
});

test("county-pass fixtures add only scoped restrictions on top of the Michigan DNR baseline", async () => {
  const dnr = {
    source: miPermits, checked, rows: parseMichiganPermits(JSON.parse(fixture("permits-2026-11-24.json").toString()), now),
  };
  const sources = [];
  for (const { source, run } of reviewed) {
    const rows = await run();
    expect(source).toMatchObject({ recurring: true, scope: "part", mode: "positive-only" });
    expect(rows.map(({ fips }) => fips)).toEqual(source.reportingFips);
    for (const row of rows) expect(row).toMatchObject({ state: "MI", scope: "part", status: "restricted", officialUrl: source.officialUrl });
    sources.push({ source, rows, checked });
  }
  const spencer = miTownshipBulletins[0];
  sources.push({ source: spencer.source, rows: await spencer.parse(fixture("county-pass/spencer-2026-11-25.html").toString(), now), checked });
  const baseline = mergeSources(null, [dnr], now).snapshot;
  const result = mergeSources(baseline, [dnr, ...sources], now);
  const newlyRestricted = counties.filter(({ fips }) => statusFor(baseline, fips, +now).status === "unknown" &&
    statusFor(result.snapshot, fips, +now).status === "restricted").map(({ name }) => name.replace(/ County$/, ""));
  expect(newlyRestricted).toEqual([
    "Alcona", "Alger", "Allegan", "Alpena", "Antrim", "Barry", "Benzie", "Berrien", "Calhoun", "Cheboygan",
    "Clinton", "Crawford", "Eaton", "Genesee", "Gladwin", "Gratiot", "Hillsdale", "Ingham", "Ionia", "Iosco",
    "Kalamazoo", "Kent", "Keweenaw", "Lake", "Lapeer", "Livingston", "Macomb", "Manistee", "Mason", "Mecosta",
    "Midland", "Missaukee", "Monroe", "Montcalm", "Newaygo", "Oakland", "Oceana", "Ogemaw", "Oscoda", "Ottawa",
    "Saginaw", "Shiawassee", "St. Clair", "St. Joseph", "Tuscola", "Van Buren", "Washtenaw", "Wayne", "Wexford",
  ]);
  const totals = counties.map(({ fips }) => statusFor(result.snapshot, fips, +now).status);
  expect(totals.filter((status) => status === "restricted")).toHaveLength(59);
  expect(totals.filter((status) => status === "unknown")).toHaveLength(24);
  expect(result.transitions).toEqual([]);
  expect(statusFor(result.snapshot, "26001", +now).scopeNote).toContain("Dispersed areas of Huron-Manistee National Forests");
});

test("reviewed seasonal dates and changed publisher evidence gate standing local restrictions", async () => {
  const township = reviewed.find(({ source }) => source.id === "mi-chesterfield-debris-seasons");
  expect(await township.run()).toMatchObject([{ since: "2026-11-23", expires: "2027-03-31" }]);
  expect(await township.parse(township.response(), new Date("2027-04-01T04:00:00Z"))).toEqual([]);
  await expect(township.parse(new Response(township.bytes.toString().replace("May 21", "May 31")), now)).rejects.toThrow("rule changed");
  const alpena = reviewed.find(({ source }) => source.id === "mi-alpena-clean-wood");
  await expect(alpena.parse(new Response(null, { headers: { "content-type": "application/pdf", etag: '"changed"' } }), now))
    .rejects.toThrow("rule changed");
});

test("each scoped Michigan standing rule parses its fixture below 6 ms p95", async () => {
  let maximum = 0;
  for (const { run } of reviewed) {
    await run();
    const timings = [];
    for (let i = 0; i < 20; i++) {
      const start = process.threadCpuUsage();
      await run();
      const { user, system } = process.threadCpuUsage(start);
      timings.push((user + system) / 1_000);
    }
    maximum = Math.max(maximum, timings.sort((a, b) => a - b)[18]);
  }
  console.log(`MI scoped rule fixture p95 max ${maximum.toFixed(3)} ms`);
  expect(maximum).toBeLessThan(6);
});
