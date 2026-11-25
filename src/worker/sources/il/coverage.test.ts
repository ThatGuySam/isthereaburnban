// @ts-nocheck -- bun test types are not installed; this file runs under Bun.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { ilCrawfordCountyOrders, parseCrawfordCountyOrders } from "./crawford";
import { illinoisGuidanceSources, parseIllinoisGuidance } from "./guidance";

const captured = new Date("2026-11-24T15:37:59Z");
const fixture = (file) => readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8");
const pages = {
  state: fixture("epa-faq-2026-11-24.html"),
  cook: fixture("cook-permit-2026-11-24.html"),
  kane: fixture("kane-rules-2026-11-24.html"),
  lake: fixture("lake-rules-2026-11-24.html"),
  naperville: fixture("naperville-rules-2026-11-24.html"),
};
const news = fixture("wtye-crawford-2026-11-24.json");
const archive = fixture("wtye-crawford-2025-archive.json");
const confirmation = fixture("wtye-crawford-2025-confirmation.json");
const orders = (at = captured, input = news) => parseCrawfordCountyOrders(JSON.parse(input), at);

test("Illinois publishes 102 activity-specific state rows and only the mapped local jurisdictions", async () => {
  const state = await parseIllinoisGuidance(pages.state, "state", captured);
  expect(state).toHaveLength(102);
  expect(new Set(state.map(({ fips }) => fips)).size).toBe(102);
  for (const row of state) expect(row).toMatchObject({
    state: "IL", status: "restricted", scope: "state", scopeNote: "Open burning covered by Illinois air-pollution rules",
    checked: captured.toISOString(), since: null, sourceUpdated: null,
  });

  const local = {
    cook: { fips: ["17031"], scopeNote: "Suburban and unincorporated Cook County" },
    kane: { fips: ["17089"], scopeNote: "Unincorporated Kane County" },
    lake: { fips: ["17097"], scopeNote: "Unincorporated Lake County" },
    naperville: { fips: ["17043", "17197"], scopeNote: "City of Naperville" },
  };
  for (const [key, { fips, scopeNote }] of Object.entries(local)) {
    const rows = await parseIllinoisGuidance(pages[key], key, captured);
    expect(rows.map((row) => row.fips)).toEqual(fips);
    for (const row of rows) expect(row).toMatchObject({ status: "restricted", scope: "part", scopeNote });
  }
});

test("Lake County's woody-waste rule starts in April and stops in November, Central time", async () => {
  const read = (date) => parseIllinoisGuidance(pages.lake, "lake", new Date(date));
  const opening = await read("2027-04-01T04:59:59Z");
  expect(opening[1]).toMatchObject({
    scope: "part", status: "restricted", scopeNote: "Woody yard waste in unincorporated Lake County",
    since: "2027-04-01", expires: "2027-10-31", validFrom: "2027-04-01T05:00:00.000Z",
  });
  expect(await read("2027-04-01T05:00:00Z")).toHaveLength(2);
  const closing = await read("2027-11-01T04:59:59Z");
  expect(closing[1].validUntil).toBe("2027-11-01T05:00:00.000Z");
  expect(await read("2027-11-01T05:00:00Z")).toHaveLength(1);
});

test("Illinois guidance fails closed when geography, permit conditions or season wording changes", async () => {
  const changes = {
    state: ["generally prohibited", "usually allowed"],
    cook: ["suburban and unincorporated Cook County", "Cook County"],
    kane: ["60542", "60543"],
    lake: ["March 31", "April 30"],
    naperville: ["require an open burn permit", "require a state approval code"],
  };
  for (const [key, [from, to]] of Object.entries(changes)) {
    expect(pages[key]).toContain(from);
    await expect(parseIllinoisGuidance(pages[key].replace(from, to), key, captured)).rejects.toThrow();
  }
  await expect(parseIllinoisGuidance("<title>Maintenance</title>", "state", captured)).rejects.toThrow();
});

