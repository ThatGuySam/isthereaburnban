// @ts-nocheck -- bun test types aren't installed.
import { expect, setSystemTime, test } from "bun:test";
import { renderReportDetailsHtml, renderStatusHtml } from "../shared/render";
import { activeBans } from "./api";
import { formatNationalBans, projectWeather } from "./active-bans";
import worker from "./index";
import { resultSentence, statusFor } from "./lookup";
import { projectMapStatus } from "./map-status";
import { ACTIVE_KEY, decodeActive, encodeActive, encodeState, INDEX_KEY, stateKey } from "./snapshot-v2";
import { mergeSources } from "./sources/merge";
import { applyChecks } from "./sources/state";
import { ilCrawfordCountyOrders } from "./sources/il/crawford";

const started = "2026-11-24T18:00:00.000Z";
const at = (hours: number) => new Date(Date.parse(started) + hours * 3_600_000);
const fips = "48009";
const input = (id, status, extra = {}, options = {}) => ({
  source: { id, state: "TX", mode: "full", scope: "county" }, checked: started, version: "v1",
  rows: [{ fips, state: "TX", county: "Archer County", status, label: status, checked: started,
    sourceName: id, sourceUrl: "https://example.gov/feed", officialUrl: "https://example.gov/", since: null,
    expires: null, sourceUpdated: null, ...extra }],
  ...options,
});
const county = (snapshot, time) => statusFor(snapshot, fips, time.getTime());
const national = (snapshot, time, heads = new Map(), format = "compact") => {
  const index = { ...snapshot, version: 2, revision: "fixture", states: {}, orderChecks: {} };
  const encoded = encodeState({ ...index, state: "TX" }, "fixture");
  const projection = decodeActive(encodeActive(index.revision, [{ ...encoded, active: format === "pretty" ? encoded.pretty : encoded.active }]));
  const { body } = formatNationalBans(projection, index, heads, time, format);
  return JSON.parse(format === "pretty" ? JSON.parse(body.join("")) : body.join(""));
};

test("a failed negative immediately becomes unknown with its last good check and outage time", () => {
  const { snapshot } = mergeSources(null, [input("tx", "none")], at(0));
  const lastAttempted = at(2).toISOString();
  const failedSince = at(1).toISOString();
  const heads = new Map([["tx", { checked: lastAttempted, failedSince, lastGood: started, hash: "v1", error: "HTTP 500" }]]);
  applyChecks(snapshot, heads, at(2));
  const answer = county(snapshot, at(2));
  expect(answer).toMatchObject({ status: "unknown", checked: started, lastAttemptedAt: lastAttempted, sourceFailedSince: failedSince });
  expect(renderStatusHtml(answer, { relativeTimeBase: at(2).getTime() })).toContain("couldn&#39;t check since");
  expect(resultSentence(answer)).toContain(failedSince);
  expect(projectMapStatus("rev", [snapshot], at(2).getTime()).counties[fips]).toBeUndefined();
});

test("a failed local order check remains visible beside an independent restriction", () => {
  const guidance = input("il-epa", "restricted");
  guidance.source.state = "IL";
  Object.assign(guidance.rows[0], { fips: "17033", state: "IL", county: "Crawford" });
  const { snapshot } = mergeSources(null, [guidance, {
    source: ilCrawfordCountyOrders, checked: started, rows: [], error: "Report unavailable",
  }], at(0));
  const result = statusFor(snapshot, "17033", at(0).getTime());
  expect(result).toMatchObject({ status: "restricted", sourceOutages: [
    { sourceId: ilCrawfordCountyOrders.id, sourceFailedSince: started },
  ] });
  expect(statusFor(snapshot, "17035", at(0).getTime()).sourceOutages).toBeUndefined();
  expect(renderReportDetailsHtml(result)).toContain(ilCrawfordCountyOrders.officialUrl);
  expect(resultSentence(result)).toContain("Couldn't check since");
});

