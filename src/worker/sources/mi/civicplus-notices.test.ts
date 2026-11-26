// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { civicPlusNewsFlashArticle, latestCivicPlusNewsFlashNotice } from "../lib/civicplus";
import { miCivicPlusNotices } from "./civicplus-notices";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const battleFeed = fixture("battle-creek-rss-2026-11-25.xml");
const grandLedgeFeed = fixture("grand-ledge-rss-2026-11-25.xml");
const captured = new Date("2026-11-25T06:51:00Z");
const [battle, grandLedge] = miCivicPlusNotices;
const unexpectedArticle = async () => { throw new Error("Unexpected follow-up article"); };
const withNotice = (xml, title, url, pubDate = "Tue, 24 Nov 2026 15:00:00 -0500") =>
  xml.replace("</channel>", `<item><title>${title}</title><link>${url}</link><pubDate>${pubDate}</pubDate></item></channel>`);

test("Michigan CivicPlus polls find no burn story in the real active feeds", async () => {
  expect(await battle.parse(battleFeed, captured, unexpectedArticle)).toEqual([]);
  expect(await grandLedge.parse(grandLedgeFeed, captured, unexpectedArticle)).toEqual([]);
  const article = await civicPlusNewsFlashArticle(fixture("grand-ledge-current.html"));
  expect(article).toMatchObject({ category: "*Public Notices", posted: "2026-11-17" });
});

test("a Grand Ledge notice maps the city in both counties and rejects its archived template", async () => {
  const title = "PUBLIC NOTICE: Burn Ban in Effect";
  const url = "https://www.cityofgrandledge.com/CivicAlerts.aspx?aid=188";
  const xml = withNotice(grandLedgeFeed, title, url);
  const archive = fixture("grand-ledge-archive.html");
  await expect(grandLedge.parse(xml, captured, async () => archive)).rejects.toThrow("active article");
  const body = archive.match(/<p id="isPasted">As of, June 21, 2023,[\s\S]*?<\/p>/)?.[0]
    .replace("June 21, 2023", "November 24, 2026");
  expect(body).toBeTruthy();
  const article = `<main id="main-wrapper">
    <div class="article-header-content"><h1 class="article-header-title">${title}</h1></div>
    <span id="article-header-tag">*Public Notices</span>
    <span id="article-header-date">Posted on November 24, 2026</span>
    <div class="article-content redesign-text">${body}</div>
  </main>`;
  expect(await grandLedge.parse(xml, captured, async (href) => {
    expect(href).toBe(url);
    return article;
  })).toMatchObject([
    { fips: "26045", scope: "part", scopeNote: "City of Grand Ledge", status: "restricted", officialUrl: url },
    { fips: "26037", scope: "part", scopeNote: "City of Grand Ledge", status: "restricted", officialUrl: url },
  ]);
  await expect(grandLedge.parse(xml, captured, async () =>
    article.replace("will not issue burn permits", "has resumed issuing permits"))).rejects.toThrow("unrecognized");
  const late = new Date("2026-12-10T06:00:00Z");
  expect(await grandLedge.parse(xml, late, unexpectedArticle)).toEqual([]);
});

test("CivicPlus feed validation rejects wrong channels, incomplete RSS and off-site articles", () => {
  const options = {
    origin: "https://www.battlecreekmi.gov", channelTitle: "Battle Creek, MI - News Flash - Fire Department News",
    now: captured, matches: (title) => title.includes("Burn Ban"),
  };
  expect(latestCivicPlusNewsFlashNotice(battleFeed, options)).toBeUndefined();
  expect(() => latestCivicPlusNewsFlashNotice(grandLedgeFeed, options)).toThrow("changed");
  expect(() => latestCivicPlusNewsFlashNotice(battleFeed.replace("</channel>", "<item></channel>"), options)).toThrow("Incomplete");
  expect(() => latestCivicPlusNewsFlashNotice(withNotice(battleFeed, "Burn Ban", "https://example.com/CivicAlerts.aspx?aid=2"), options)).toThrow("link");
  const xml = withNotice(battleFeed, "Burn Ban", "https://www.battlecreekmi.gov/CivicAlerts.aspx?aid=2");
  expect(() => latestCivicPlusNewsFlashNotice(withNotice(xml, "Burn Ban Lifted", "https://www.battlecreekmi.gov/CivicAlerts.aspx?aid=3"), options)).toThrow("Ambiguous");
});

test("both CivicPlus feeds parse in under 5 ms p95", async () => {
  for (const [publisher, xml] of [[battle, battleFeed], [grandLedge, grandLedgeFeed]]) {
    const run = () => publisher.parse(xml, captured, unexpectedArticle);
    for (let i = 0; i < 8; i++) await run();
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      await run();
      samples.push(performance.now() - start);
    }
    expect(samples.sort((a, b) => a - b)[28]).toBeLessThan(5);
  }
});