test("Crawford reads the sheriff's countywide issue and matches historical lifts in the same feed", () => {
  const rows = orders();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "17033", county: "Crawford", status: "ban", scope: "county",
    sourceUpdated: "2026-11-20T11:36:59.000Z", since: null, expires: null,
    validUntil: "2026-11-27T11:36:59.000Z",
    officialUrl: "https://www.wtyefm.com/2026/11/20/countywide-burn-ban-now-in-effect-2/",
  });
  expect(rows[0].note).toContain("Enclosed cooking fires");
  const early = JSON.stringify(JSON.parse(archive).filter(({ id }) => id !== 166526));
  expect(orders(new Date("2025-10-06T18:00:00Z"), early).map(({ status }) => status)).toEqual(["ban"]);
  expect(orders(new Date("2025-10-08T18:00:00Z"), archive)).toEqual([]);
  expect(orders(new Date("2025-09-18T18:00:00Z"), confirmation)[0].sourceUpdated).toBe("2025-09-16T11:49:34.000Z");
  expect(orders(new Date("2026-11-27T11:36:59Z"))).toEqual([]);
  expect(orders(captured, "[]")).toEqual([]);
});

test("Crawford rejects future, malformed and unrecognized notices and excludes other counties", () => {
  expect(() => orders(new Date("2026-11-20T11:36:58Z"))).toThrow("publication date");
  expect(() => orders(captured, news.replace("2026-11-20T11:36:59", "2026-11-31T11:36:59"))).toThrow("publication date");
  expect(() => orders(captured, news.replace("Now in Effect", "Update"))).toThrow("unrecognized");
  expect(() => orders(captured, news.replace("enclosed fires for the cooking such as grills", "fish fries"))).toThrow("unrecognized");
  expect(() => orders(captured, JSON.stringify([{ ...JSON.parse(news)[0], content: {} }]))).toThrow("notice body");
  expect(orders(captured, news.replaceAll("Crawford County", "Lawrence County"))).toEqual([]);
});

test("Crawford uses the publisher's stable post URL when WordPress supplies a different permalink", () => {
  const [post] = JSON.parse(news);
  const changed = JSON.stringify([{ ...post, link: "https://www.wtyefm.com/countywide-burn-ban-now-in-effect-2/" }]);
  expect(orders(captured, changed)[0].officialUrl).toBe("https://www.wtyefm.com/?p=257114");
  expect(() => orders(captured, changed.replace("www.wtyefm.com", "untrusted.example"))).toThrow("station");
});

test("Illinois merges the current ban with the standing restrictions and retains local scopes", async () => {
  const sources = Object.entries(illinoisGuidanceSources);
  const inputs = await Promise.all(sources.map(async ([key, source]) => {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ recurring: true, mode: "positive-only", coverage: "restrictions" });
    return { source, rows: await parseIllinoisGuidance(pages[key], key, captured), checked: captured.toISOString() };
  }));
  expect(SOURCES).toContain(ilCrawfordCountyOrders);
  const baseline = mergeSources(null, inputs, captured).snapshot;
  const orderInput = { source: ilCrawfordCountyOrders, rows: orders(), checked: captured.toISOString() };
  const { snapshot, transitions } = mergeSources(baseline, [...inputs, orderInput], captured);
  const statuses = Object.values(snapshot.counties).map(({ status }) => status);
  expect(statuses.filter((status) => status === "ban")).toHaveLength(1);
  expect(statuses.filter((status) => status === "restricted")).toHaveLength(101);
  expect(snapshot.counties["17033"].status).toBe("ban");
  expect(snapshot.counties["17097"].orders).toMatchObject([{ scope: "part", scopeNote: "Unincorporated Lake County" }]);
  expect(snapshot.counties["17043"].orders).toMatchObject([{ scope: "part", scopeNote: "City of Naperville" }]);
  expect(transitions).toEqual([{
    fips: "17033", oldStatus: "restricted", newStatus: "ban", at: captured.toISOString(),
  }]);
  const noCurrentNotice = mergeSources(snapshot, [...inputs, { ...orderInput, rows: [] }], captured);
  expect(noCurrentNotice.snapshot.counties["17033"].status).toBe("restricted");
  expect(noCurrentNotice.transitions).toEqual([]);
});

test.each([...Object.keys(pages), "crawford"])("Illinois %s fixture stays under 4 ms p95 thread CPU", async (key) => {
  const parse = key === "crawford" ? orders : () => parseIllinoisGuidance(pages[key], key, captured);
  for (let i = 0; i < 10; i++) await parse();
  const samples = [];
  for (let i = 0; i < 40; i++) {
    const start = process.threadCpuUsage();
    await parse();
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
});