test("a source-specific deadline removes the main and embedded reports at the same instant", () => {
  const base = input("tx", "ban", {}, { staleMs: 6 * 3_600_000 });
  const order = input("local", "restricted", { scope: "part", scopeNote: "Fire District" }, { staleMs: 6 * 3_600_000 });
  const { snapshot } = mergeSources(null, [base, order], at(0));
  expect(county(snapshot, at(5)).orders).toHaveLength(1);
  const ended = county(snapshot, at(6));
  expect(ended.status).toBe("unknown");
  expect(ended.orders ?? []).toHaveLength(0);
  expect(activeBans(snapshot, undefined, at(6).getTime()).counties).toEqual([]);
  for (const format of ["compact", "pretty"]) {
    expect(national(snapshot, at(5), new Map(), format).counties).toHaveLength(1);
    expect(national(snapshot, at(6), new Map(), format).counties).toEqual([]);
  }
});

test("a scheduled county ban activates and promotes the next current report at expiry without a new publication", () => {
  const inputs = [
    input("base", "none"),
    input("order", "ban", { validFrom: at(1).toISOString(), validUntil: at(2).toISOString() }),
    input("other", "restricted", { validFrom: at(1.5).toISOString(), validUntil: at(3).toISOString() }),
  ];
  const { snapshot } = mergeSources(null, inputs, at(0));
  for (const [hour, status] of [[0, "none"], [1, "ban"], [2, "restricted"], [3, "none"]]) {
    expect(county(snapshot, at(hour)).status).toBe(status);
    expect(projectMapStatus("rev", [snapshot], at(hour).getTime()).counties[fips]).toBe(status);
    expect(national(snapshot, at(hour)).counties[0]?.status).toBe(status === "none" ? undefined : status);
  }
});

test("warm HTTP reads and the home lookup expose the exact next order boundary", async () => {
  const boundary = Date.parse(started) + 20_000;
  const until = new Date(boundary + 35_000).toISOString();
  const { snapshot } = mergeSources(null, [
    input("base", "none"),
    input("order", "ban", { validFrom: new Date(boundary).toISOString(), validUntil: until }),
  ], at(0));
  const revision = "fixture";
  const encoded = encodeState({ ...snapshot, version: 2, revision, state: "TX" }, "fixture");
  const index = { ...snapshot, version: 2, revision, states: { TX: { revision, cached: true } }, reportDates: true, orderChecks: {} };
  const values = new Map([[INDEX_KEY, JSON.stringify(index)], [ACTIVE_KEY, encodeActive(revision, [encoded])],
    [stateKey("TX"), encoded.snapshot]]);
  const env = { SITE_URL: "https://burn.example", KV: { async get(key, type) {
    if (Array.isArray(key)) return new Map(key.map((id) => [id, JSON.parse(values.get(id))]));
    const value = values.get(key);
    return type === "json" && value ? JSON.parse(value) : value ?? null;
  } }, DB: { prepare: () => ({ bind() { return this; }, all: async () => ({ results: [] }) }) } };
  const get = (path) => worker.fetch(new Request(`https://burn.example/api/v1/${path}`), env, {});
  try {
    setSystemTime(at(0));
    const lookup = await get(`status?fips=${fips}`);
    expect(lookup.headers.get("cache-control")).toBe("public, max-age=20, must-revalidate");
    expect(await lookup.json()).toMatchObject({ answer: "none", nextChangeAt: boundary });
    const bans = await get("bans");
    expect(bans.headers.get("cache-control")).toContain("max-age=20");
    expect((await bans.json()).counties).toEqual([]);
    setSystemTime(new Date(boundary));
    expect(await (await get(`status?fips=${fips}&format=text`)).text()).toContain("Yes");
    expect((await (await get("map-status")).json()).counties[fips]).toBe("ban");
    const response = await get(`counties/${fips}`);
    expect(response.headers.get("cache-control")).toContain("max-age=35");
    expect((await response.json()).status).toBe("ban");
    setSystemTime(new Date(until));
    expect((await (await get(`counties/${fips}`)).json()).status).toBe("none");
    expect((await (await get("bans")).json()).counties).toEqual([]);
  } finally {
    setSystemTime();
  }
});

