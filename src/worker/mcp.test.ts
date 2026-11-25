// @ts-nocheck -- bun test types are not installed; this file runs under `bun test`, not the Worker build.
import { describe, expect, test } from "bun:test";
import { activeBans } from "./api";
import { handleMcp, subscribeAlertsTool } from "./mcp";
import { encodeActive, encodeState, INDEX_KEY, PRETTY_ACTIVE_KEY } from "./snapshot-v2";
import { withCurrentLinks } from "./source-links";

function fakeEnv(resend?: string) {
  const inserts: unknown[][] = [];
  const env = {
    SITE_URL: "https://isthereaburnban.com",
    RESEND_API_KEY: resend,
    DB: {
      prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({ sql, args }) }),
      batch: async ([, pending]) => {
        inserts.push(pending.args);
        return [{ results: [] }, { results: [{ token: pending.args[4], created: pending.args[5] }] }];
      },
    },
  };
  return { env, inserts };
}

describe("subscribe_email_alerts", () => {
  test("stores an unconfirmed signup and sends a confirmation email", async () => {
    const { env, inserts } = fakeEnv("re_test");
    const realFetch = globalThis.fetch;
    const calls: { url: string; body: any }[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const r = await subscribeAlertsTool(env as any, { email: "Sam@Example.com", fips: ["40143"] });
      expect(r.isError).toBeUndefined();
      expect(r.content[0].text).toContain("check the inbox for sam@example.com");
      expect(inserts.length).toBe(1);
      expect(inserts[0][1]).toBe("sam@example.com");
      expect(inserts[0][2]).toBe('["40143"]');
      expect(calls[0].url).toBe("https://api.resend.com/emails");
      expect(calls[0].body.text).toContain("/api/v1/email/confirm?token=");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("without Resend it reports email is unavailable and stores nothing", async () => {
    const { env, inserts } = fakeEnv(undefined);
    const r = await subscribeAlertsTool(env as any, { email: "a@b.co", fips: ["40143"] });
    expect(r.content[0].text).toContain("Email signups are unavailable");
    expect(inserts).toHaveLength(0);
    expect(r.content[0].text).toContain("https://isthereaburnban.com/us/ok/tulsa-county/");
  });

  test("unknown counties are rejected before anything is stored", async () => {
    const { env, inserts } = fakeEnv("re_test");
    const r = await subscribeAlertsTool(env as any, { email: "a@b.co", fips: ["99999"] });
    expect(r.isError).toBe(true);
    expect(inserts.length).toBe(0);
  });
});

async function rpc(method: string, params: Record<string, unknown> = {}, env = { SITE_URL: "https://isthereaburnban.com" }, extraHeaders = {}) {
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const req = new Request("https://isthereaburnban.com/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: "isthereaburnban.com", ...extraHeaders },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const res = await handleMcp(req, env as any, ctx as any);
  expect(res.status).toBe(200);
  const body = await res.text();
  const data = body.split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(data ? data.slice(6) : body).result;
}

test("national bans preserve JSON text in legacy SSE and modern JSON MCP responses", async () => {
  const generated = new Date().toISOString();
  const snapshot = { version: 2, state: "OK", revision: "fixture", generated, sources: [], changed: {}, counties: {
    "40143": { fips: "40143", state: "OK", county: "Tulsa County", status: "ban", label: 'Burn ban — read "updates"\nNew line',
      since: null, expires: null, sourceUpdated: null, checked: generated, sourceName: "County", sourceUrl: "", officialUrl: "" },
  } };
  const row = encodeState(snapshot, "fixture");
  const index = { version: 2, revision: "fixture", generated, sources: [], states: {}, orderChecks: {} };
  const values = new Map([[INDEX_KEY, JSON.stringify(index)], [PRETTY_ACTIVE_KEY, encodeActive(index.revision, [{ ...row, active: row.pretty }])]]);
  const env = { SITE_URL: "https://isthereaburnban.com", KV: { get: async (key, type) => {
    const value = values.get(key);
    return type === "json" && value ? JSON.parse(value) : value ?? null;
  } }, DB: { prepare: () => ({ all: async () => ({ results: [] }) }) } };
  const params = { name: "list_active_bans", arguments: {} };
  const legacy = await rpc("tools/call", params, env);
  const version = "2026-07-28";
  const modern = await rpc("tools/call", { ...params, _meta: {
    "io.modelcontextprotocol/protocolVersion": version, "io.modelcontextprotocol/clientCapabilities": {},
  } }, env, {
    "mcp-protocol-version": version, "mcp-method": "tools/call", "mcp-name": params.name,
  });
  expect(modern.content).toEqual(legacy.content);
  expect(legacy.content[1].text).toBe(JSON.stringify(activeBans(withCurrentLinks(snapshot)), null, 2));
});

describe("MCP metadata for directories", () => {
  test("initialize names the server, its site and how to use it", async () => {
    const r = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(r.serverInfo).toMatchObject({ name: "isthereaburnban", title: "Is There a Burn Ban?", websiteUrl: "https://isthereaburnban.com/developers/" });
    expect(r.serverInfo.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(r.instructions).toContain("check_burn_ban");
    expect(r.instructions).toContain("officialUrl");
  });

  test("every tool has a title and read/write annotations", async () => {
    const { tools } = await rpc("tools/list");
    const by = Object.fromEntries(tools.map((t: any) => [t.name, t]));
    expect(Object.keys(by).sort()).toEqual(["check_burn_ban", "coverage", "list_active_bans", "subscribe_email_alerts"]);
    for (const t of tools) {
      expect(typeof t.title).toBe("string");
      expect(t.title.length).toBeGreaterThan(3);
      expect(typeof t.annotations?.readOnlyHint).toBe("boolean");
    }
    for (const name of ["check_burn_ban", "list_active_bans", "coverage"]) expect(by[name].annotations.readOnlyHint).toBe(true);
    expect(by.subscribe_email_alerts.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
  });
});
