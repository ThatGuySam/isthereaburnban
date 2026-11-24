// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { extractHtml } from "../lib/html";
import { mergeSources } from "../merge";
import {
  coArapahoeFire, coBoulderFire, coDouglasFire, coElPasoFire, coEstesFire, coLarimerFire,
  parseArapahoeFire, parseBoulderFire, parseDouglasFire, parseElPasoFire, parseEstesFire, parseLarimerFire,
} from "./county-status";
import { coDenverAir, parseDenverAir } from "./denver-air";

const fixture = (name, ext = "html") => readFileSync(new URL(`./fixtures/${name}-2026-11-24.${ext}`, import.meta.url), "utf8");
const douglas = fixture("douglas-status", "json");
const elPaso = fixture("el-paso-status", "json");
const boulder = fixture("boulder-status");
const arapahoe = fixture("arapahoe-status");
const estes = fixture("estes-status");
const larimer = fixture("larimer-aegis", "json");
const denver = fixture("denver-air");
const now = new Date("2026-11-24T07:07:00Z");
const checked = now.toISOString();
const fixtures = [
  [coDouglasFire, () => parseDouglasFire(JSON.parse(douglas), now)],
  [coElPasoFire, () => parseElPasoFire(JSON.parse(elPaso), now)],
  [coBoulderFire, async () => parseBoulderFire(await extractHtml(boulder), now)],
  [coArapahoeFire, async () => parseArapahoeFire(await extractHtml(arapahoe), now)],
  [coEstesFire, async () => parseEstesFire(await extractHtml(estes, { links: true }), now)],
  [coLarimerFire, () => parseLarimerFire(JSON.parse(larimer), now)],
  [coDenverAir, async () => parseDenverAir(await extractHtml(denver), now)],
];

test("Colorado's published decisions preserve municipal, district, and air-quality boundaries", async () => {
  const inputs = await Promise.all(fixtures.map(async ([source, parse]) => ({
    source, rows: await parse(), checked, staleMs: source.staleMs,
  })));
  const { counties } = mergeSources(null, inputs, now).snapshot;
  expect(Object.keys(counties)).toHaveLength(9);
  expect(countiesInState("CO").reduce((counts, { fips }) => {
    counts[counties[fips]?.status ?? "unknown"]++;
    return counts;
  }, { restricted: 0, unknown: 0, ban: 0, none: 0 })).toEqual({ restricted: 8, unknown: 56, ban: 0, none: 0 });
  expect(counties["08035"].orders).toEqual([
    expect.objectContaining({ status: "unknown", scopeNote: expect.stringContaining("Larkspur and Castle Pines") }),
    expect.objectContaining({ status: "restricted", scopeNote: expect.stringContaining("at or below 7,000 feet") }),
  ]);
  expect(counties["08041"]).toMatchObject({
    status: "unknown", orders: [{ status: "unknown", scopeNote: expect.stringContaining("unincorporated El Paso County") }],
  });
  expect(counties["08069"]).toMatchObject({
    status: "restricted", scopeNote: "Estes Valley Fire Protection District", validFrom: "2026-09-04T14:00:00.000Z",
    orders: [{ status: "restricted" }, { status: "unknown" }],
  });
  expect(counties["08031"]).toMatchObject({ status: "restricted", validUntil: "2026-11-24T23:00:00.000Z" });

  const end = mergeSources(null, inputs, new Date("2026-11-24T23:00:00Z")).snapshot.counties;
  expect(end["08031"]).toBeUndefined();
  expect(end["08013"].status).toBe("unknown");
  expect(end["08069"].status).toBe("restricted");
  const stale = mergeSources(null, inputs, new Date("2026-11-25T07:07:01Z")).snapshot.counties;
  expect(Object.values(stale).every(({ status }) => status === "unknown")).toBe(true);
});

