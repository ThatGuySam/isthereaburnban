// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseEastLansingFireNotices } from "./east-lansing-news";

const fixture = (type, extension = "html") =>
  readFileSync(new URL(`./fixtures/county-pass/east-lansing-${type}-2026-11-25.${extension}`, import.meta.url), "utf8");
const feed = fixture("news", "xml");
const active = fixture("active");
const archive = fixture("archive");
const now = new Date("2026-11-25T19:15:00Z");
const issueTitle = "ELFD Issues Burning Ban Due to Dry Conditions, Lack of Rain";
const foodTitle = "East Lansing Fire Department Offers Safety Tips for Thanksgiving Cooking";
const listed = feed.replace(foodTitle, issueTitle).replace("aid=2616", "aid=1906");
const archiveBody = archive.match(/(<p id="isPasted">EAST LANSING[\s\S]*?)<\/div>/)[1];
const article = active.replace(foodTitle, issueTitle)
  .replace(/(<div class="article-content redesign-text fr-view">)[\s\S]*?<\/div>/, `$1${archiveBody}</div>`);
const withoutRequest = async () => { throw new Error("Unexpected article fetch"); };

test("the real active feed carries no burn decision and the historical article remains archived", async () => {
  expect(await parseEastLansingFireNotices(feed, now, withoutRequest)).toEqual([]);
  await expect(parseEastLansingFireNotices(listed, now, async () => archive)).rejects.toThrow("expected an active article");
  await expect(parseEastLansingFireNotices(feed.replace("</rss>", ""), now, withoutRequest)).rejects.toThrow("RSS channel");
});

test("an active city issue is scoped to the city within its two counties", async () => {
  const rows = await parseEastLansingFireNotices(listed, now, async (url) => {
    expect(url).toBe("https://www.cityofeastlansing.com/m/newsflash/Home/Detail/1906");
    return article;
  });
  expect(rows.map(({ fips }) => fips)).toEqual(["26037", "26065"]);
  expect(rows.every(({ status, scope, scopeNote }) =>
    status === "ban" && scope === "part" && scopeNote === "Within the City of East Lansing")).toBe(true);
  await expect(parseEastLansingFireNotices(listed, now, async () => article.replace("all property within", "public parks in")))
    .rejects.toThrow("scope or duration");
  await expect(parseEastLansingFireNotices(listed, now, async () => article.replaceAll(
    /(?:ban is in effect|no new outdoor burn permits will be issued) until further notice/gi,
    "the ban starts tomorrow and runs until further notice",
  ))).rejects.toThrow("scope or duration");
});

test("the latest visible lift clears the city source", async () => {
  const liftedTitle = "ELFD Lifts Burning Ban";
  const lift = listed.replace(issueTitle, liftedTitle);
  const oldItem = listed.match(/<item>[\s\S]*?<\/item>/)[0]
    .replace("Tue, 24 Nov 2026", "Mon, 23 Nov 2026");
  expect(await parseEastLansingFireNotices(
    lift.replace("</channel>", oldItem + "</channel>"), now, async () => article.replace(issueTitle, liftedTitle),
  )).toEqual([]);
});

test("the live CivicPlus feed and active issue replay parse below 5 ms p95", async () => {
  const timings = [];
  for (let i = 0; i < 22; i++) {
    const start = performance.now();
    await parseEastLansingFireNotices(listed, now, async () => article);
    timings.push(performance.now() - start);
  }
  expect(timings.sort((a, b) => a - b)[20]).toBeLessThan(5);
});
