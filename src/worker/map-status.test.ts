// @ts-nocheck -- bun test types aren't installed.
import { expect, setSystemTime, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ADAPTERS } from "./adapters";
import { parse as fl } from "./adapters/fl";
import { parse as in_ } from "./adapters/in";
import { parse as la } from "./adapters/la";
import { parse as ms } from "./adapters/ms";
import { parse as ok } from "./adapters/ok";
import { parse as tx } from "./adapters/tx";
import { countiesInState } from "./counties";
import worker from "./index";
import { INDEX_KEY, stateKey } from "./snapshot-v2";

test("the map and county API agree for every county in every full-feed state", async () => {
  const now = new Date();
  const generated = now.toISOString();
  const states = {};
  const keys = new Map();
  const parsers = { fl, in: in_, la, ms, ok, tx };
  for (const adapter of ADAPTERS.filter(({ mode }) => mode === "full")) {
    const { id, state } = adapter;
    const data = JSON.parse(readFileSync(new URL(`./adapters/fixtures/${id}.json`, import.meta.url), "utf8"));
    const rows = parsers[id](data, generated, "2026-11-24");
    const counties = Object.fromEntries(rows.map((row) => [row.fips, { ...row, sourceId: id }]));
    if (state === "LA") {
      delete counties["22045"]; // absent parish in a healthy full feed
      expect(counties["22081"].status).toBe("unknown");
    }
    if (state === "OK") {
      counties["40001"].validUntil = new Date(now.getTime() - 1000).toISOString();
      const clear = counties["40005"];
      clear.orders = [{ ...clear, status: "ban", scope: "part", scopeNote: "Example Fire District" }];
    }
    keys.set(stateKey(state), { version: 2, revision: "fixture", state, generated, changed: {}, sources: [], counties });
    states[state] = { revision: "fixture", cached: true };
  }
  keys.set(INDEX_KEY, { version: 2, revision: "fixture", generated, states, sources: [], orderChecks: {} });
  const env = {
    KV: { get: async (key) => Array.isArray(key) ? new Map(key.map((k) => [k, keys.get(k)])) : keys.get(key) },
    DB: { prepare: () => ({ bind() { return this; }, all: async () => ({ results: [] }) }) },
  };
  const get = (path) => worker.fetch(new Request(`https://burn.example${path}`), env, {});
  const response = await get("/api/v1/map-status");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("public");
  const map = await response.json();
  expect(map.revision).toBe("fixture");
  expect(map.expiresAt).toBeGreaterThan(now.getTime());
  for (const state of Object.keys(states)) {
    for (const { fips } of countiesInState(state)) {
      const answer = await (await get(`/api/v1/counties/${fips}`)).json();
      expect(map.counties[fips] ?? "unknown", `${state} ${fips}`).toBe(answer.status);
    }
  }
  for (const fips of ["22045", "22081", "40001"]) expect(map.counties[fips]).toBeUndefined();
  expect(map.counties["40003"]).toBe("none");
  expect(map.counties["40005"]).toBe("restricted");
  expect(JSON.stringify(map).length).toBeLessThan(20_000);
});

test("a warm shard cannot keep a negative after its evidence expires", async () => {
  const start = new Date("2026-11-24T20:00:00Z");
  const deadline = new Date(start.getTime() + 20_000);
  const checked = start.toISOString();
  const county = {
    fips: "40143", state: "OK", county: "Tulsa County", status: "none", label: "None",
    since: null, expires: null, sourceUpdated: null, checked, validUntil: deadline.toISOString(),
    sourceId: "ok", sourceName: "OFS", sourceUrl: "https://example.gov/feed", officialUrl: "https://example.gov/",
  };
  const shard = { version: 2, revision: "warm", state: "OK", checked, counties: { [county.fips]: county }, sources: [], changed: {} };
  const keys = new Map([
    [INDEX_KEY, { version: 2, revision: "warm", generated: checked, sources: [], orderChecks: {},
      states: { OK: { revision: "warm", cached: true } } }],
    [stateKey("OK"), shard],
  ]);
  const env = {
    KV: { get: async (key) => Array.isArray(key) ? new Map(key.map((entry) => [entry, keys.get(entry)])) : keys.get(key) },
    DB: { prepare: () => ({ all: async () => ({ results: [] }) }) },
  };
  const get = async (route) => {
    const response = await worker.fetch(new Request(`https://burn.example/api/v1/${route}`), env, {});
    expect(response.ok).toBe(true);
    return response.json();
  };

  try {
    setSystemTime(start);
    const map = await get("map-status");
    expect(map.counties[county.fips]).toBe("none");
    expect(map.expiresAt).toBe(deadline.getTime());

    setSystemTime(deadline);
    expect((await get("map-status")).counties[county.fips]).toBeUndefined();
    expect((await get(`counties/${county.fips}`)).status).toBe("unknown");
  } finally {
    setSystemTime();
  }
});
