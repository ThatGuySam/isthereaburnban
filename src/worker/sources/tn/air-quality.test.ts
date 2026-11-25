// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseTennesseeAirQuality, tnAirQualityPermitHolds } from "./air-quality";

const fixture = (day) => readFileSync(new URL(`./fixtures/airnow-${day}.dat`, import.meta.url), "utf8");
const orange = fixture("2026-09-19");
const duringOrange = new Date("2026-09-19T14:00:00Z");

test("Shelby's own Code Orange forecast suspends covered permits even without an Action Day flag", () => {
  const rows = parseTennesseeAirQuality(orange, duringOrange);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fips: "47157", status: "restricted", scope: "part", sourceUpdated: "2026-09-19",
    validFrom: "2026-09-19T05:00:00.000Z", validUntil: "2026-09-20T05:00:00.000Z",
    officialUrl: "https://www.shelbytnhealth.com/176/Open-Burning-Land-Clearing-Contractors",
  });
  expect(rows[0].label).toContain("Code Orange");
  expect(tnAirQualityPermitHolds.keepRowLinks).toBe(true);
  const upcoming = parseTennesseeAirQuality(fixture("2026-09-16"), new Date("2026-09-16T20:00:00Z"));
  expect(upcoming.map(({ fips, since }) => [fips, since])).toEqual([["47157", "2026-09-17"]]);
});

test("a newer forecast replaces earlier evidence even when the older forecast appears last", () => {
  const correction = orange.split(/\r?\n/).find((line) =>
    line.startsWith("09/19/26|09/19/26|") && line.includes("|Memphis|TN|") && line.includes("|F|") && line.includes("|OZONE|"))
    .replace("09/19/26|09/19/26|", "09/18/26|09/19/26|");
  const latest = orange.replace("101|Unhealthy for Sensitive Groups", "70|Moderate");
  for (const text of [`${correction}\n${latest}`, `${latest.trimEnd()}\n${correction}`]) {
    expect(parseTennesseeAirQuality(text, duringOrange)).toEqual([]);
  }
  expect(parseTennesseeAirQuality(orange, new Date("2026-09-22T20:00:00Z"))).toEqual([]);
});

test("Knox requires a flagged Action Day and quiet forecasts give no clearance", () => {
  const november = fixture("2026-11-24");
  const now = new Date("2026-11-25T04:02:00Z");
  expect(parseTennesseeAirQuality(november, now)).toEqual([]);
  const action = november.replace(
    /^(11\/23\/26\|11\/24\/26\|.*\|F\|.*\|Knoxville\|TN\|.*\|)Good\|No\|/m,
    "$1Unhealthy for Sensitive Groups|Yes|",
  );
  expect(parseTennesseeAirQuality(action, now)).toMatchObject([{
    fips: "47093", status: "restricted", scope: "part", validUntil: "2026-11-25T05:00:00.000Z",
    officialUrl: "https://www.knoxcounty.org/airquality/open_burning.php",
  }]);
  expect(() => parseTennesseeAirQuality(orange.replace("Unhealthy for Sensitive Groups", "New code"), duringOrange)).toThrow("unexpected forecast");
});

test("Tennessee AirNow forecasts parse below 4 ms p95 thread CPU", () => {
  const check = () => parseTennesseeAirQuality(orange, duringOrange);
  for (let i = 0; i < 10; i++) check();
  const samples = [];
  for (let i = 0; i < 40; i++) {
    const start = process.threadCpuUsage();
    check();
    const { user, system } = process.threadCpuUsage(start);
    samples.push((user + system) / 1000);
  }
  samples.sort((a, b) => a - b);
  expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(4);
});
