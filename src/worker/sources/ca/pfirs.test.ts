// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseHtml } from "../lib/html";
import { mergeSources } from "../merge";
import { parsePfirs, pfirs } from "./pfirs";

const fixture = readFileSync(new URL("./fixtures/pfirs.html", import.meta.url), "utf8");
const at = new Date("2026-11-24T16:07:00Z");
const snapshot = (rows, now = at) => mergeSources(null, [{
  source: pfirs, rows, checked: now.toISOString(),
}], now).snapshot;

test("real PFIRS table publishes usable scoped decisions without giving a countywide green light", () => {
  const rows = parsePfirs(parseHtml(fixture), at);
  expect(rows.every((row) => row.scope === "part" && row.sourceUpdated === null)).toBe(true);
  const result = snapshot(rows);
  const counties = result.counties;
  expect(result.sources[0].counties).toBe(Object.keys(counties).length);
  expect(result.sources[0].counties).toBeLessThan(rows.length);
  expect(Object.keys(counties).length).toBeGreaterThan(20);
  expect(counties["06033"]).toMatchObject({
    scope: "part", status: "unknown", label: "Countywide status unconfirmed",
    orders: [{ status: "none", label: expect.stringContaining("CARB burn day for 2026-11-24") }],
  });
  expect(counties["06033"].note).toContain("Contact the local air district or fire agency");
  expect(counties["06085"].orders).toHaveLength(2); // Bay Area South is split by elevation.
  expect(counties["06019"]).toBeUndefined(); // Fresno is referred to the San Joaquin Valley air district.
});

test("no-burn and marginal decisions impact only the mapped scope and only on the valid Pacific date", () => {
  const html = fixture
    .replace(/(<td>Lake County<\/td>\s*<td class=")burn(">)[^<]+/, '$1noburn$2No Burn')
    .replace(/(<td>Northeast Plateau<\/td>\s*<td class=")burn(">)[^<]+/, '$1marginal$2Marginal');
  const rows = parsePfirs(parseHtml(html), at);
  const lake = rows.find((row) => row.fips === "06033");
  expect(lake).toMatchObject({
    validFrom: "2026-11-24T08:00:00.000Z", validUntil: "2026-11-25T08:00:00.000Z", status: "ban", scope: "part",
  });
  const evening = new Date("2026-11-24T04:24Z");
  const ahead = snapshot(parsePfirs(parseHtml(html), evening), evening);
  expect(ahead.counties["06033"]).toMatchObject({ status: "unknown", note: expect.stringContaining("Upcoming CARB no-burn day") });
  expect(ahead.counties["06033"].orders[0]).toMatchObject({ validFrom: lake.validFrom, status: "ban" });
  expect(snapshot(rows).counties["06033"]).toMatchObject({ status: "restricted", label: expect.stringContaining("agricultural and prescribed") });
  expect(snapshot(rows).counties["06035"].orders.some((order) => order.status === "restricted")).toBe(true);
  expect(snapshot(rows, new Date(lake.validUntil)).counties["06033"]).toBeUndefined();
});

test("PFIRS rejects dates outside its publication window and challenge-shaped HTML", () => {
  const parts = parseHtml(fixture);
  expect(() => parsePfirs(parts, new Date("2026-11-26T10:00Z"))).toThrow("no current 24-hour decision tables");
  expect(() => parsePfirs(parseHtml("<h1>Access Denied</h1>"), at)).toThrow("no current 24-hour decision tables");
});
