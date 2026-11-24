// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ia, parse as parseState } from "../../adapters/ia";
import { countyDecision } from "../../county-decision";
import { countiesInState } from "../../counties";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import { iaCountyBulletins } from "./county-status";
import { iaLocalCalendars } from "./local-rules";

const now = new Date("2026-11-24T22:56:00Z");
const checked = now.toISOString();
const read = (file: string, extension: string) =>
  readFileSync(new URL(`./fixtures/${file}-2026-11-24.${extension}`, import.meta.url));
const ruleEvidence = iaLocalCalendars.map((entry) => {
  const metadataOnly = entry.kind === "pdf-etag";
  const fixture = read(`rule-${entry.id}`, metadataOnly ? "json" : entry.kind);
  const init = metadataOnly ? JSON.parse(fixture.toString()) : undefined;
  return { ...entry, fixture, load: () => new Response(metadataOnly ? null : fixture, init) };
});

test("reviewed local rules return recurring restrictions with each ordinance's scope", async () => {
  for (const { source, fips, parse, load } of ruleEvidence) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ mode: "positive-only", recurring: true, coverage: "restrictions" });
    const rows = await parse(load(), now);
    expect(rows.map((row) => row.fips)).toEqual([...fips]);
    for (const row of rows) {
      expect(row).toMatchObject({
        status: "restricted", scope: source.scope, scopeNote: expect.any(String),
        validFrom: "2026-11-24T06:00:00.000Z", validUntil: "2026-11-26T06:00:00.000Z",
      });
    }
  }
});

test("one air-quality guidance poll preserves the two counties' links and scope", async () => {
  const air = ruleEvidence.find(({ id }) => id === "air-permits");
  expect(air.source.keepRowLinks).toBe(true);
  const rows = await air.parse(new Response(air.fixture), now);
  expect(rows).toEqual([
    expect.objectContaining({ fips: "19113", scopeNote: expect.stringContaining("Linn County"), officialUrl: "https://www.linncountyiowa.gov/1530/Open-Burning" }),
    expect.objectContaining({ fips: "19153", scopeNote: expect.stringContaining("Polk County"), officialUrl: "https://www.polkcountyiowa.gov/public-works/air-quality/open-burning/" }),
  ]);
  const changed = air.fixture.toString().replace("Polk and Linn counties require burning permits.", "Linn requires permits.");
  await expect(air.parse(new Response(changed), now)).rejects.toThrow("reviewed local burning rule changed");
});

test("a replaced ordinance does not extend the previously reviewed rule", async () => {
  const pdf = ruleEvidence.find(({ id }) => id === "mills");
  const changed = Buffer.concat([pdf.fixture, Buffer.from("\n")]);
  await expect(pdf.parse(new Response(changed), now)).rejects.toThrow("reviewed local burning rule changed");
});

test("large reviewed codes require their exact strong PDF validator", async () => {
  const rule = ruleEvidence.find(({ id }) => id === "greene");
  const original = rule.load().headers;
  for (const headers of [
    { ...Object.fromEntries(original), etag: 'W/"a19530fdc96bd91:0"' },
    { ...Object.fromEntries(original), etag: '"other-edition"' },
    { ...Object.fromEntries(original), "content-type": "text/html" },
  ]) {
    await expect(rule.parse(new Response(null, { headers }), now)).rejects.toThrow("reviewed local burning rule changed");
  }
});

test("the Iowa map retains four countywide answers alongside narrower rules", async () => {
  const state = JSON.parse(readFileSync(new URL("../../adapters/fixtures/ia.json", import.meta.url), "utf8"));
  const inputs = [{ source: ia, rows: parseState(state, checked), checked }];
  for (const { source, parse, load } of ruleEvidence) inputs.push({ source, rows: await parse(load(), now), checked });
  for (const { source, parse } of iaCountyBulletins) {
    const county = source.id.replace(/^ia-|-ema$/g, "");
    inputs.push({ source, rows: await parse(read(county, "html").toString(), now), checked });
  }
  const { snapshot } = mergeSources(null, inputs, now);
  const statuses = countiesInState("IA").map(({ fips }) => countyDecision(snapshot.counties[fips], now.getTime()).status);
  expect(statuses.filter((status) => status === "restricted")).toHaveLength(29);
  expect(statuses.filter((status) => status === "none")).toHaveLength(1);
  expect(statuses.filter((status) => status === "unknown")).toHaveLength(69);
  expect(countyDecision(snapshot.counties["19129"], now.getTime())).toMatchObject({
    status: "restricted", scope: "part", countywide: { status: "none", sourceId: "ia-mills-ema" },
  });
  expect(snapshot.counties["19031"]).toMatchObject({ status: "none", sourceId: "ia-cedar-ema" });
  expect(countyDecision(snapshot.counties["19033"], now.getTime())).toMatchObject({
    status: "restricted", scope: "part", scopeNote: expect.stringContaining("off-site trees"),
    officialUrl: "https://www.legis.iowa.gov/docs/iac/chapter/567.23.pdf#page=20",
  });
});

test("reviewed Iowa rule fixtures fit the source CPU budget", async () => {
  for (const { source, parse, load } of ruleEvidence) {
    await parse(load(), now);
    const samples = [];
    for (let i = 0; i < 40; i++) {
      const start = process.cpuUsage();
      await parse(load(), now);
      const { user, system } = process.cpuUsage(start);
      samples.push((user + system) / 1_000);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[37];
    if (p95 >= 5) throw new Error(`${source.id} fixture used ${p95.toFixed(2)} ms CPU p95`);
  }
});
