// @ts-nocheck -- bun test types are not installed; this file runs under `bun test`, not the Worker build.
import { describe, expect, test } from "bun:test";
import type { CountyStatus } from "../shared/types";
import type { Adapter } from "./adapters/common";
import { alertNotices, buildSnapshot } from "./snapshot";
import { buildResult, coordsToFips, DISCLAIMER, resultSentence, statusFor } from "./lookup";
import { activeBans } from "./api";
import { formatNationalBans } from "./active-bans";
import { decodeActive, encodeActive, encodeState } from "./snapshot-v2";
import { renderStatusHtml } from "../shared/render";

const adapter = (id: string, state: string): Adapter => ({ id, state, mode: "full", sourceName: id, sourceUrl: "x", officialUrl: "y", fetch: async () => [] });
const row = (fips: string, status: CountyStatus["status"], checked: string, extra: Partial<CountyStatus> = {}): CountyStatus => ({
  fips, state: "OK", county: `C${fips}`, status, label: status, since: null, expires: null, sourceUpdated: null, checked,
  sourceName: "OFS", sourceUrl: "x", officialUrl: "y", ...extra,
});
const ok = (v: CountyStatus[]) => ({ status: "fulfilled" as const, value: v });
const fail = { status: "rejected" as const, reason: new Error("boom") };
const A = [adapter("ok", "OK")];

describe("buildSnapshot", () => {
  const t0 = new Date("2026-11-23T10:00:00Z");
  const first = buildSnapshot(null, A, [ok([row("40143", "ban", t0.toISOString(), { sourceUpdated: "2026-11-20T00:00:00.000Z" }), row("40001", "none", t0.toISOString())])], t0);

  test("first import seeds changed and emits no transitions", () => {
    expect(first.transitions).toEqual([]);
    expect(first.snapshot.changed["40143"]).toBe(t0.toISOString());
    expect(first.snapshot.changed["40001"]).toBe(t0.toISOString());
    expect(first.snapshot.sources[0]).toMatchObject({ id: "ok", ok: true, counties: 2, bans: 1 });
  });

  test("status change emits a transition and updates changed", () => {
    const t1 = new Date("2026-11-23T11:00:00Z");
    const next = buildSnapshot(first.snapshot, A, [ok([row("40143", "none", t1.toISOString()), row("40001", "none", t1.toISOString())])], t1);
    expect(next.transitions).toEqual([{ fips: "40143", oldStatus: "ban", newStatus: "none", at: t1.toISOString() }]);
    expect(next.snapshot.changed["40143"]).toBe(t1.toISOString());
    expect(next.snapshot.changed["40001"]).toBe(t0.toISOString());
  });

  test("failed source keeps previous rows, no transitions", () => {
    const t1 = new Date("2026-11-23T12:00:00Z");
    const next = buildSnapshot(first.snapshot, A, [fail], t1);
    expect(next.transitions).toEqual([]);
    expect(next.snapshot.counties["40143"].status).toBe("ban");
    expect(next.snapshot.sources[0]).toMatchObject({ ok: false, error: "boom", counties: 2 });
  });

  test("failed source with data older than 48h turns unknown", () => {
    const t3 = new Date("2026-11-26T12:00:00Z");
    const next = buildSnapshot(first.snapshot, A, [fail], t3);
    expect(next.transitions).toEqual([]);
    expect(next.snapshot.counties["40143"].status).toBe("unknown");
    expect(next.snapshot.counties["40001"].status).toBe("unknown");
  });
});

describe("lookup", () => {
  const snap = buildSnapshot(null, A, [ok([row("40143", "ban", "2026-11-23T19:07:31.000Z", { county: "Tulsa County", label: "County Burn Ban" })])], new Date("2026-11-23T19:07:31Z")).snapshot;

  test("missing county is unknown, never none", () => {
    const s = statusFor(snap, "06037");
    expect(s.status).toBe("unknown");
    expect(s.label).toBe("No confirmed county report");
    expect(s.officialUrl).toContain("fire.ca.gov");
  });

  test("buildResult flags ambiguity and builds urls", () => {
    const r = buildResult({ zip: "74106" }, ["40143", "40113"], snap);
    expect(r.ambiguous).toBe(true);
    expect(r.results[0].url).toBe("/us/ok/tulsa-county/");
    expect(r.results[1].status).toBe("unknown");
  });

  test("text sentence", () => {
    expect(resultSentence(snap.counties["40143"])).toBe("Yes: Burn ban reported for Tulsa County, OK. Source: OFS, checked 2026-11-23T19:07Z. First recorded 2026-11-23T19:07:31.000Z. Official source: y");
  });

  test("activeBans filters by state", () => {
    const now = Date.parse(snap.generated);
    expect(activeBans(snap, "ok", now).counties.length).toBe(1);
    expect(activeBans(snap, "TX", now).counties.length).toBe(0);
  });
});

