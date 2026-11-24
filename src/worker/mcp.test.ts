// @ts-nocheck -- bun test types are not installed; this file runs under `bun test`, not the Worker build.
import { describe, expect, test } from "bun:test";
import { subscribeAlertsTool } from "./mcp";

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
