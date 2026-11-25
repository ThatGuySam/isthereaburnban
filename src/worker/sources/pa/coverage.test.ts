// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { statusFor } from "../../lookup";
import { civicPlusNewsFlash } from "../lib/civicplus";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { paCarrollValley, parseCarrollValley } from "./carroll-valley";
import { paStateForestSpring, parsePaStateForestSpring } from "./seasonal";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.html`, import.meta.url), "utf8");
const news = fixture("carroll-valley-news");
const statute = fixture("state-forest-fires");
const captured = new Date("2026-11-24T08:11:00Z");
const parseSpring = async (now, html = statute) => parsePaStateForestSpring(await extractHtml(html), now);

test("CivicPlus reads the complete active category and validates publication dates", async () => {
  const carousel = '<li><h3 class="article-list-header">Older burn ban</h3></li>';
  const parse = (input) => civicPlusNewsFlash(input, { id: 5, name: "Borough News & Announcement" });
  expect(await parse(carousel + news)).toMatchObject([
    { title: "Proposed 2027 Budget", posted: "2026-11-11" },
    { title: "Ban on Open Burning now in Effect", posted: "2026-11-20", updated: "2026-11-20" },
  ]);
  await expect(parse(news.replace("2\n                <span", "3\n                <span")))
    .rejects.toThrow("complete active category");
  await expect(parse(news.replace("Posted on November 20, 2026", "Posted on November 31, 2026")))
    .rejects.toThrow("valid publication date");
});

test("Carroll Valley's current notice reports one borough ban and no countywide status", async () => {
  const rows = await parseCarrollValley(news, captured);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "42001", scope: "part", scopeNote: "Carroll Valley Borough, outdoor open burning", status: "ban",
    since: null, expires: null, sourceUpdated: "2026-11-20", validUntil: "2026-12-04T05:00:00.000Z",
  });
  const { snapshot } = mergeSources(null, [{ source: paCarrollValley, rows, checked: captured.toISOString() }], captured);
  const statuses = countiesInState("PA").map(({ fips }) => statusFor(snapshot, fips, Date.parse(snapshot.generated)));
  expect(statuses.filter(({ status }) => status === "restricted").map(({ fips }) => fips)).toEqual(["42001"]);
  expect(statuses.filter(({ status }) => status === "unknown")).toHaveLength(66);
  expect(statusFor(snapshot, "42001", Date.parse(snapshot.generated)).orders).toMatchObject([{ status: "ban", scope: "part" }]);
});

test("A later borough lift clears the report, and unknown, future and stale notices cannot create a ban", async () => {
  const lift = news.replaceAll("Proposed 2027 Budget", "Open Burning Ban Lifted")
    .replace("Carroll Valley Borough&apos;s proposed 2027 budget keeps", "The ban has been lifted. The borough keeps")
    .replace("November 11, 2026", "November 24, 2026");
  expect(await parseCarrollValley(lift, captured)).toEqual([]);
  expect(await parseCarrollValley(news, new Date("2026-12-04T05:00Z"))).toEqual([]);
  await expect(parseCarrollValley(news, new Date("2026-11-19T20:00Z"))).rejects.toThrow("ambiguous");
  await expect(parseCarrollValley(lift.replace("November 24", "November 20"), captured)).rejects.toThrow("ambiguous");
  await expect(parseCarrollValley(news.replace("until further notice", "when needed"), captured)).rejects.toThrow("unrecognized");
});

test("The spring state forest restriction follows Eastern dates and applies only in mapped counties", async () => {
  expect(paStateForestSpring.recurring).toBe(true);
  expect(await parseSpring(captured)).toEqual([]);
  expect(await parseSpring(new Date("2026-03-01T04:59:59Z"))).toEqual([]);
  const march = await parseSpring(new Date("2026-03-01T05:00:00Z"));
  expect(march).toHaveLength(51);
  expect(march.find(({ fips }) => fips === "42095")).toMatchObject({
    status: "restricted", scope: "part", scopeNote: "Fire rings and fireplaces on state forest lands within the county",
    validFrom: "2026-03-01T05:00:00.000Z", validUntil: "2026-03-02T05:00:00.000Z",
  });
  expect(march.map(({ fips }) => fips)).not.toContain("42101");
  expect(await parseSpring(new Date("2026-05-26T03:59:59Z"))).toHaveLength(51);
  expect(await parseSpring(new Date("2026-05-26T04:00:00Z"))).toEqual([]);
  await expect(parseSpring(captured, statute.replace("May 25", "May 31"))).rejects.toThrow("text changed");
});

for (const [id, parse] of [
  [paCarrollValley.id, () => parseCarrollValley(news, captured)],
  [paStateForestSpring.id, () => parseSpring(new Date("2026-05-25T15:00Z"))],
]) {
  test(`${id} parses its publisher fixture in under 5 ms p95`, async () => {
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