describe("zipToFips", () => {
  const { zipToFips } = require("./lookup");
  const env = { ASSETS: { fetch: async (r: Request) => (new URL(r.url).pathname === "/zip/741.json" ? Response.json({ "74103": ["40143"], "74106": ["40143", "40113"], "74110": ["40143"] }) : new Response("", { status: 404 })) } };
  test("exact ZIP", async () => {
    expect(await zipToFips(env, "74106")).toEqual({ fips: ["40143", "40113"], approximate: false, matched: "74106" });
  });
  test("missing ZIP uses the nearest one in the shard", async () => {
    expect(await zipToFips(env, "74109")).toEqual({ fips: ["40143"], approximate: true, matched: "74110" });
  });
  test("unknown shard is a 404", async () => {
    await expect(zipToFips(env, "00001")).rejects.toThrow("no counties");
  });
});

import { withCurrentLinks as _wcl } from "./snapshot";
test("official links come from current adapter code, not the stored snapshot", () => {
  const snap: any = { version: 1, generated: "", sources: [], changed: {}, counties: {
    "40143": { fips: "40143", state: "OK", county: "Tulsa County", status: "none", label: "None", since: null, expires: null, sourceUpdated: null, checked: "", sourceName: "old", sourceUrl: "old", officialUrl: "https://forestry.ok.gov/burn-ban-info" },
  } };
  _wcl(snap);
  expect(snap.counties["40143"].officialUrl).toBe("https://experience.arcgis.com/experience/8bdc59b2a54a4383a9a2996fb9407580/");
});

test("a district ban overrides a county-level negative in public answers and alert decisions", () => {
  const t0 = new Date("2026-11-24T10:00:00Z");
  const t1 = new Date("2026-11-24T11:00:00Z");
  const expires = "2026-11-24T12:00:00.000Z";
  const county = row("40143", "none", t0.toISOString(), { county: "Tulsa County", scope: "county" });
  const districtAdapter = adapter("district", "OK");
  const first = buildSnapshot(null, [...A, districtAdapter], [ok([county]), ok([])], t0);
  const district = row("40143", "ban", t1.toISOString(), { county: "Tulsa County", label: "Burn ban",
    scope: "part", scopeNote: "Example Fire District", sourceName: "Example Fire District", validUntil: expires });
  const next = buildSnapshot(first.snapshot, [...A, districtAdapter], [ok([county]), ok([district])], t1);
  const answer = statusFor(_wcl(next.snapshot), county.fips, t1.getTime());
  expect(answer).toMatchObject({ status: "restricted", scope: "part", scopeNote: "Example Fire District",
    countywide: { status: "none" }, orders: [{ status: "ban", scopeNote: "Example Fire District" }] });
  expect(resultSentence(answer)).toContain("Burn ban in Example Fire District");
  expect(renderStatusHtml(answer)).toContain("Burn ban in Example Fire District");
  expect(alertNotices(next.transitions, next.snapshot)[0].body).toContain("Burn ban in Example Fire District");
  expect(activeBans(next.snapshot, "OK", t1.getTime()).counties[0]).toMatchObject({ status: "restricted", scope: "part" });
  expect(next.transitions).toEqual([{ fips: county.fips, oldStatus: "none", newStatus: "restricted", at: t1.toISOString() }]);
  expect(statusFor(next.snapshot, county.fips, Date.parse(expires)).status).toBe("none");

  const index = { ...next.snapshot, revision: "fixture", version: 2, states: {}, orderChecks: {} };
  const encoded = encodeState({ ...index, state: "OK" }, "signature");
  const projection = decodeActive(encodeActive(index.revision, [encoded]));
  const bans = (now: Date) => formatNationalBans(projection, index, new Map(), now).data.counties;
  const { lastAttemptedAt: _attempt, ...expected } = answer;
  expect(JSON.parse(JSON.stringify(bans(t1)))).toEqual([JSON.parse(JSON.stringify(expected))]);
  expect(bans(new Date(expires))).toEqual([]);
});

test("standing activity rules are reported separately from the temporary county feed", () => {
  const now = new Date("2026-11-24T11:00:00Z");
  const checked = now.toISOString();
  const county = row("40143", "none", checked, { scope: "county" });
  const standing = row("40143", "restricted", checked, { scope: "county", standing: true,
    label: "Residential yard debris burning prohibited", scopeNote: "Residential properties", sourceName: "Local authority" });
  const { snapshot } = buildSnapshot(null, [...A, adapter("standing", "OK")], [ok([county]), ok([standing])], now);
  expect(statusFor(snapshot, county.fips, now.getTime())).toMatchObject({
    status: "restricted", scope: "county", standing: true, sourceName: "Local authority",
    countywide: { status: "none" },
    orders: [{ standing: true, scopeNote: "Residential properties" }],
  });
});

