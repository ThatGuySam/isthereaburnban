// @ts-nocheck -- bun test types aren't installed.
import { expect, test } from "bun:test";
import { formatNationalBans } from "./active-bans";
import { activeBans } from "./api";
import { decodeActive, encodeActive, encodeState } from "./snapshot-v2";
import { applyChecks } from "./sources/state";

test("published bans retain the public JSON for partial and complete scoped-order expiry", () => {
  const generated = "2026-11-24T11:09:00.000Z";
  const first = "2026-11-24T12:00:00.000Z";
  const last = "2026-11-24T13:00:00.000Z";
  const checked = "2026-11-24T11:30:00.000Z";
  const sourceVersions = { issuer: "a", district: "b" };
  const order = { scope: "part", scopeNote: "District", status: "restricted", label: "Débris and “wood” burning",
    sourceId: "district", sourceName: "District", officialUrl: "https://example.gov/", sourceUpdated: null,
    checked: generated, since: null, expires: null };
  const row = { fips: "41039", state: "OR", county: "Lane County", status: "ban", label: "Ban", since: null,
    expires: null, sourceUpdated: null, checked: generated, sourceName: "Issuer", sourceId: "issuer",
    sourceUrl: "https://example.gov/feed", officialUrl: "https://example.gov/", note: "Includes district coverage",
    orders: [{ ...order, validUntil: first }, { ...order, validUntil: last }, order] };
  const snapshot = { version: 2, state: "OR", revision: "fixture", generated, sources: [], changed: {}, sourceVersions, counties: { [row.fips]: row } };
  const index = { version: 2, revision: "fixture", generated, sources: [], sourceVersions, states: {}, orderChecks: { district: checked } };
  const pub = encodeState(snapshot, "signature");
  const heads = new Map([["issuer", { id: "issuer", hash: "a", checked, lastGood: checked }]]);
  for (const instant of [generated, first, last]) {
    const now = new Date(instant);
    const old = structuredClone(snapshot);
    applyChecks(old, heads, now, index.orderChecks);
    const expected = activeBans(old, undefined, now.getTime());
    const projection = decodeActive(encodeActive(index.revision, [pub]));
    const { data } = formatNationalBans(projection, index, heads, now);
    expect(JSON.stringify(data)).toBe(JSON.stringify(expected));
  }
});

test("an active list already in KV hides legacy synthetic effective dates", () => {
  const generated = "2026-11-24T11:09:00.000Z";
  const row = { fips: "41039", state: "OR", county: "Lane County", status: "ban", label: "Ban",
    since: "2026-11-23T11:00:00.000Z", expires: null, sourceUpdated: null, checked: generated,
    sourceName: "Issuer", sourceId: "issuer", sourceUrl: "https://example.gov/feed", officialUrl: "https://example.gov/" };
  const encoded = JSON.stringify(row);
  const body = [encoded.indexOf('"checked":"') + '"checked":"'.length, encoded.length];
  const active = JSON.stringify([[row.fips, row.sourceId, generated, null, null, body]]).slice(1, -1) + "\n" + encoded;
  const index = { version: 2, revision: "legacy", generated, sources: [], states: {}, orderChecks: {} };
  const projection = decodeActive(encodeActive(index.revision, [{ active, weather: "", weatherCounties: "" }]));
  const result = formatNationalBans(projection, index, new Map(), new Date(generated));
  expect(result.data.counties[0]).toMatchObject({
    status: "ban", since: null, firstSeenAt: null, statusChangedAt: null,
  });
});

test("a sparse national page can continue without rechecking expired candidates", () => {
  const generated = "2026-11-24T11:09:00.000Z";
  const now = new Date(generated);
  const counties = Object.fromEntries(Array.from({ length: 251 }, (_, i) => {
    const fips = String(70000 + i);
    return [fips, { fips, state: "TX", county: `County ${fips}`, status: "ban", label: "Burn ban",
      checked: generated, since: null, expires: null, sourceUpdated: null, sourceName: "Example",
      sourceUrl: "https://example.gov", officialUrl: "https://example.gov", validUntil: i < 250 ? "2026-11-23T00:00:00Z" : undefined }];
  }));
  const index = { version: 2, revision: "sparse", generated, sources: [], states: {}, orderChecks: {} };
  const encoded = encodeState({ ...index, state: "TX", counties, changed: {} }, "signature");
  const projection = decodeActive(encodeActive(index.revision, [encoded]));
  const first = formatNationalBans(projection, index, new Map(), now, { limit: 50 }).data;
  expect(first.counties).toEqual([]);
  expect(first.nextCursor).toBeTruthy();
  const second = formatNationalBans(projection, index, new Map(), now, { limit: 50, cursor: first.nextCursor }).data;
  expect(second.counties.map(({ fips }) => fips)).toEqual(["70250"]);
  expect(second.nextCursor).toBeNull();
});
