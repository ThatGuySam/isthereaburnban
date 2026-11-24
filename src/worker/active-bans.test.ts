// @ts-nocheck -- bun test types aren't installed.
import { expect, test } from "bun:test";
import { formatNationalBans } from "./active-bans";
import { activeBans } from "./api";
import { withPublishedChecks } from "./published-checks";
import { decodeActive, encodeActive, encodeState } from "./snapshot-v2";
import { applyChecks } from "./sources/state";

test("prepared bans retain the public JSON for partial and complete scoped-order expiry", () => {
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
    applyChecks(old, heads, now);
    const expected = activeBans(withPublishedChecks(old, index.orderChecks));
    for (const format of ["compact", "pretty"]) {
      const projection = decodeActive(encodeActive(index.revision, [{ ...pub, active: format === "pretty" ? pub.pretty : pub.active }]));
      const body = formatNationalBans(projection, index, heads, now, format).body.join("");
      expect(format === "pretty" ? JSON.parse(body) : body).toBe(JSON.stringify(expected, null, format === "pretty" ? 2 : undefined));
    }
  }
});