test("approximate ZIP lookup asks for confirmation and withholds definitive answers on every wire format", async () => {
  const { default: worker } = await import("./index");
  const generated = new Date().toISOString();
  const env = {
    SITE_URL: "https://burn.example",
    ASSETS: { fetch: async () => Response.json({ "74103": ["40143"] }) },
    DB: { prepare: () => ({ first: async () => null }) },
    KV: { get: async () => ({ version: 1, counties: { "40143": row("40143", "ban", generated) }, generated, changed: {}, sources: [] }) },
  };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const get = (path) => worker.fetch(new Request(`https://burn.example${path}`), env, context);
  const json = await (await get("/api/v1/status?zip=74100")).json();
  expect(json).toMatchObject({ approximate: true, answer: "unknown", matchedZip: "74103", approximationReason: expect.stringContaining("by number") });
  expect(json.results).toMatchObject([{ fips: "40143", status: "unknown" }]);
  const text = await (await get("/api/v1/status?zip=74100&format=text")).text();
  for (const item of ["74100", "74103", "by number", "Confirm your county", "Tulsa County"]) expect(text).toContain(item);
  expect(text).not.toMatch(/Yes:|Nope:/);

  const mcp = await worker.fetch(new Request("https://burn.example/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: "burn.example" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "check_burn_ban", arguments: { zip: "74100" } } }),
  }), env, context);
  const payload = await mcp.text();
  const data = payload.split("\n").find((line) => line.startsWith("data: "));
  const [summary, detail] = JSON.parse(data ? data.slice(6) : payload).result.content;
  expect(summary.text).toBe(text.split(DISCLAIMER)[0].trim());
  expect(JSON.parse(detail.text)).toEqual(json);
});

test("coordinates use the Census vintage with Hartford County FIPS", async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const p = new URL(input).searchParams;
      expect(p.get("x")).toBe("-72.674");
      expect(p.get("y")).toBe("41.764");
      const fips = p.get("vintage") === "Census2020_Current" ? "09003" : "09110";
      return Response.json({ result: { geographies: { Counties: [{ GEOID: fips }] } } });
    };
    expect(await coordsToFips(41.764, -72.674)).toEqual(["09003"]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("effective dates, public observations and latest checks stay distinct", () => {
  const t0 = new Date("2026-11-24T10:00:00Z");
  const t1 = new Date("2026-11-24T11:00:00Z");
  const t2 = new Date("2026-11-24T12:00:00Z");
  const cleared = row("40143", "none", t0.toISOString(), { sourceUpdated: "2026-11-23T18:00:00Z" });
  const initial = buildSnapshot(null, A, [ok([cleared])], t0).snapshot;
  expect(initial.counties["40143"]).toMatchObject({ since: null, firstSeenAt: t0.toISOString(), statusChangedAt: null });
  const ban = row("40143", "ban", t1.toISOString(), { since: "2026-11-24T10:30:00Z", sourceUpdated: "2026-11-24T10:40:00Z" });
  const next = buildSnapshot(initial, A, [ok([ban])], t1).snapshot;
  const updated = buildSnapshot(next, A, [ok([{ ...ban, checked: t2.toISOString() }])], t2).snapshot;
  expect(updated.counties["40143"]).toMatchObject({ since: ban.since, firstSeenAt: t0.toISOString(),
    statusChangedAt: t1.toISOString(), sourceUpdated: ban.sourceUpdated, checked: t2.toISOString() });
  expect(statusFor(updated, "40109")).toMatchObject({ since: null, checked: null, firstSeenAt: null, statusChangedAt: null });
});

test("legacy snapshots do not expose guessed effective dates", () => {
  const now = new Date();
  const old = row("40143", "ban", now.toISOString(), { since: "2026-11-23T18:00:00Z", sourceUpdated: "2026-11-23T18:00:00Z" });
  const snapshot = { generated: now.toISOString(), changed: {}, sources: [], counties: { [old.fips]: old } };
  expect(statusFor(snapshot, old.fips)).toMatchObject({ since: null, firstSeenAt: null, statusChangedAt: null });
});

test("a scoped emergency ban can trigger an alert when a standing rule already makes the county restricted", () => {
  const t0 = new Date("2026-11-24T10:00:00Z");
  const t1 = new Date("2026-11-24T11:00:00Z");
  const t2 = new Date("2026-11-24T12:00:00Z");
  const checked = t0.toISOString();
  const county = row("40143", "none", checked, { scope: "county" });
  const standing = row("40143", "restricted", checked, { scope: "county", standing: true, scopeNote: "Residential properties" });
  const district = row("40143", "ban", t1.toISOString(), { scope: "part", scopeNote: "Example Fire District" });
  const adapters = [...A, adapter("standing", "OK"), adapter("district", "OK")];
  const baseline = buildSnapshot(null, adapters, [ok([county]), ok([standing]), ok([])], t0);
  const next = buildSnapshot(baseline.snapshot, adapters, [ok([county]), ok([standing]), ok([district])], t1);
  expect(next.transitions).toHaveLength(1);
  expect(alertNotices(next.transitions, next.snapshot)[0].title).toBe("Burn ban in Example Fire District");
  const nextCheck = buildSnapshot(next.snapshot, adapters, [ok([county]), ok([standing]), ok([district])], t2);
  expect(nextCheck.transitions).toEqual([]);
});
