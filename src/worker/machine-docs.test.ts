// @ts-nocheck -- bun test types aren't installed.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import worker from "./index";
import { SNAPSHOT_KEY } from "./env";

test("the machine docs and the MCP server use the configured preview origin", async () => {
  const origin = "https://preview.burn.example";
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const generated = new Date().toISOString();
  const env = {
    SITE_URL: `${origin}/`,
    ASSETS: { fetch: async (request) => {
      const { pathname } = new URL(request.url);
      const source = pathname === "/developers/" ? "<pre>curl https://site.example/api/v1/status</pre>"
        : readFileSync(`public${pathname}`, "utf8");
      return new Response(source);
    } },
    KV: { get: async (key) => key === SNAPSHOT_KEY ? { version: 1, generated, counties: {}, changed: {}, sources: [] } : null },
    DB: { prepare: () => ({ first: async () => null }) },
  };
  const get = (path) => worker.fetch(new Request(`https://beta.isthereaburnban.com${path}`), env, ctx);
  const llms = await (await get("/llms.txt")).text();
  expect(llms).toContain(`${origin}/mcp`);
  expect(llms).not.toContain("https://isthereaburnban.com/api/");
  const spec = await (await get("/openapi.json")).json();
  expect(spec.servers).toEqual([{ url: origin }]);
  expect(await (await get("/developers/")).text()).toContain(`${origin}/api/v1/status`);

  const mcpUrl = `${spec.servers[0].url}/mcp`;
  const rpc = async (method, params) => {
    const response = await worker.fetch(new Request(mcpUrl, {
      method: "POST", headers: { host: new URL(mcpUrl).hostname, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }), env, ctx);
    const body = await response.text();
    expect(response.status, body).toBe(200);
    const data = body.split("\n").find((line) => line.startsWith("data: "));
    return JSON.parse(data ? data.slice(6) : body).result;
  };
  const init = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  expect(init.serverInfo.websiteUrl).toBe(`${origin}/developers/`);
  const tools = await rpc("tools/list", {});
  expect(tools.tools.map(({ name }) => name)).toContain("check_burn_ban");
  const answer = await rpc("tools/call", { name: "check_burn_ban", arguments: { fips: "40143" } });
  expect(JSON.parse(answer.content[1].text).results[0]).toMatchObject({ fips: "40143", status: "unknown" });
});
