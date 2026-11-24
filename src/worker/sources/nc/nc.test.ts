// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { ncAirHours, parseNcAirHours } from "./air-hours";
import { applyNcOrders, ncNoticeKind, parseNcNewsroom, parseNcOrder } from "./forest-orders";
import { ncPermits, parseNcPermits } from "./permits";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
const now = new Date("2026-11-24T12:00:00Z");
const newsroom = fixture("newsroom-2026-11-24");
const olderNews = fixture("newsroom-page-2-2026-11-24");
const statute = fixture("article-78-2026-11-24");
const deq = fixture("deq-hours-2026-11-24");
const issue = fixture("issue-2026-03-28");
const partial = fixture("partial-lift-2026-05-02");
const final = fixture("final-lift-2026-05-07");

async function springOrders() {
  const listings = [...await parseNcNewsroom(newsroom, "2026-11-24"), ...await parseNcNewsroom(olderNews, "2026-04-27")];
  const articles = [[issue, "2026-03-28"], [partial, "2026-05-02"], [final, "2026-05-07"]];
  return Promise.all(articles.map(async ([html, day]) => parseNcOrder(
    await extractHtml(html), listings.find(({ published }) => day === published),
  )));
}

test("NC Forest Service March issue and two May lifts use their effective times and exact county sets", async () => {
  const orders = await springOrders();
  const before = applyNcOrders(orders, new Date("2026-03-28T21:59:59Z"));
  expect(before).toHaveLength(100);
  expect(before[0].validFrom).toBe("2026-03-28T22:00:00.000Z");
  expect(orders.map(({ kind, counties }) => [kind, counties.length])).toEqual([["issue", 100], ["lift", 81], ["lift", 19]]);
  const may3BeforeLift = applyNcOrders(orders, new Date("2026-05-03T11:59:59Z"));
  expect(may3BeforeLift).toHaveLength(100);
  expect(may3BeforeLift.find(({ fips }) => fips === "37183").validUntil).toBe("2026-05-03T12:00:00.000Z");
  const may3 = applyNcOrders(orders, new Date("2026-05-03T12:00:00Z"));
  expect(may3).toHaveLength(19);
  expect(may3.every(({ scope, status }) => scope === "part" && status === "ban")).toBe(true);
  expect(may3.map(({ county }) => county).sort()).toEqual(orders[2].counties.map(({ name }) => name).sort());
  expect(applyNcOrders(orders, new Date("2026-05-08T12:00:00Z"))).toEqual([]);
  expect(applyNcOrders(orders.slice(0, 1), now)).toEqual([]);
});

test("NC Forest Service county issues map only the named counties", async () => {
  const samples = [
    ["expansion-2023-11-08", "Burn ban expanded to add 16 more counties in Western NC", "2023-11-08", "2023-11-08T22:00:00.000Z", 16],
    ["issue-2021-05-24", "Burn ban issued for 26 North Carolina counties due to hazardous forest fire conditions", "2021-05-24", "2021-05-24T16:00:00.000Z", 26],
  ];
  for (const [file, title, published, timestamp, count] of samples) {
    const order = parseNcOrder(await extractHtml(fixture(file)), { title, published, url: "https://www.ncagr.gov/" });
    expect(order.effective).toBe(timestamp);
    expect(order.counties).toHaveLength(count);
    expect(order.counties.some(({ fips }) => fips === "37183")).toBe(false);
  }
});

