// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mergeSources } from "../merge";
import { mnRestrictions, parseMinnesotaRestrictions } from "./restrictions";

const fixture = readFileSync(new URL("./fixtures/restrictions-2026-11-24.json", import.meta.url), "utf8");
const legend = JSON.parse(readFileSync(new URL("./fixtures/legend-2026-11-24.json", import.meta.url), "utf8"));
const captured = new Date("2026-11-24T05:31:57Z");
const edited = "2026-11-23 12:00";
const dataWith = (...features) => {
  const data = JSON.parse(fixture);
  data.result.burning_restrictions.features = features;
  return JSON.stringify(data);
};
const area = (name, status, last_update = edited) => ({ name, status, last_update });
const code = (label) => legend.findIndex(({ legText }) => legText.includes(label));
const merge = (rows, now = captured) =>
  mergeSources(null, [{ source: mnRestrictions, rows, checked: captured.toISOString() }], now).snapshot;

test("the real DNR feed has one recent area and preserves its split-county scope", () => {
  const rows = parseMinnesotaRestrictions(fixture, captured);
  expect(rows).toMatchObject([{
    fips: "27137", status: "restricted", label: "DNR debris-burning permit required",
    scope: "part", scopeNote: "Northern St. Louis County DNR permit area",
    sourceUpdated: "2026-11-23T18:00:00.000Z", validUntil: "2026-11-25T18:00:00.000Z",
    checked: captured.toISOString(), since: null, expires: null,
  }]);
  expect(merge(rows).sources[0]).toMatchObject({ counties: 1, bans: 0, ok: true });
  expect(merge(rows).counties["27153"]).toBeUndefined(); // Todd's November 1 report.
  expect(merge(rows, new Date("2026-11-25T18:00:00Z")).counties["27137"]).toBeUndefined();
});

test("permit-only conditions and both open-burning closures retain their own scopes", () => {
  const rows = parseMinnesotaRestrictions(dataWith(
    area("Cass County: North", code("Restricted - Variance Permits Only")),
    area("Cass County: South", code("Restricted - Agency Approved Permits Only")),
    area("Polk East County", code("No Open Burning - Campfires Allowed")),
    area("Roseau East County", code("Elevated Burning Restrictions")),
  ), captured);
  expect(rows.map(({ fips, status, label, scopeNote }) => [fips, status, label, scopeNote])).toEqual([
    ["27021", "restricted", "DNR variance permits only", "Northern Cass County DNR permit area"],
    ["27021", "restricted", "Agency-approved burning permits only", "Southern Cass County DNR permit area"],
    ["27119", "ban", "DNR prohibits open burning and allows campfires", "Polk East DNR permit area"],
    ["27135", "ban", "DNR elevated burning restrictions", "Roseau East DNR permit area"],
  ]);
  const { counties, sources } = merge(rows);
  expect(counties["27021"].orders).toHaveLength(2);
  expect(counties["27119"]).toMatchObject({
    status: "restricted", orders: [{ status: "ban", scope: "part", scopeNote: "Polk East DNR permit area" }],
  });
  expect(sources[0]).toMatchObject({ counties: 3, bans: 0 });
});

test("a permit exception, absent rows and unrecognized values never imply a countywide all-clear", () => {
  const rows = parseMinnesotaRestrictions(dataWith(
    area("Todd County", code("No Permit Required")),
    area("Wright County", code("No Data Available")),
    area("Cook County", 99),
    area("Cass County: Central", 4),
    area("Aitkin County", 4, "2026-11-24 00:00"), // Still November 23 in Central time.
  ), captured);
  expect(rows).toMatchObject([{ fips: "27153", status: "unknown", scope: "part" }]);
  expect(merge(rows).counties["27153"]).toMatchObject({
    status: "unknown", note: expect.stringContaining("no debris-burning permit requirement"),
  });
  expect(merge(rows).counties["27031"]).toBeUndefined();
});

test("stale, duplicate and changed publisher responses fail the poll", () => {
  expect(() => parseMinnesotaRestrictions(fixture, new Date("2026-11-25T18:00:00Z"))).toThrow("within 48 hours");
  expect(() => parseMinnesotaRestrictions(dataWith(area("Todd County", 2, "2026-11-31 12:00")), captured))
    .toThrow("within 48 hours");
  expect(() => parseMinnesotaRestrictions(dataWith(area("Todd County", 2), area(" Todd County ", 3)), captured))
    .toThrow("repeated permit area");
  expect(() => parseMinnesotaRestrictions(dataWith(area("Todd County", "Permits Required")), captured))
    .toThrow("Unexpected JSON feed shape");
  expect(() => parseMinnesotaRestrictions(dataWith(), captured)).toThrow("Unexpected JSON feed shape");
});

test("Minnesota parses its real CGI fixture well within the Worker CPU budget", () => {
  const run = () => parseMinnesotaRestrictions(fixture, captured);
  for (let i = 0; i < 20; i++) run();
  const samples = Array.from({ length: 120 }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  expect(samples[113]).toBeLessThan(5);
});
