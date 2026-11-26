// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { mtPermitPortals } from "./permit-portal";

const now = new Date("2026-11-26T07:40:00Z");
const fixture = (name) => readFileSync(new URL(`./fixtures/permit-${name}-2026-11-26.html`, import.meta.url), "utf8");
const entry = (name) => mtPermitPortals.find(({ source }) => source.id === `mt-permit-${name}`);

test("the county closure, fire zone and fire district remain scoped to county permit burning", async () => {
  const examples = [
    ["flathead", "30029", "County open-burning permit activation prohibited", "County-regulated open burning in Flathead County"],
    ["missoula", "30063", "Permit burning restricted below 3,500 feet", "Impact Zone M"],
    ["hill", "30041", "Open-burning permit activation prohibited", "HAVRE FD CITY"],
  ];
  for (const [id, fips, label, area] of examples) {
    const { parse, source } = entry(id);
    const rows = await parse(new Response(fixture(id)), now);
    expect(rows).toEqual([expect.objectContaining({
      fips, label, status: "restricted", scope: "part", scopeNote: expect.stringContaining(area),
      officialUrl: source.officialUrl, since: null, expires: null, sourceUpdated: null,
      validUntil: "2026-11-27T07:00:00.000Z",
    })]);
    const input = { source, rows, checked: now.toISOString() };
    const { snapshot } = mergeSources(null, [input], now);
    expect(statusFor(snapshot, fips, now.getTime())).toMatchObject({ status: "restricted" });
    expect(statusFor(snapshot, fips, Date.parse(rows[0].validUntil)).status).toBe("unknown");
  }
});

test("explicit open and recognized off-season portal notices give no countywide all-clear", async () => {
  for (const id of ["yellowstone", "sanders", "lincoln"]) {
    const { parse, source } = entry(id);
    expect(source.mode).toBe("positive-only");
    expect(source.reportingFips).toHaveLength(1);
    expect(await parse(fixture(id), now)).toEqual([]);
  }
});

test("the portal parser rejects mixed statuses, missing sections, county mix-ups and new restriction shapes", async () => {
  const flathead = fixture("flathead");
  const { parse } = entry("flathead");
  await expect(parse(fixture("yellowstone"), now)).rejects.toThrow("invalid county");
  await expect(parse(flathead.split("<main")[0], now)).rejects.toThrow("missing current status");
  await expect(parse(flathead.replace("</strong>", "</strong></p><p>Burning is currently open across the entire county."), now))
    .rejects.toThrow("unrecognized status");
  await expect(entry("missoula").parse(fixture("missoula").replace("Prohibit Below", "Unknown limit"), now))
    .rejects.toThrow("unrecognized permit zone restriction");
});

test("each real permit portal template parses within 4 ms p95 thread CPU", async () => {
  for (const id of ["flathead", "hill", "missoula", "yellowstone", "sanders", "lincoln"]) {
    const html = fixture(id);
    const { parse } = entry(id);
    for (let i = 0; i < 8; i++) await parse(html, now);
    const samples = [];
    for (let i = 0; i < 40; i++) {
      const start = process.threadCpuUsage();
      await parse(html, now);
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1000);
    }
    samples.sort((a, b) => a - b);
    expect(samples[37]).toBeLessThan(4);
  }
});