test("Douglas and El Paso require the current county block and reject misleading education text", async () => {
  await expect(parseDouglasFire(JSON.parse(douglas.replace("updated on 9/17/2026", "updated on 11/25/2026")), now))
    .rejects.toThrow("status date");
  await expect(parseDouglasFire(JSON.parse(douglas.replace("HAVE BEEN LIFTED", "MIGHT BE LIFTED")), now))
    .rejects.toThrow("unrecognized restriction");
  await expect(parseDouglasFire(JSON.parse(douglas.replace("This includes Larkspur and Castle Pines.", "This includes one fire district.")), now))
    .rejects.toThrow("scope");
  const stage = JSON.parse(douglas.replace("STAGE 1 FIRE RESTRICTIONS HAVE BEEN LIFTED", "STAGE 2 FIRE RESTRICTIONS ARE IN EFFECT"));
  expect((await parseDouglasFire(stage, now))[0]).toMatchObject({ status: "ban", scope: "part" });
  await expect(parseElPasoFire(JSON.parse(elPaso.replace("Current Fire Restrictions", "Fire Restrictions Guide")), now))
    .rejects.toThrow("status heading");
  const active = JSON.parse(elPaso.replace("<p>There are no fire restrictions at this time.​</p>", "<p>Stage I Fire Restrictions are in effect.</p>"));
  expect((await parseElPasoFire(active, now))[0]).toMatchObject({ status: "restricted", scope: "part" });
});

test("Boulder and Arapahoe distinguish current status, split geography, and unknown stages", async () => {
  const split = boulder.replace("There are currently <strong>no</strong> fire restrictions in place in unincorporated Boulder County.",
    "Stage 2 fire restrictions apply in western Boulder County.");
  const awaitedSplit = await extractHtml(split);
  expect(() => parseBoulderFire(awaitedSplit, now)).toThrow("geographic split");
  const unknown = await extractHtml(arapahoe.replace("No Burn Ban<br />Effective", "Stage 7 Burn Ban<br />Effective"));
  expect(() => parseArapahoeFire(unknown, now)).toThrow("unrecognized burn status");
  const future = await extractHtml(arapahoe.replace("9-21-2026", "11-25-2026"));
  expect(() => parseArapahoeFire(future, now)).toThrow("effective date");
});

test("Larimer rejects conflicting elevation widgets and Estes only maps the named district", async () => {
  const conflict = JSON.parse(larimer);
  conflict.widgets.widget_1142.config.text = "<p>Stage 1 applies below 6,000 feet.</p>";
  expect(() => parseLarimerFire(conflict, now)).toThrow("elevation-zone status");
  const wrongDistrict = await extractHtml(estes.replace("ESTES VALLEY FIRE PROTECTION DISTRICT:", "ROCKY MOUNTAIN NATIONAL PARK:"));
  expect(() => parseEstesFire(wrongDistrict, now)).toThrow("district restrictions");
  const future = await extractHtml(estes.replace("last updated September 4, 2026", "last updated November 26, 2026"));
  expect(() => parseEstesFire(future, now)).toThrow("update date");
});

test("CDPHE rejects expired or unfamiliar advisories, and a fresh clear yields no row", async () => {
  const parts = await extractHtml(denver);
  expect(() => parseDenverAir(parts, new Date("2026-11-24T23:00:00Z"))).toThrow("expired");
  expect(() => parseDenverAir(parts, new Date("2026-11-23T22:59:59Z"))).toThrow("future");
  const unknown = await extractHtml(denver.replace("Indoor Burning Restrictions in Effect", "Winter Advisory"));
  expect(() => parseDenverAir(unknown, now)).toThrow("unrecognized");
  const wrongRegion = await extractHtml(denver.replace("seven-county Denver-Boulder metropolitan area", "Front Range Region"));
  expect(() => parseDenverAir(wrongRegion, now)).toThrow("region");
  const clear = await extractHtml(denver
    .replace("Action Day for Visibility<br />Indoor Burning Restrictions in Effect", "No Advisories in Effect<br />No Indoor Burning Restrictions")
    .replace(/<p>An Action Day for Visibility.*?<\/p>/,
      "<p>No Advisories are in effect for the seven-county Denver-Boulder metropolitan area until at least 4 PM Tuesday, November 24, 2026.</p>"));
  expect(parseDenverAir(clear, now)).toEqual([]);
});

for (const [source, parse] of fixtures) {
  test(`${source.id} parses its real fixture in under 5 ms p95`, async () => {
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
