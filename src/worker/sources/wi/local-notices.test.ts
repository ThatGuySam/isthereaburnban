// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { civicPlusNewsFlashArticle } from "../lib/civicplus";
import { parseMenomoneeNotices, parseVernonNotices } from "./local-notices";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const captured = new Date("2026-11-25T06:14:00Z");
const clinton = fixture("clinton-orders.json");
const safetyFeed = fixture("menomonee-safety.xml");
const activeArticle = fixture("menomonee-current-article.html");
const archivedBan = fixture("menomonee-archive-ban.html");
const readUnexpected = () => { throw new Error("No article should be fetched"); };

function vernonAsOf(now) {
  return JSON.stringify(JSON.parse(clinton).filter(({ date_gmt }) => new Date(date_gmt + "Z") <= now));
}

test("the real Vernon order and lift sequence produces bans only before their matching lift", () => {
  for (const [issue, check, lift] of [
    ["2024-03-01", "2024-03-03T17:00:00Z", "2024-03-07T17:00:00Z"],
    ["2024-03-17", "2024-03-19T17:00:00Z", "2024-03-26T17:00:00Z"],
  ]) {
    const date = new Date(check);
    expect(parseVernonNotices(vernonAsOf(date), date)).toMatchObject([{
      fips: "55123", status: "ban", scope: "county", since: issue,
      officialUrl: expect.stringContaining("tn.clinton.wi.gov"),
    }]);
    expect(parseVernonNotices(vernonAsOf(new Date(lift)), new Date(lift))).toEqual([]);
  }
  expect(parseVernonNotices(clinton, captured)).toEqual([]);
});

test("Vernon rejects recent notices with missing county authority, unrecognized lift language or invalid dates", () => {
  const date = new Date("2024-03-19T17:00:00Z");
  expect(() => parseVernonNotices(vernonAsOf(date).replace("County Wide Burn Ban for Vernon County, EFFECTIVE", "Burn Ban for Town of Clinton, EFFECTIVE"), date)).toThrow("countywide issuing authority");
  expect(() => parseVernonNotices(clinton, date)).toThrow("invalid burn-ban notice date");
  expect(() => parseVernonNotices(clinton.replace("CANCELLATION (pdf)", "MORE INFORMATION"), new Date("2024-03-26T17:00:00Z"))).toThrow("changed cancellation");
  const issueOnly = JSON.stringify(JSON.parse(clinton).filter(({ id }) => id === 2520));
  expect(parseVernonNotices(issueOnly, captured)).toEqual([]);
});

test("the current Safety Strategies feed has no ban, and an archived CivicPlus article cannot supply one", async () => {
  expect(await parseMenomoneeNotices(safetyFeed, captured, readUnexpected)).toEqual([]);
  expect(await civicPlusNewsFlashArticle(activeArticle)).toMatchObject({
    category: "Safety Strategies", posted: "2026-10-15", body: expect.stringContaining("Menomonee Falls Police Department"),
  });
  await expect(civicPlusNewsFlashArticle(archivedBan)).rejects.toThrow();
  await expect(parseMenomoneeNotices(safetyFeed.replace("Safety Strategies", "Village News"), captured, readUnexpected)).rejects.toThrow("changed");
});

test("a dated active CivicPlus notice needs explicit authorization and village scope", async () => {
  const notice = `<item><title>Burn Ban</title><link>https://www.menomoneefalls.gov/CivicAlerts.aspx?aid=1678</link>
    <pubDate>Fri, 14 Mar 2025 08:00:00 -0500</pubDate><guid>1678</guid></item>`;
  const feed = safetyFeed.replace("</channel>", notice + "</channel>");
  const archiveBody = /<p style="margin: 0px 0px 6px;[\s\S]*?<\/p>/.exec(archivedBan)?.[0];
  expect(archiveBody).toContain("Fire Chief has instituted");
  const activeBan = activeArticle.replace("Fall Deer Rut Increases Crash Risk for Wisconsin Motorists", "Burn Ban")
    .replace("October 15, 2026", "March 14, 2025")
    .replace(/(<div class="article-content redesign-text fr-view">)[\s\S]*?<\/div>/, `$1${archiveBody}</div>`);
  const day = new Date("2025-03-14T15:00:00Z");
  expect(await parseMenomoneeNotices(feed, day, async () => activeBan)).toMatchObject([{
    status: "ban", fips: "55133", scope: "part", scopeNote: "Village of Menomonee Falls", since: "2025-03-14",
  }]);
  await expect(parseMenomoneeNotices(feed, day, async () => activeBan.replace("Fire Chief has instituted", "DNR has suggested")))
    .rejects.toThrow("unrecognized village burn-ban notice");
  expect(await parseMenomoneeNotices(feed, captured, readUnexpected)).toEqual([]);
});

test("notice fixture parsing stays below 5 ms p95", async () => {
  const samples = [];
  for (let i = 0; i < 80; i++) {
    const start = performance.now();
    parseVernonNotices(clinton, captured);
    await parseMenomoneeNotices(safetyFeed, captured, readUnexpected);
    await civicPlusNewsFlashArticle(activeArticle);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  expect(samples[75]).toBeLessThan(5);
});
