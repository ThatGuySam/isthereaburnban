import { existsSync, readFileSync } from "node:fs";
import worker from "../src/worker/index";
import { COUNTIES, countyPath } from "../src/worker/counties";
import type { Env } from "../src/worker/env";
import { runCanary } from "../src/worker/notify";
import { retryPendingPush } from "../src/worker/push-outbox";
import { ACTIVE_KEY, INDEX_KEY, PRETTY_ACTIVE_KEY, stateKey } from "../src/worker/snapshot-v2";
import { advancePublication } from "../src/worker/sources/publication";
import { consumeSourceMessage, enqueueSources } from "../src/worker/sources/queue";
import { SOURCES } from "../src/worker/sources/registry";
import type { ActiveSource } from "../src/worker/sources/types";
import type { snapshotBenchmarks } from "./snapshot-benchmark";

const ORIGIN = "https://isthereaburnban.com";
// Measurements use actual worker handlers. The binding fixtures exclude Cloudflare I/O and transport.
export function workerBenchmarks({ index, indexJson, stateJson, heads, active, pretty, largestState }:
  ReturnType<typeof snapshotBenchmarks>["dataset"]) {
  const now = new Date(index.generated);
  const slot = now.getTime();
  const rows = [...heads].map(([id, { slot, hash, stored, ...health }]) => ({ id, slot, hash, stored, health: JSON.stringify(health) }));
  const kv = new Map<string, string>([
    [INDEX_KEY, indexJson], [ACTIVE_KEY, active], [PRETTY_ACTIVE_KEY, pretty],
    ...[...stateJson].map(([state, json]) => [stateKey(state), json] as const),
  ]);
  const county = COUNTIES.find(({ state }) => state === largestState) ?? COUNTIES[0];
  const countyUrl = countyPath(county.fips);
  const page = `<!doctype html><html data-answer-fips="${county.fips}" data-q="Is there a burn ban?">
    <head><title>Burn ban status</title><meta name="description"><meta property="og:title"><meta name="theme-color">
    <script type="application/ld+json" data-ld="WebPage">{"@type":"WebPage"}</script></head>
    <body><main data-hero><section data-status-slot data-fips="${county.fips}"></section><p data-status-changed hidden></p></main></body></html>`;
  const cityFile = new URL(`../dist/data/cities/${largestState.toLowerCase()}.json`, import.meta.url);
  const cityRows = existsSync(cityFile) ? readFileSync(cityFile, "utf8") : "[]";
  const cityPath = `/data/cities/${largestState.toLowerCase()}.json`;

  const result = { success: true, meta: { changes: 1 }, results: [] };
  const prepare = (sql: string, ids?: string) => ({
    bind: (argument?: string) => prepare(sql, argument),
    all: async () => {
      if (!sql.includes("FROM source_refresh")) return result;
      const filter = sql.includes("json_each") && ids ? new Set<string>(JSON.parse(ids)) : undefined;
      return { ...result, results: filter ? rows.filter(({ id }) => filter.has(id)) : rows };
    },
    first: async () => {
      if (sql.includes("FROM snapshot_publication")) return { slot: slot - 3_600_000, catalog: indexJson };
      if (sql.includes("SELECT paused")) return 0;
      return null;
    },
    run: async () => result,
  });
  const bindings = {
    SITE_URL: ORIGIN,
    KV: {
      get: async (key: string, type: string) => {
        const value = kv.get(key);
        return value ? type === "json" ? JSON.parse(value) : value : null;
      },
    },
    DB: { prepare, batch: async (statements: unknown[]) => statements.map(() => result) },
    SOURCE_QUEUE: { sendBatch: async () => {}, send: async () => {} },
    ASSETS: {
      fetch: async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (path === countyUrl) return new Response(page, { headers: { "content-type": "text/html" } });
        return new Response(path === cityPath ? cityRows : "[]");
      },
    },
    PUSH_CANARY_ENABLED: "true", PUSH_CANARY_FIPS: county.fips,
    VAPID_PUBLIC_KEY: "fixture", VAPID_PRIVATE_KEY: "fixture", VAPID_SUBJECT: "mailto:fixture@example.com",
  };
  const env = bindings as unknown as Env;
  const ctx = { waitUntil() {} } as unknown as ExecutionContext;

  async function request(path: string, init?: RequestInit) {
    // The real snapshot reader keys its isolate cache by the binding.
    const cold = { ...env, KV: { ...env.KV } };
    const input = new Request(ORIGIN + path, init) as Parameters<typeof worker.fetch>[0];
    const response = await worker.fetch(input, cold, ctx);
    if (!response.ok) throw new Error(`${path}: benchmark request failed with HTTP ${response.status}`);
    return response.text();
  }

  const mcp = (name: string, args: Record<string, unknown> = {}) => async () => {
    const response = await request("/mcp", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    if (!response.includes('"content"') || response.includes('"isError":true')) {
      throw new Error(`${name}: MCP fixture call failed`);
    }
    return response;
  };

  return {
    fetches: [
      ["HTTP status by county FIPS", () => request(`/api/v1/status?fips=${county.fips}`)],
      ["HTTP state active list", () => request(`/api/v1/bans?state=${largestState}`)],
      ["HTTP national active list", () => request("/api/v1/bans")],
      ["HTTP national fire weather", () => request("/api/v1/fire-weather")],
      ["HTTP coverage", () => request("/api/v1/coverage")],
      ["HTTP county HTML rewrite", () => request(countyUrl)],
      ["HTTP sitemap index", () => request("/sitemap.xml")],
      ["HTTP largest-state sitemap", () => request(`/sitemaps/${largestState.toLowerCase()}.xml`)],
      ["MCP status by county FIPS", mcp("check_burn_ban", { fips: county.fips })],
      ["MCP state active list (50)", mcp("list_active_bans", { state: largestState })],
      ["MCP national active list (50)", mcp("list_active_bans")],
      ["MCP coverage", mcp("coverage")],
    ] as const,
    jobs: [
      ["Hourly scheduling and enqueue", () => enqueueSources(env, slot)],
      ["Queue merge coordinator (51 dirty)", () => consumeSourceMessage(env, { kind: "merge", slot, due: [] }, { now })],
      ["Queue final notification step (empty)", () => advancePublication(env, {
        id: "fixture", generated: index.generated, slot, plan: [], cursor: 3,
      }, SOURCES, async () => undefined)],
      ["Queue push retry sweep (empty)", () => retryPendingPush(env, slot)],
      ["Daily push canary (empty)", () => runCanary(env, slot)],
    ] as const,
    poll(source: ActiveSource, fetch: ActiveSource["fetch"]) {
      const all = SOURCES.map((entry) => entry.id === source.id ? { ...source, fetch } : entry);
      return () => consumeSourceMessage(env, { kind: "source", id: source.id, slot }, { sources: all, now });
    },
  };
}
