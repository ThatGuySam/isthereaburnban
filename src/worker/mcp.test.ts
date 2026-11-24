// @ts-nocheck -- bun test types are not installed; this file runs under `bun test`, not the Worker build.
import { describe, expect, test } from "bun:test";
import { handleMcp, subscribeAlertsTool } from "./mcp";

function fakeEnv(resend?: string) {
  const inserts: unknown[][] = [];
  const sent: { to: string[]; text: string }[] = [];
  const env = {
    SITE_URL: "https://isthereaburnban.com",
    RESEND_API_KEY: resend,
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          run: async () => {
            if (sql.startsWith("INSERT")) inserts.push(args);
            return { meta: { changes: 1 } };
          },
        }),
      }),
    },
  };
  return { env, inserts, sent };
}

describe("subscribe_email_alerts", () => {
  test("stores an unconfirmed signup and says nothing is sent until the user confirms", async () => {
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
      expect(r.content[0].text).toContain("confirmation email to sam@example.com");
      expect(inserts.length).toBe(1);
      expect(inserts[0][1]).toBe("sam@example.com");
      expect(inserts[0][2]).toBe('["40143"]');
      expect(calls[0].url).toBe("https://api.resend.com/emails");
      expect(calls[0].body.text).toContain("/api/v1/email/confirm?token=");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("without Resend it saves but tells the agent no email went out", async () => {
    const { env } = fakeEnv(undefined);
    const r = await subscribeAlertsTool(env as any, { email: "a@b.co", fips: ["40143"] });
    expect(r.content[0].text).toContain("not switched on");
    expect(r.content[0].text).toContain("https://isthereaburnban.com/us/ok/tulsa-county/");
  });

  test("unknown counties are rejected before anything is stored", async () => {
    const { env, inserts } = fakeEnv("re_test");
    const r = await subscribeAlertsTool(env as any, { email: "a@b.co", fips: ["99999"] });
    expect(r.isError).toBe(true);
    expect(inserts.length).toBe(0);
  });
});

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const env = { SITE_URL: "https://isthereaburnban.com" };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const req = new Request("https://isthereaburnban.com/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: "isthereaburnban.com" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const res = await handleMcp(req, env as any, ctx as any);
  expect(res.status).toBe(200);
  const body = await res.text();
  const data = body.split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(data ? data.slice(6) : body).result;
}

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
    expect(by.subscribe_email_alerts.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
  });
});