test("NC newsroom rejects changes, future dates, and unrecognized order language", async () => {
  const latest = await parseNcNewsroom(newsroom, "2026-11-24");
  expect(latest).toHaveLength(20);
  expect(latest[0].published).toBe("2026-09-23");
  expect(ncNoticeKind(latest[0].title)).toBeUndefined();
  expect(ncNoticeKind(latest.at(-1).title)).toBeUndefined();
  await expect(parseNcNewsroom(newsroom, "2026-09-22")).rejects.toThrow("title, link or date");
  await expect(parseNcNewsroom(newsroom.replaceAll("views-row", "article-row"), "2026-11-24")).rejects.toThrow("missing newsroom");
  await expect(parseNcNewsroom(newsroom.replace("Wednesday, September 23", "Tuesday, September 23"), "2026-11-24")).rejects.toThrow("title, link or date");
  expect(() => ncNoticeKind("Update on the burn ban")).toThrow("unrecognized");
  const listing = latest.find(({ published }) => published === "2026-05-07");
  const badCounty = await extractHtml(final.replaceAll("Alamance", "Atlantis"));
  expect(() => parseNcOrder(badCounty, listing)).toThrow("unrecognized or duplicate county");
  const badTime = await extractHtml(final.replaceAll("8 a.m. Friday, May 8", "8 a.m. Thursday, May 8"));
  expect(() => parseNcOrder(badTime, listing)).toThrow("unrecognized order date");
});

test("NC statutory rules map 21 all-day and 79 daytime woodland permit counties", async () => {
  const parts = await extractHtml(statute);
  const rows = await parseNcPermits(parts, now);
  expect(new Set(rows.map(({ fips }) => fips)).size).toBe(100);
  expect(rows.filter(({ label }) => label === "Woodland burn permit required all day")).toHaveLength(21);
  for (const fips of ["37129", "37141"]) {
    expect(rows.some((row) => row.fips === fips && row.label === "Woodland burn permit required all day")).toBe(true);
  }
  expect(rows.filter(({ label }) => label === "Woodland burn permit required before 4 p.m.")).toHaveLength(79);
  expect(rows.find(({ fips }) => fips === "37183").validUntil).toBe("2026-11-24T21:00:00.000Z");
  expect(rows.find(({ label }) => label === "Special-permit land-clearing burn hours").validUntil).toBe("2026-11-24T13:00:00.000Z");
  await expect(parseNcPermits(await extractHtml(statute.replace("New Hanover,", "")), now)).rejects.toThrow("106-942");
  await expect(parseNcPermits(await extractHtml(statute.replace("within 100 feet", "within 200 feet")), now)).rejects.toThrow("106-950");
});

test("NC air-quality hours change the activity-specific status without scheduled alerts", async () => {
  const [permits, air] = await Promise.all([extractHtml(statute), extractHtml(deq)]);
  const report = async (when: string, before = null) => {
    const current = new Date(when);
    const checked = current.toISOString();
    return mergeSources(before, [
      { source: ncPermits, checked, rows: await parseNcPermits(permits, current) },
      { source: ncAirHours, checked, rows: await parseNcAirHours(air, current) },
    ], current);
  };
  const first = await report("2026-11-24T20:59:59Z");
  const mid = await report("2026-11-24T21:00:00Z", first.snapshot);
  const late = await report("2026-11-24T23:00:00Z", mid.snapshot);
  expect(ncAirHours.recurring && ncPermits.recurring).toBe(true);
  expect(first.snapshot.counties["37183"].status).toBe("restricted"); // Wake
  expect(mid.snapshot.counties["37183"].status).toBe("unknown");
  expect(mid.snapshot.counties["37129"].status).toBe("restricted"); // New Hanover
  expect(late.snapshot.counties["37183"].status).toBe("restricted");
  expect(late.snapshot.counties["37183"].orders[0].scope).toBe("part");
  expect(mid.transitions.concat(late.transitions)).toEqual([]);
  await expect(parseNcAirHours(await extractHtml(deq.replace("6 p.m.", "4 p.m.")), now)).rejects.toThrow("guidance changed");
});

test("NC parsers use well under 10 ms of thread CPU on publisher fixtures", async () => {
  for (const run of [
    async () => applyNcOrders(await springOrders(), new Date("2026-05-03T11:59:59Z")),
    async () => parseNcPermits(await extractHtml(statute), now),
    async () => parseNcAirHours(await extractHtml(deq), now),
  ]) {
    for (let i = 0; i < 8; i++) await run();
    const samples = [];
    for (let i = 0; i < 40; i++) {
      const start = process.threadCpuUsage();
      await run();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    samples.sort((a, b) => a - b);
    expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(5);
  }
});
