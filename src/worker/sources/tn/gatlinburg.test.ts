// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { latestGatlinburgNotice, parseGatlinburgPermitNotice } from "./gatlinburg";

const fixture = (name) => readFileSync(new URL(`./fixtures/gatlinburg-${name}.html`, import.meta.url), "utf8");
const newsroom = fixture("news-2026-11-24");
const bulletin = fixture("permit-hold-2026-11-20");
const inEffect = new Date("2026-11-20T21:00:00Z");

test("Gatlinburg's bounded suspension applies only to its permit program", async () => {
  const notice = await latestGatlinburgNotice(newsroom, inEffect);
  expect(notice).toMatchObject({ path: "/article/3354138", date: "2026-11-20" });
  const rows = await parseGatlinburgPermitNotice(bulletin, notice, inEffect);
  expect(rows).toMatchObject([{
    fips: "47155", status: "restricted", scope: "part", since: "2026-11-20", expires: "2026-11-22",
    validFrom: "2026-11-20T05:00:00.000Z", validUntil: "2026-11-23T05:00:00.000Z",
    officialUrl: "https://www.gatlinburgtn.gov/article/3354138",
  }]);
  expect(await parseGatlinburgPermitNotice(bulletin, notice, new Date("2026-11-23T05:00:00Z"))).toEqual([]);
  expect(await parseGatlinburgPermitNotice(bulletin.replace("through at least Sunday, November 22", "until further notice"), notice, inEffect)).toEqual([]);
});

test("the city index validates dates and a later lift supersedes an older notice", async () => {
  const lift = newsroom.replace(
    '</div>\n',
    '</div>\n<div class="page-container-item"><div class="article-info"><div class="title"><a href="/article/1234567">Gatlinburg Fire Department resumes burn permits</a></div><div class="article-date">November 21, 2026</div></div></div>\n',
  );
  const now = new Date("2026-11-21T21:00:00Z");
  expect((await latestGatlinburgNotice(lift, now)).path).toBe("/article/1234567");
  expect((await latestGatlinburgNotice(lift, inEffect)).path).toBe("/article/3354138");
  await expect(latestGatlinburgNotice(newsroom.replace('href="/article/3354138"', 'href="https://other.gov/article/3354138"'), now))
    .rejects.toThrow("Unexpected Apptegy news card");
  const notice = await latestGatlinburgNotice(newsroom, now);
  await expect(parseGatlinburgPermitNotice(bulletin.replace("City of Gatlinburg", "Another authority"), notice, now)).rejects.toThrow("differs");
  await expect(parseGatlinburgPermitNotice(bulletin.replace("Sunday, November 22", "Monday, November 22"), notice, now)).rejects.toThrow("invalid deadline");
});

test("the Apptegy index and permit notice fixtures parse below 4 ms p95 thread CPU", async () => {
  const parse = async () => parseGatlinburgPermitNotice(bulletin, await latestGatlinburgNotice(newsroom, inEffect), inEffect);
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
