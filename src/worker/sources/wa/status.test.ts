// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { parseEcologyAir, waEcologyAir } from "./ecology-air";
import { parseKingFireSafety, waKingFireSafety } from "./king-fire-safety";
import { parsePugetSound, waPugetSoundAir } from "./puget-sound";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}-2026-11-24.html`, import.meta.url), "utf8");
const ecology = fixture("ecology-burn-bans");
const puget = fixture("puget-status");
const king = fixture("king-fire-safety");
const now = new Date("2026-11-24T06:23:19Z");
const checked = now.toISOString();
const parseKing = async (html = king) => parseKingFireSafety(await extractHtml(html), now);

const fixtures = [
  [waEcologyAir, () => parseEcologyAir(ecology, now)],
  [waPugetSoundAir, () => parsePugetSound(puget, now)],
  [waKingFireSafety, parseKing],
];

test("Washington's real publisher reports show two scoped bans across six observed counties", async () => {
  const inputs = await Promise.all(fixtures.map(async ([source, parse]) => ({
    rows: await parse(), source, checked, staleMs: source.staleMs,
  })));
  const { counties } = mergeSources(null, inputs, now).snapshot;
  expect(Object.values(counties).map(({ status }) => status).sort()).toEqual(
    ["restricted", "restricted", "unknown", "unknown", "unknown", "unknown"],
  );
  expect(counties["53047"]).toMatchObject({
    status: "restricted", scope: "part", scopeNote: "Methow Valley, air quality",
    since: "2026-11-18", validFrom: "2026-11-18T17:00:00.000Z",
    orders: [{ status: "ban", label: "Stage 1 air quality burn ban" }],
  });
  expect(counties["53073"]).toMatchObject({
    status: "restricted", scopeNote: expect.stringContaining("Columbia Valley urban growth area"),
    validFrom: "2026-11-18T18:00:00.000Z",
    orders: [{ status: "ban", label: "Stage 2 air quality burn ban" }],
  });
  expect(counties["53033"].orders.map(({ sourceId }) => sourceId))
    .toEqual([waPugetSoundAir.id, waKingFireSafety.id]);
  expect(counties["53077"]).toBeUndefined(); // No current report for Yakima.
  const stale = mergeSources(null, inputs, new Date("2026-11-25T06:23:20Z")).snapshot;
  expect(Object.values(stale.counties).every(({ status }) => status === "unknown")).toBe(true);
});

test("Ecology uses its stage markers and checks the issuer's effective window", async () => {
  const start = ecology.indexOf("<p><span");
  const stage2 = ecology.indexOf("<p><span", start + 1);
  const tribal = ecology.indexOf("<h4>");
  const reordered = ecology.slice(0, start) + ecology.slice(stage2, tribal) +
    ecology.slice(start, stage2) + ecology.slice(tribal);
  const rows = await parseEcologyAir(reordered, now);
  expect(rows.map(({ fips, label }) => [fips, label])).toEqual([
    ["53073", "Stage 2 air quality burn ban"], ["53047", "Stage 1 air quality burn ban"],
  ]);

  const ends = ecology.replace("until further notice", "Tuesday, November 24, 2026, 9:30 a.m.");
  const active = await parseEcologyAir(ends, now);
  expect(active[0]).toMatchObject({ expires: "2026-11-24", validUntil: "2026-11-24T17:30:00.000Z" });
  expect(await parseEcologyAir(ends, new Date("2026-11-24T17:30:00Z"))).toHaveLength(1);
  const upcoming = await parseEcologyAir(ecology, new Date("2026-11-18T17:30:00Z"));
  const { counties } = mergeSources(null, [{ source: waEcologyAir, checked, rows: upcoming }],
    new Date("2026-11-18T17:30:00Z")).snapshot;
  expect(counties["53047"].status).toBe("restricted");
  expect(counties["53073"].status).toBe("unknown");
});

test("Ecology rejects changed tables and unknown effective times while unmapped areas are omitted", async () => {
  await expect(parseEcologyAir(ecology.replace("Stage 2 Burn Ban", "Older orders"), now)).rejects.toThrow("current stage");
  await expect(parseEcologyAir(ecology.replace("Start date/time", "Last changed"), now)).rejects.toThrow("headers");
  await expect(parseEcologyAir(ecology.replace("until further notice", "possibly later"), now)).rejects.toThrow("effective window");
  const unmapped = await parseEcologyAir(ecology.replace("Methow Valley", "Unmapped airshed"), now);
  expect(unmapped.map(({ fips }) => fips)).toEqual(["53073"]);
  const clear = ecology.replace(/<td style="vertical-align: middle;">Methow Valley[\s\S]*?<\/tr>/,
    "<td>None</td><td>&nbsp;</td><td>&nbsp;</td></tr>");
  expect((await parseEcologyAir(clear, now)).map(({ fips }) => fips)).toEqual(["53073"]);
});

test("Puget Sound keeps independently managed parts of Pierce and Snohomish counties", async () => {
  const stages = puget
    .replace(/(>Peninsula<\/div>\s+<div class="status-text )no-ban">No Air Quality Burn Ban/,
      '$1burn-ban-stage-one">Stage One Air Quality Burn Ban')
    .replace(/(>Darrington<\/div>\s+<div class="status-text )no-ban">No Air Quality Burn Ban/,
      '$1burn-ban-stage-two">Stage 2 Air Quality Burn Ban');
  const rows = await parsePugetSound(stages, now);
  const { counties } = mergeSources(null, [{ source: waPugetSoundAir, checked, rows }], now).snapshot;
  expect(counties["53053"]).toMatchObject({ status: "restricted", scopeNote: "Pierce Peninsula air-quality area" });
  expect(counties["53053"].orders).toHaveLength(3);
  expect(counties["53061"]).toMatchObject({ status: "restricted", scopeNote: "Darrington air-quality area" });
  expect(counties["53061"].orders).toHaveLength(2);
  expect(counties["53035"].status).toBe("unknown");
});

test("Puget Sound rejects a missing or duplicate zone and unrecognized or conflicting status values", async () => {
  const shortened = puget.replace(/<div class="area-row">\s*<div class="area-name sub-area">Darrington[\s\S]*?<\/div>\s*<\/div>/, "");
  await expect(parsePugetSound(shortened, now)).rejects.toThrow("incomplete");
  await expect(parsePugetSound(puget.replace(">Kitsap<", ">King<"), now)).rejects.toThrow("duplicate");
  await expect(parsePugetSound(puget.replace("status-text no-ban", "status-text stage-three"), now)).rejects.toThrow("code");
  await expect(parsePugetSound(puget.replace("status-text no-ban", "status-text burn-ban-stage-one"), now)).rejects.toThrow("text");
});

test("King only reads the current fire-safety block and distinguishes the two stages", async () => {
  expect((await parseKing())[0]).toMatchObject({ status: "unknown", scope: "part" });
  expect((await parseKing(king.replace("No Fire Safety", "Stage 1 Fire Safety")))[0]).toMatchObject({ status: "restricted" });
  expect((await parseKing(king.replace("No Fire Safety", "Stage 2 Fire Safety")))[0]).toMatchObject({ status: "ban" });
  await expect(parseKing(king.replace("No Fire Safety", "Stage 3 Fire Safety"))).rejects.toThrow("unrecognized");
  await expect(parseKing(king.replace("Current status", "Fire Safety Stages"))).rejects.toThrow("missing current status");
});

for (const [source, parse] of fixtures) {
  test(`${source.id} parses its real fixture comfortably within the Worker CPU budget`, async () => {
    for (let i = 0; i < 20; i++) await parse();
    const samples: number[] = [];
    for (let i = 0; i < 120; i++) {
      const started = performance.now();
      await parse();
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    expect(samples[113]).toBeLessThan(5);
  });
}
