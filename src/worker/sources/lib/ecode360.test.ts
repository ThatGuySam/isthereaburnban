// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { reviewedEcode360Digest } from "./ecode360";

const batavia = () => Bun.file(new URL("../ny/fixtures/county-pass/batavia-burning.html", import.meta.url)).text();
const ban = "8977271";
const recreation = "8977272";

test("eCode360 reviews the published sections and ignores the table of contents", async () => {
  const html = await batavia();
  const sections = [ban, recreation];
  const digest = await reviewedEcode360Digest(html, sections);
  expect(await reviewedEcode360Digest(new Response(html), sections)).toBe(digest);
  expect(await reviewedEcode360Digest(html.replace('<div id="childContent">', `
    <nav><a href="#${ban}" class="titleLink">Different heading in navigation</a></nav>
    <div id="childContent">`), sections)).toBe(digest);
  expect(await reviewedEcode360Digest(html.replace("Open burning shall be prohibited.", "Open burning shall be permitted."), sections))
    .not.toBe(digest);
  expect(await reviewedEcode360Digest(html.replace("Open burning.    ", "Open burning and permits.    "), sections))
    .not.toBe(digest);
});

test("eCode360 requires one matching title and body for every requested section", async () => {
  const html = await batavia();
  const article = html.match(/<article>[\s\S]*?<\/article>/)?.[0];
  expect(article).toContain(`id="${ban}_content"`);
  for (const changed of [
    html.replace(article, ""),
    html.replace(article, article + article),
    html.replace(`id="${ban}_content"`, 'id="elsewhere"'),
    html.replace('<div id="childContent">', '<div id="archive">'),
  ]) {
    await expect(reviewedEcode360Digest(changed, [ban])).rejects.toThrow("Expected one published eCode360 section");
  }
  await expect(reviewedEcode360Digest(html, [ban, ban])).rejects.toThrow("Expected distinct eCode360 section IDs");
});

test("eCode360 rejects a different reviewed section body under a matching title", async () => {
  const html = (await batavia())
    .replace(`id="${ban}_content"`, 'id="swap"')
    .replace(`id="${recreation}_content"`, `id="${ban}_content"`)
    .replace('id="swap"', `id="${recreation}_content"`);
  await expect(reviewedEcode360Digest(html, [ban, recreation]))
    .rejects.toThrow(`Expected one published eCode360 section: ${ban}`);
});
