// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { countiesInState } from "../../counties";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import { SOURCES } from "../registry";
import {
  mortonCountyBulletin, ndBowmanBulletin, ndMortonBulletin, ndNorthCentralBulletin, ndRoletteBulletin, northCentralCountyBulletin,
} from "./county-bulletins";
import { ndLocalBurningRules } from "./local-rules";
import { ndDesRestrictions, parseNdRestrictions } from "./restrictions";

const checked = "2026-11-24T10:06:16Z";
const now = new Date(checked);
const read = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const fixture = (name) => read(`county-pass/${name}`);
const declarations = JSON.parse(read("restrictions-2026-11-24.json"));
const ratings = JSON.parse(read("fire-danger-2026-11-24.json"));
const mortonRating = ratings.features.find(({ attributes }) => attributes.CNTY_FIPS === "059").attributes;
const mortonWarning = declarations.features.find(({ attributes }) => attributes.county === "Morton County").attributes;
const feature = (attributes) => ({ features: [{ attributes }] });
const bonfires = fixture("fargo-bonfires.html").toString();
const bowman = fixture("bowman-notices.html").toString();
const rolette = fixture("rolette-fire.html").toString();
const morton = fixture("morton-fire.html").toString();
const northCentral = fixture("bottineau-renville-fire.html").toString();
const mortonConditions = {
  ratings: feature(mortonRating),
  warnings: feature(mortonWarning),
};
const parseMorton = (at = now, conditions = mortonConditions, html = morton) =>
  mortonCountyBulletin(async () => conditions).parse(new Response(html), at);
const parseNorthCentral = (conditions = { ratings, warnings: declarations }, html = northCentral) =>
  northCentralCountyBulletin(async () => conditions).parse(new Response(html), now);

const standingFixtures = ndLocalBurningRules.map(({ source, parse, fixture: name }) => {
  const body = fixture(name);
  const contentType = name.endsWith(".pdf") ? "application/pdf" : "text/html";
  return { source, parse: () => parse(new Response(body, { headers: { "content-type": contentType } }), now) };
});
const bulletinFixtures = [
  { ...ndBowmanBulletin, parse: () => ndBowmanBulletin.parse(new Response(bowman), now) },
  { ...ndRoletteBulletin, parse: () => ndRoletteBulletin.parse(new Response(rolette), now) },
  { source: ndMortonBulletin.source, parse: () => parseMorton() },
  { source: ndNorthCentralBulletin.source, parse: () => parseNorthCentral() },
];

test("Bowman's official notices publish a scoped total ban and omission stays unknown", async () => {
  const parse = (html, at = now) => ndBowmanBulletin.parse(new Response(html), at);
  expect(await parse(bowman)).toEqual([expect.objectContaining({
    fips: "38011", status: "ban", since: "2026-09-15", scope: "part", scopeNote: "Unincorporated Bowman County",
    officialUrl: "https://bowmannd.com/county/notices/",
  })]);
  const unrelatedNotices = bowman.replace(/<h3><strong>BURN RESTRICTIONS IN PLACE:[\s\S]*?(?=<h3>NOTICE TO THE PUBLIC)/, "");
  expect(await parse(unrelatedNotices)).toEqual([]);
  expect(await parse(bowman, new Date("2026-09-14T21:00:00Z"))).toEqual([]);
  await expect(parse(bowman.replace("TOTAL ban on open", "Watch for restrictions on open"))).rejects.toThrow("changed burn restrictions");
  await expect(parse("<h1>Archived PDF</h1>")).rejects.toThrow("missing county notices");
});

test("Rolette's advance call procedure is scoped, tied to the reviewed edition and expires with the order", async () => {
  const parse = (html, at = now) => ndRoletteBulletin.parse(new Response(html), at);
  expect(await parse(rolette)).toEqual([expect.objectContaining({
    fips: "38079", status: "restricted", scope: "part", since: "2026-04-14", expires: "2026-12-31",
    validUntil: "2027-01-01T06:00:00.000Z", officialUrl: "https://rolettecountynd.gov/fire/",
  })]);
  expect(await parse(rolette, new Date("2027-01-01T06:00:00Z"))).toEqual([]);
  await expect(parse(rolette.replace('href="/__static/', 'href="/archived/'))).rejects.toThrow("changed published order");
  await expect(parse(rolette.replace("before a controlled burn", "only after a controlled burn"))).rejects.toThrow("changed controlled burn");
});

test("Morton's restored order activates on a current high rating or a current dated warning", async () => {
  expect(await parseMorton()).toEqual([]);
  const high = feature({ ...mortonRating, FireIndex: 3, DatePublished: Date.parse("2026-11-24T03:30:00Z") });
  expect(await parseMorton(now, { ...mortonConditions, ratings: high })).toEqual([expect.objectContaining({
    fips: "38059", scope: "part", scopeNote: "Unincorporated Morton County", status: "ban", validUntil: "2026-11-25T06:00:00.000Z",
  })]);
  const warning = {
    ...mortonWarning, RFW_Status: "RFW",
    rfw_effective_Date: "2026-11-24T04:00:00-06:00", rfw_expiration_date: "2026-11-24T04:30:00-06:00",
  };
  expect(await parseMorton(now, { ...mortonConditions, warnings: feature(warning) })).toEqual([expect.objectContaining({
    status: "ban", validUntil: "2026-11-24T10:30:00.000Z",
  })]);
  expect(await parseMorton(new Date("2026-11-24T10:30:00Z"), { ...mortonConditions, warnings: feature(warning) })).toEqual([]);
  expect(await parseMorton(now, { ...mortonConditions, warnings: feature({ ...warning, Script_Update_Date: 0 }) })).toEqual([]);
  expect(await parseMorton(new Date("2027-01-01T06:00:00Z"), { ...mortonConditions, ratings: high })).toEqual([]);
  await expect(parseMorton(now, mortonConditions, morton.replace("is again in effect", "expired"))).rejects.toThrow("changed burn-status notice");
  await expect(parseMorton(now, { ...mortonConditions, warnings: feature({ ...warning, county: "Burleigh County" }) }))
    .rejects.toThrow("changed warning report");
});

