// @ts-nocheck -- bun test types aren't installed.
import { expect, test } from "bun:test";
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