test("weather alert visibility and its cache honor the weather source deadline", () => {
  const alert = { event: "Red Flag Warning", headline: "Fire weather", onset: started, expires: at(9).toISOString(),
    ends: at(9).toISOString(), url: "https://weather.gov/", sender: "NWS" };
  const { snapshot } = mergeSources(null, [input("tx", "none"), {
    source: { id: "weather", state: "US", mode: "positive-only", product: "fire-weather", staleMs: 3 * 3_600_000 },
    checked: started, rows: [], fireWeather: [{ fips, alerts: [alert] }],
  }], at(0));
  const index = { ...snapshot, version: 2, revision: "fixture", states: {}, orderChecks: {} };
  const output = encodeState({ ...index, state: "TX" }, "fixture");
  const projection = decodeActive(encodeActive(index.revision, [output]));
  const heads = new Map();
  expect(projectWeather(projection, index, heads, at(2)).counties[fips].alerts).toEqual([alert]);
  expect(projectWeather(projection, index, heads, at(3)).counties[fips].alerts).toBeUndefined();
  expect(formatNationalBans(projection, index, heads, at(2), "compact").nextBoundary).toBe(at(3).getTime());
});

test("a verified county rescission conflicts with the aggregator's active order", () => {
  const state = input("tx", "ban", { since: "2026-08-05", officialUrl: "https://example.gov/state-report" });
  const county = input("archer", "none", {
    issuerFor: "tx", documentId: "2026-10-06-rescission", since: "2026-10-06",
    validFrom: "2026-10-06T05:00:00.000Z", officialUrl: "https://example.gov/archer.pdf",
  });
  const { snapshot } = mergeSources(null, [state, county], at(0));
  const result = statusFor(snapshot, fips, at(1).getTime());
  expect(result).toMatchObject({ status: "unknown", conflict: { kind: "issuer", reports: [
    { status: "none", since: "2026-10-06", officialUrl: "https://example.gov/archer.pdf" },
    { status: "ban", since: "2026-08-05", officialUrl: "https://example.gov/state-report" },
  ] } });
  expect(renderStatusHtml(result)).toContain("Conflicting reports");
  const details = renderReportDetailsHtml(result);
  for (const value of ["https://example.gov/archer.pdf", "https://example.gov/state-report", "Oct 6, 2026", "Aug 5, 2026"]) {
    expect(details).toContain(value);
  }
  expect(resultSentence(result)).toContain("https://example.gov/state-report");
  expect(national(snapshot, at(1)).counties).toEqual([]);
  expect(statusFor(mergeSources(null, [county], at(0)).snapshot, fips, at(1).getTime()).status).toBe("unknown");
  const resolved = mergeSources(snapshot, [input("tx", "none"), county], at(1)).snapshot;
  expect(statusFor(resolved, fips, at(1).getTime())).toMatchObject({ status: "none", conflict: undefined });
});

test("a failed county ban and a separate successful all-clear produce a visible disagreement", () => {
  const failed = input("prior", "ban", {}, { error: "HTTP 500", lastGood: started, checked: at(1).toISOString() });
  const good = input("new", "none", {}, { checked: at(1).toISOString() });
  const { snapshot } = mergeSources(null, [failed, good], at(1));
  const row = county(snapshot, at(1));
  expect(row).toMatchObject({ status: "unknown", conflict: { kind: "degraded", reports: [
    { sourceId: "prior", sourceCheckFailed: true }, { sourceId: "new", status: "none" },
  ] } });
  expect(resultSentence(row)).toContain(at(1).toISOString());
});
