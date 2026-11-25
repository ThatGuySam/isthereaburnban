// @ts-nocheck -- bun test types are not installed; this file runs under `bun test`, not the Worker build.
import { describe, expect, test } from "bun:test";
import worker from "./index";
import { classifyClient, mcpCall, recordUsage, routeName } from "./usage";

describe("usage counts", () => {
  test("client classes never keep the user agent", () => {
    expect(classifyClient("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15")).toBe("browser");
    expect(classifyClient("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)")).toBe("agent");
    expect(classifyClient("Claude-User/1.0")).toBe("agent");
    expect(classifyClient("Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)")).toBe("bot");
    expect(classifyClient("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe("bot");
    expect(classifyClient("curl/8.7.1")).toBe("script");
    expect(classifyClient("python-requests/2.32")).toBe("script");
    expect(classifyClient(null)).toBe("other");
  });

  test("routes drop IDs and unknown paths", () => {
    expect(routeName("/api/v1/counties/40143")).toBe("/api/v1/counties/:fips");
    expect(routeName("/api/v1/status/")).toBe("/api/v1/status");
    expect(routeName("/api/v1/whatever/secret")).toBe("/api/other");
    expect(routeName("/mcp")).toBe("/mcp");
  });

  test("reads only the MCP method and tool name", async () => {
    const req = new Request("https://x.test/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "check_burn_ban", arguments: { zip: "74103" } } }),
    });
    expect(mcpCall(await req.text())).toEqual({ method: "tools/call", tool: "check_burn_ban" });
  });

  test("writes one data point with no IP, UA or query values, and no-ops without a binding", () => {
    const points = [];
    const env = { USAGE: { writeDataPoint: (p) => points.push(p) } };
    const req = new Request("https://x.test/api/v1/status?zip=74103&format=text", { headers: { "user-agent": "curl/8", "cf-connecting-ip": "203.0.113.9" } });
    Object.defineProperty(req, "cf", { value: { country: "US", latitude: "36.1", city: "Tulsa" } });
    recordUsage(env, req, new Response("", { status: 200 }));
    expect(points).toEqual([{ blobs: ["api", "/api/v1/status", "", "", "text", "200", "US", "script"], doubles: [1], indexes: ["api"] }]);
    expect(JSON.stringify(points)).not.toMatch(/74103|203\.0\.113|curl\/8|Tulsa/);
    expect(() => recordUsage({}, req, new Response(""))).not.toThrow();
  });

  test("the Worker counts API requests, including errors", async () => {
    const points = [];
    const env = { SITE_URL: "https://isthereaburnban.com", USAGE: { writeDataPoint: (p) => points.push(p) } };
    const res = await worker.fetch(new Request("https://isthereaburnban.com/api/v1/nope", { method: "POST", body: "{}" }), env, {});
    expect(res.status).toBe(404);
    expect(points).toHaveLength(1);
    expect(points[0].blobs.slice(0, 2)).toEqual(["api", "/api/other"]);
    expect(points[0].blobs[5]).toBe("404");
  });
});

test("analytics bucket unrecognized MCP method and tool values", () => {
  const points = [];
  const env = { USAGE: { writeDataPoint: (p) => points.push(p) } };
  const req = new Request("https://x.test/mcp", { method: "POST" });
  recordUsage(env, req, new Response(null, { status: 400 }), { method: "account@example.test", tool: "40143" });
  recordUsage(env, req, new Response(null, { status: 400 }), { method: "tools/call", tool: "my address" });
  expect(points.map((p) => p.blobs.slice(2, 4))).toEqual([["other", ""], ["tools/call", "other"]]);
});

test("streamed API and MCP bodies are bounded without trusting Content-Length", async () => {
  const env = { SITE_URL: "https://isthereaburnban.com" };
  const ctx = { waitUntil() {} };
  for (const path of ["/api/v1/email/subscribe", "/mcp"]) {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(24_000));
        controller.enqueue(new Uint8Array(48_000));
        controller.close();
      },
    });
    const res = await worker.fetch(new Request(env.SITE_URL + path, {
      method: "POST", headers: { "content-type": "application/json", "content-length": "8" }, body, duplex: "half",
    }), env, ctx);
    expect(res.status).toBe(413);
  }
});

test("here lookup errors are marked private in both response formats", async () => {
  for (const format of ["text", "json"]) {
    const res = await worker.fetch(new Request(`https://isthereaburnban.com/api/v1/status?here=1&format=${format}`), {
      KV: {}, SITE_URL: "https://isthereaburnban.com",
    }, {});
    expect(res.status).toBe(422);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  }
});
