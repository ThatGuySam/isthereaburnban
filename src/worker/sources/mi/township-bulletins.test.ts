// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { miTownshipBulletins } from "./township-bulletins";

const now = new Date("2026-11-25T19:00:00Z");
const [spencer, vernon] = miTownshipBulletins;
const fixture = (name) => readFileSync(new URL(`./fixtures/county-pass/${name}-2026-11-25.html`, import.meta.url), "utf8");
const spencerHtml = fixture("spencer");
const vernonHtml = fixture("vernon-canonical");

test("Spencer's visible permit hold appears on Kent County with the township scope", async () => {
  const rows = await spencer.parse(spencerHtml, now);
  expect(rows).toEqual([expect.objectContaining({
    fips: "26081", since: "2026-07-14", status: "restricted", scope: "part",
    scopeNote: "Spencer Township", officialUrl: "https://spencertwpmi.gov/fire/",
  })]);
  const { snapshot } = mergeSources(null, [{ source: spencer.source, rows, checked: now.toISOString() }], now);
  expect(statusFor(snapshot, "26081", now.getTime())).toMatchObject({ status: "restricted", scope: "part" });
  expect(statusFor(snapshot, "26081", now.getTime() + spencer.source.staleMs + 1).status).toBe("unknown");
});

test("Vernon's hidden ban leaves Shiawassee unknown and the same visible text is a township ban", async () => {
  expect(await vernon.parse(vernonHtml, now)).toEqual([]);
  const visible = vernonHtml.replaceAll("elementor-hidden-desktop elementor-hidden-laptop elementor-hidden-tablet elementor-hidden-mobile ", "");
  expect(await vernon.parse(visible, now)).toEqual([expect.objectContaining({
    fips: "26155", since: "2026-07-13", status: "ban", scope: "part", scopeNote: "Vernon Township",
  })]);
});

test("a lift or hidden notice adds no permissive row and future or changed assertions fail", async () => {
  const lifted = spencerHtml.replace(/<p>Burn ban in effect.*?<\/p>/, "<p>Burn ban lifted.</p>");
  const hidden = spencerHtml.replace('data-id="1736c7f"', 'data-id="1736c7f" hidden');
  expect(await spencer.parse(lifted, now)).toEqual([]);
  expect(await spencer.parse(hidden, now)).toEqual([]);
  await expect(spencer.parse(spencerHtml, new Date("2026-07-13T23:59:00Z"))).rejects.toThrow("future burn notice");
  await expect(spencer.parse(spencerHtml.replace("No burn permits will be issued.", ""), now)).rejects.toThrow("invalid");
  await expect(spencer.parse(spencerHtml.replace('data-elementor-id="319"', 'data-elementor-id="1"'), now)).rejects.toThrow("status section");
});

test("Elementor township bulletin fixture parses stay below 5 ms p95", async () => {
  for (const [publisher, html] of [[spencer, spencerHtml], [vernon, vernonHtml]]) {
    await publisher.parse(html, now);
    const times = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      await publisher.parse(html, now);
      times.push(performance.now() - start);
    }
    expect(times.sort((a, b) => a - b)[28]).toBeLessThan(5);
  }
});
