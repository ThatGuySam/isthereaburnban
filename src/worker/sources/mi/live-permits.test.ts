// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { statusFor } from "../../lookup";
import { mergeSources } from "../merge";
import {
  miAtlasFireStatus, miGrandTraverseMetroStatus, miPortSanilacFireStatus, miStJosephFireStatus, parseAtlasFireStatus,
  parseGrandTraverseMetroStatus, parsePortSanilacFireStatus, parseStJosephFireStatus,
} from "./live-permits";

const read = (name) => readFileSync(new URL(`./fixtures/${name}-2026-11-25.json`, import.meta.url), "utf8");
const stJoseph = read("st-joseph-live");
const grandTraverse = read("gt-metro-wp");
const portSanilac = read("port-sanilac-firestore");
const atlas = readFileSync(new URL("./fixtures/atlas-panel-2026-11-25.html", import.meta.url), "utf8");
const captured = new Date("2026-11-25T06:38:00Z");
const districtClosed = (data) => ({ ...data, burn: { ...data.burn, state: "ban", label: "No burning" } });

test("St. Joseph Fire distinguishes the district decision from a village hours reminder", () => {
  const data = JSON.parse(stJoseph);
  expect(data.communities.find(({ id }) => id === "shoreham").label).toBe("No burning right now");
  expect(parseStJosephFireStatus(data, captured)).toEqual([]);
  expect(parseStJosephFireStatus({ ...data, burn: { state: "caution", label: "Not recommended" } }, captured)).toEqual([]);
  const rows = parseStJosephFireStatus(districtClosed(data), captured);
  expect(rows).toMatchObject([{
    fips: "26021", status: "ban", scope: "part", scopeNote: "St. Joseph Charter Township and Village of Shoreham",
    sourceUpdated: "2026-11-25T06:35:01.000Z", validUntil: "2026-11-25T06:55:01.000Z",
  }]);
  const { snapshot } = mergeSources(null, [{ source: miStJosephFireStatus, rows, checked: captured.toISOString() }], captured);
  expect(statusFor(snapshot, "26021", captured.getTime())).toMatchObject({ status: "restricted", scope: "part" });
  expect(statusFor(snapshot, "26021", Date.parse(rows[0].validUntil)).status).toBe("unknown");
});

test("St. Joseph Fire validates district membership, status, and the publisher clock", () => {
  const data = JSON.parse(stJoseph);
  expect(() => parseStJosephFireStatus({ ...data, communities: [data.communities[0], data.communities[0]] }, captured)).toThrow("service area");
  expect(() => parseStJosephFireStatus({ ...data, burn: { state: "yellow", label: "No burning" } }, captured)).toThrow();
  expect(() => parseStJosephFireStatus({ ...data, burn: { state: "ban", label: "Burning OK" } }, captured)).toThrow("inconsistent");
  expect(() => parseStJosephFireStatus(data, new Date("2026-11-25T06:55:01Z"))).toThrow("no current status");
  expect(() => parseStJosephFireStatus(data, new Date("2026-11-25T06:34:59Z"))).toThrow("no current status");
});

test("Grand Traverse Metro reads the published permit panel and confines a closure to its three towns", async () => {
  const data = JSON.parse(grandTraverse);
  expect(await parseGrandTraverseMetroStatus(data, captured)).toEqual([]);
  data.content.rendered = data.content.rendered.replace(
    "BURN PERMITS ARE OPEN, PLEASE APPLY FOR A PERMIT AT THE BOTTOM OF THE PAGE", "BURN PERMITS ARE CLOSED",
  );
  expect(await parseGrandTraverseMetroStatus(data, captured)).toMatchObject([{
    fips: "26055", status: "restricted", scope: "part", scopeNote: "Acme, East Bay and Garfield townships",
    sourceUpdated: null, validUntil: "2026-11-25T08:38:00.000Z", officialUrl: miGrandTraverseMetroStatus.officialUrl,
  }]);
  data.content.rendered += '<div class="fusion-alert"><span class="fusion-alert-content">BURN PERMITS ARE OPEN</span></div>';
  await expect(parseGrandTraverseMetroStatus(data, captured)).rejects.toThrow("one status section");
  const unrecognized = JSON.parse(grandTraverse);
  unrecognized.content.rendered = unrecognized.content.rendered.replace("PERMITS ARE OPEN", "PERMITS ARE MAYBE OPEN");
  await expect(parseGrandTraverseMetroStatus(unrecognized, captured)).rejects.toThrow("Unrecognized");
  await expect(parseGrandTraverseMetroStatus(JSON.parse(grandTraverse), new Date("2026-11-23T15:55:08Z"))).rejects.toThrow("future");
});

test("Port Sanilac publishes only a recent affirmative flag for the village", () => {
  const data = JSON.parse(portSanilac);
  expect(data.fields.fireban).toEqual({ nullValue: null });
  expect(parsePortSanilacFireStatus(data, captured)).toEqual([]);
  data.fields.fireban = { booleanValue: false };
  expect(parsePortSanilacFireStatus(data, captured)).toEqual([]);
  data.fields.fireban = { booleanValue: true };
  expect(() => parsePortSanilacFireStatus(data, captured)).toThrow("too old");
  data.updateTime = "2026-11-24T18:00:00.120123Z";
  expect(parsePortSanilacFireStatus(data, captured)).toMatchObject([{
    fips: "26151", status: "ban", scope: "part", scopeNote: "Village of Port Sanilac",
    sourceUpdated: "2026-11-24T18:00:00.120Z", officialUrl: miPortSanilacFireStatus.officialUrl,
  }]);
  data.name += " Township";
  expect(() => parsePortSanilacFireStatus(data, captured)).toThrow("document path");
});

test("Atlas reads the current conditions panel and expires a closure at local midnight", async () => {
  expect(await parseAtlasFireStatus(atlas, captured)).toEqual([]);
  const closed = atlas.replace("OPEN BURNING IS ALLOWED TODAY", "OPEN BURNING IS NOT ALLOWED TODAY");
  expect(await parseAtlasFireStatus(closed, new Date("2026-11-26T04:30:00Z"))).toMatchObject([{
    fips: "26049", status: "restricted", scope: "part", scopeNote: "Atlas Township",
    sourceUpdated: null, validUntil: "2026-11-26T05:00:00.000Z", officialUrl: miAtlasFireStatus.officialUrl,
  }]);
  await expect(parseAtlasFireStatus(atlas + closed, captured)).rejects.toThrow("one status section");
  await expect(parseAtlasFireStatus(atlas.replace("IS ALLOWED TODAY", "MAY BE ALLOWED TODAY"), captured)).rejects.toThrow("Unrecognized");
});

test("Michigan live fixture parse p95 stays below 5 ms per publisher", async () => {
  const runs = [
    () => parseAtlasFireStatus(atlas, captured),
    () => parseStJosephFireStatus(JSON.parse(stJoseph), captured),
    () => parseGrandTraverseMetroStatus(JSON.parse(grandTraverse), captured),
    () => parsePortSanilacFireStatus(JSON.parse(portSanilac), captured),
  ];
  for (const run of runs) {
    for (let i = 0; i < 8; i++) await run();
    const samples = [];
    for (let i = 0; i < 40; i++) {
      const start = performance.now();
      await run();
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    expect(samples[37]).toBeLessThan(5);
  }
});
