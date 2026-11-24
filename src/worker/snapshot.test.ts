// @ts-nocheck -- bun test types are not installed; this file runs under `bun test`, not the Worker build.
import { describe, expect, test } from "bun:test";
import type { CountyStatus } from "../shared/types";
import type { Adapter } from "./adapters/common";
import { alertNotices, buildSnapshot } from "./snapshot";
import { buildResult, resultSentence, statusFor } from "./lookup";
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
    expect(first.snapshot.changed["40143"]).toBe("2026-11-20T00:00:00.000Z");
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
    expect(s.label).toBe("We don't track this state yet");
    expect(s.officialUrl).toContain("fire.ca.gov");
  });

  test("buildResult flags ambiguity and builds urls", () => {
    const r = buildResult({ zip: "74106" }, ["40143", "40113"], snap);
    expect(r.ambiguous).toBe(true);
    expect(r.results[0].url).toBe("/us/ok/tulsa-county/");
    expect(r.results[1].status).toBe("unknown");
  });

  test("text sentence", () => {
    expect(resultSentence(snap.counties["40143"])).toBe("Yes: Burn ban reported for Tulsa County, OK. Source: OFS, checked 2026-11-23T19:07Z. Official source: y");
  });

  test("activeBans filters by state", () => {
    expect(activeBans(snap, "ok").counties.length).toBe(1);
    expect(activeBans(snap, "TX").counties.length).toBe(0);
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
  const first = buildSnapshot(null, A, [ok([county])], t0);
  const district = row("40143", "ban", t1.toISOString(), { county: "Tulsa County", label: "Burn ban",
    scope: "part", scopeNote: "Example Fire District", sourceName: "Example Fire District", validUntil: expires });
  const next = buildSnapshot(first.snapshot, [...A, adapter("district", "OK")], [ok([county]), ok([district])], t1);
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
  for (const format of ["compact", "pretty"]) {
    const projection = decodeActive(encodeActive(index.revision, [{ ...encoded, active: format === "pretty" ? encoded.pretty : encoded.active }]));
    const bans = (now: Date) => {
      const { body } = formatNationalBans(projection, index, new Map(), now, format);
      return JSON.parse(format === "pretty" ? JSON.parse(body.join("")) : body.join("")).counties;
    };
    expect(bans(t1)).toEqual([JSON.parse(JSON.stringify(answer))]);
    expect(bans(new Date(expires))).toEqual([]);
  }
});
