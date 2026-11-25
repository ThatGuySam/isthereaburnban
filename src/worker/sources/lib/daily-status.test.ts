// @ts-nocheck -- bun test types are not installed.
import { expect, test } from "bun:test";
import { dailyStatusRows } from "./daily-status";
import { US_ZONES } from "./dates";

const meta = {
  id: "fixture", state: "CA", sourceName: "Local issuer",
  sourceUrl: "https://example.test/forecast.json", officialUrl: "https://example.test/forecast",
};
const ban = {
  county: "Placer", date: "2026-03-08", scopeNote: "Residential burning in a mapped area",
  status: "ban", label: "No-burn day", note: "Check local rules.",
};
const now = new Date("2026-03-08T08:30Z");
const parse = (decisions) => dailyStatusRows(meta, US_ZONES.Pacific, decisions, now);

test("daily restrictions expire at publisher-local midnight across the DST change", () => {
  expect(parse([ban])).toMatchObject([{
    fips: "06061", scope: "part", status: "ban", checked: now.toISOString(), expires: "2026-03-08",
    validFrom: "2026-03-08T08:00:00.000Z", validUntil: "2026-03-09T07:00:00.000Z",
    officialUrl: meta.officialUrl, sourceUpdated: null,
  }]);
  expect(parse([{ ...ban, date: "2026-03-09" }])[0].validFrom).toBe("2026-03-09T07:00:00.000Z");
});

test("a permissive or pending response gives no county answer and stale, duplicate or invalid rows fail", () => {
  const { label, note, ...decision } = ban;
  expect(parse([{ ...decision, status: "allowed" }])).toEqual([]);
  expect(parse([{ ...decision, status: "pending" }])).toEqual([]);
  expect(() => parse([{ ...ban, date: "2026-03-07" }])).toThrow("no current dated decisions");
  expect(() => parse([{ ...ban, date: "2026-02-30" }])).toThrow("invalid daily decision");
  expect(() => parse([{ ...ban, county: "Unmapped" }])).toThrow("invalid daily decision");
  expect(() => parse([ban, ban])).toThrow("duplicate daily decision");
});
