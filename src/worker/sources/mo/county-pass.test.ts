// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { civicPlusActiveAlerts } from "../lib/civicplus";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { moCapeGirardeau, parseCapeGirardeauDay } from "./cape-girardeau";
import { moLakeOzark, parseLakeOzarkDay } from "./lake-ozark";
import { moLocalCalendars } from "./local-rules";
import { moMountainView, parseMountainViewAlerts } from "./mountain-view";
import { moShowMeFireBans, parseShowMeFireBans } from "./show-me-fire";
import { moYardWaste, parseMoYardWaste } from "./yard-waste";

const now = new Date("2026-11-24T22:25:00Z");
const checked = now.toISOString();
const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const cape = read("cape-girardeau-day-2026-11-24.html").toString();
const lake = read("lake-ozark-day-2026-11-24.html").toString();
const mountain = read("mountain-view-alerts-2026-11-24.html").toString();

const local = moLocalCalendars.map(({ id, fips, kind, source, parse }) => {
  const fixture = read(`rule-${id}-2026-11-24.${kind}`);
  return { id, fips, source, parse, fixture, rows: () => parse(new Response(fixture), now) };
});

test("Cape Girardeau's no-burn day expires at midnight Central and covers city limits", async () => {
  const rows = await parseCapeGirardeauDay(cape, now);
  expect(rows.map(({ fips }) => fips)).toEqual(["29031", "29201"]);
  for (const row of rows) {
    expect(row).toMatchObject({
      scope: "part", scopeNote: "City of Cape Girardeau", status: "restricted",
      since: "2026-11-24", validFrom: "2026-11-24T06:00:00.000Z", validUntil: "2026-11-25T06:00:00.000Z",
    });
  }
  const permissive = cape.replace('a <span class="status-text">No Burn Day', '<span class="status-text">Okay to Burn');
  expect(await parseCapeGirardeauDay(permissive, now)).toEqual([]);
  await expect(parseCapeGirardeauDay(cape, new Date("2026-11-25T06:00Z"))).rejects.toThrow("not for today");
  await expect(parseCapeGirardeauDay(cape.replace("No Burn Day", "Check Later"), now)).rejects.toThrow("changed");
  await expect(parseCapeGirardeauDay(cape + cape, now)).rejects.toThrow("changed");
});

test("Lake Ozark's current Burn Day permits no county inference and no-burn days stay in the district", async () => {
  expect(await parseLakeOzarkDay(lake, now)).toEqual([]);
  const closed = lake.replace(">Burn Day<", ">NO Burn Day<");
  const rows = await parseLakeOzarkDay(closed, now);
  expect(rows.map(({ fips }) => fips)).toEqual(["29029", "29131"]);
  for (const row of rows) expect(row).toMatchObject({
    scope: "part", scopeNote: "Lake Ozark Fire Protection District", status: "restricted",
    validUntil: "2026-11-25T06:00:00.000Z",
  });
  await expect(parseLakeOzarkDay(lake.replace("24,", "25,"), now)).rejects.toThrow("not for today");
  await expect(parseLakeOzarkDay(lake.replace(">Burn Day<", ">Testing<"), now)).rejects.toThrow("changed");
});

test("CivicEngage reads active cards and Mountain View uses the effective date in the notice", async () => {
  const alerts = await civicPlusActiveAlerts(mountain, moMountainView.sourceUrl);
  expect(alerts.map(({ title }) => title)).toEqual(["Burn Ban", "YOUR VOICE MATTERS!"]);
  expect(await parseMountainViewAlerts(mountain, now)).toEqual([expect.objectContaining({
    fips: "29091", scope: "part", scopeNote: "City of Mountain View", status: "ban", since: "2026-10-30",
    officialUrl: "https://www.mountainviewmo.gov/AlertCenter.aspx?AID=Burn-Ban-38",
  })]);
  expect(await parseMountainViewAlerts(mountain.replace('class="alert on first"', 'class="alert off first"'), now)).toEqual([]);
  await expect(parseMountainViewAlerts(mountain.replace("10-30-2026", "11-30-2026"), now)).rejects.toThrow("unverified");
  await expect(parseMountainViewAlerts(mountain.replace(">Alert Center<", ">Archive<"), now)).rejects.toThrow("Alert Center");
});