test("Bottineau and Renville apply their separate signed High policies only on a current rating or warning", async () => {
  expect(await parseNorthCentral()).toEqual([]);
  const high = {
    features: ratings.features.filter(({ attributes }) => ["009", "075"].includes(attributes.CNTY_FIPS))
      .map(({ attributes }) => ({ attributes: { ...attributes, FireIndex: 3, DatePublished: Date.parse("2026-11-24T03:30:00Z") } })),
  };
  const highRows = await parseNorthCentral({ ratings: high, warnings: declarations });
  expect(highRows.map(({ fips, status, validUntil }) => [fips, status, validUntil])).toEqual([
    ["38009", "restricted", "2026-11-25T06:00:00.000Z"], ["38075", "restricted", "2026-11-25T06:00:00.000Z"],
  ]);
  expect(highRows[1].note).toContain("Campfires");
  expect(highRows[0].note).not.toContain("Campfires");

  const { attributes } = declarations.features.find(({ attributes }) => attributes.county === "Bottineau County");
  const warned = { ...attributes, RFW_Status: "RFW",
    rfw_effective_Date: "2026-11-24T04:00:00-06:00", rfw_expiration_date: "2026-11-24T04:30:00-06:00" };
  const warnings = { features: [{ attributes: warned }, ...declarations.features.filter(({ attributes }) => attributes.county !== "Bottineau County")] };
  expect(await parseNorthCentral({ ratings, warnings })).toEqual([expect.objectContaining({
    fips: "38009", label: expect.stringContaining("campfires"), validUntil: "2026-11-24T10:30:00.000Z",
  })]);
  await expect(parseNorthCentral(undefined, northCentral.replace("670219_bbb", "670219_changed"))).rejects.toThrow("changed published order");
});

test("reviewed local rules are recurring, scoped and require current reviewed wording", async () => {
  for (const { source, parse } of standingFixtures) {
    expect(SOURCES).toContain(source);
    expect(source).toMatchObject({ mode: "positive-only", recurring: true, coverage: "restrictions", scope: "part" });
    expect(await parse()).toEqual([expect.objectContaining({
      fips: source.reportingFips[0], standing: true, status: "restricted", scope: "part",
      officialUrl: source.officialUrl, validFrom: "2026-11-24T06:00:00.000Z", validUntil: "2026-11-26T06:00:00.000Z",
    })]);
  }
  const fargo = ndLocalBurningRules.find(({ source }) => source.id === "nd-fargo-bonfires");
  await expect(fargo.parse(new Response(bonfires.replace("require a permit", "recommend a permit")), now)).rejects.toThrow("changed");
});

test("ND county pass replay adds only scoped restrictions to previously unknown counties", async () => {
  const state = { source: ndDesRestrictions, rows: parseNdRestrictions(declarations, ratings, now), checked };
  const locals = await Promise.all([...bulletinFixtures, ...standingFixtures].map(async ({ source, parse }) => {
    expect(SOURCES).toContain(source);
    expect(source.mode).toBe("positive-only");
    return { source, rows: await parse(), checked };
  }));
  const before = mergeSources(null, [state], now).snapshot;
  const after = mergeSources(null, [state, ...locals], now).snapshot;
  const statusAt = (snapshot, fips) => statusFor(snapshot, fips, now.getTime());
  const counties = countiesInState("ND");
  const changed = counties.filter(({ fips }) => statusAt(before, fips).status !== statusAt(after, fips).status);
  expect(changed.map(({ name }) => name.replace(/ County$/, "")).sort()).toEqual([
    "Barnes", "Bowman", "Burleigh", "Cass", "Cavalier", "Grand Forks", "LaMoure", "Morton", "Ransom", "Rolette", "Sargent",
    "Stutsman", "Towner", "Traill", "Williams",
  ]);
  for (const { fips } of changed) {
    expect(statusAt(before, fips).status).toBe("unknown");
    expect(statusAt(after, fips)).toMatchObject({ status: "restricted", scope: "part" });
  }
  expect(statusAt(after, "38011")).toMatchObject({ scopedBan: true, orders: [expect.objectContaining({ status: "ban", scope: "part" })] });
  expect(counties.filter(({ fips }) => statusAt(after, fips).status === "unknown")).toHaveLength(16);
});

test("ND county fixture parsing stays below 5 ms p95 thread CPU", async () => {
  let slowest = { id: "", elapsed: 0 };
  for (const { source, parse } of [...bulletinFixtures, ...standingFixtures]) {
    for (let i = 0; i < 10; i++) await parse();
    const samples: number[] = [];
    for (let i = 0; i < 40; i++) {
      const start = process.threadCpuUsage();
      await parse();
      const { user, system } = process.threadCpuUsage(start);
      samples.push((user + system) / 1_000);
    }
    const elapsed = samples.sort((a, b) => a - b)[37];
    if (elapsed > slowest.elapsed) slowest = { id: source.id, elapsed };
  }
  console.log(`ND county fixture parse p95 max ${slowest.elapsed.toFixed(3)} ms thread CPU (${slowest.id})`);
  expect(slowest.elapsed).toBeLessThan(5);
});