test("reviewed rules produce only positive, recurring scoped rows from their own fixtures", async () => {
  for (const entry of local) {
    expect(SOURCES).toContain(entry.source);
    expect(entry.source).toMatchObject({ mode: "positive-only", recurring: true, scope: "part" });
    const rows = await entry.rows();
    expect(rows.map(({ fips }) => fips)).toEqual(entry.fips);
    for (const row of rows) expect(row).toMatchObject({
      status: "restricted", sourceId: entry.source.id, officialUrl: entry.source.officialUrl,
    });
  }
  const html = local.find(({ id }) => id === "joplin");
  const edited = html.fixture.toString().replace("residential vegetative material", "commercial vegetative material");
  expect(edited).not.toBe(html.fixture.toString());
  await expect(html.parse(new Response(edited), now)).rejects.toThrow("rule changed");
  const pdf = local.find(({ id }) => id === "nevada");
  await expect(pdf.parse(new Response(read("epa-open-burning-2026-11-24.pdf")), now)).rejects.toThrow("rule changed");
});

test("new reports add county coverage without converting local decisions into countywide permission", async () => {
  const base = [
    { source: moShowMeFireBans, rows: parseShowMeFireBans(JSON.parse(read("show-me-fire-active-2026-11-24.json")), now), checked },
    { source: moYardWaste, rows: await parseMoYardWaste(await extractHtml(new Response(read("epa-sip-2026-11-24.html")), { links: true }),
      now, async (url) => new Response(read(url === moYardWaste.officialUrl ? "epa-open-burning-2026-11-24.pdf" : "epa-definitions-2026-11-24.pdf"))), checked },
  ];
  const initial = mergeSources(null, base, now).snapshot;
  const { snapshot } = mergeSources(null, [
    ...base,
    { source: moCapeGirardeau, rows: await parseCapeGirardeauDay(cape, now), checked },
    { source: moLakeOzark, rows: await parseLakeOzarkDay(lake, now), checked },
    { source: moMountainView, rows: await parseMountainViewAlerts(mountain, now), checked },
    ...await Promise.all(local.map(async ({ source, rows }) => ({ source, rows: await rows(), checked }))),
  ], now);
  const counties = countiesInState("MO");
  expect(counties.filter(({ fips }) => initial.counties[fips] === undefined)).toHaveLength(109);
  expect(counties.filter(({ fips }) => snapshot.counties[fips]?.status === "ban").map(({ fips }) => fips)).toEqual(["29059"]);
  expect(counties.filter(({ fips }) => snapshot.counties[fips]?.status === "restricted")).toHaveLength(61);
  expect(counties.filter(({ fips }) => !initial.counties[fips] &&
    snapshot.counties[fips]?.status === "restricted")).toHaveLength(56);
  expect(counties.filter(({ fips }) => !snapshot.counties[fips])).toHaveLength(53);
  expect(Object.values(snapshot.counties).some(({ status }) => status === "none")).toBe(false);
  expect(snapshot.counties["29091"]).toMatchObject({ status: "restricted", scope: "part",
    orders: [expect.objectContaining({ status: "ban", scopeNote: "City of Mountain View" })],
  });
  expect(snapshot.counties["29031"].orders).toContainEqual(expect.objectContaining({ label: "City no-burn day" }));
  expect(snapshot.counties["29227"]).toBeUndefined();
});

test("each new Missouri source parses its fixture under 4 ms p95 thread CPU", async () => {
  const jobs = [
    { id: moCapeGirardeau.id, rows: () => parseCapeGirardeauDay(cape, now) },
    { id: moLakeOzark.id, rows: () => parseLakeOzarkDay(lake, now) },
    { id: moMountainView.id, rows: () => parseMountainViewAlerts(mountain, now) },
    ...local,
  ];
  for (const { id, rows } of jobs) {
    for (let index = 0; index < 8; index++) await rows();
    const samples = [];
    for (let index = 0; index < 25; index++) {
      const start = process.threadCpuUsage();
      await rows();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    samples.sort((a, b) => a - b);
    expect(samples[Math.ceil(samples.length * 0.95) - 1], id).toBeLessThan(4);
  }
});
