import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import type { Snapshot } from "../shared/types";
import { activeBans, coverage } from "./api";
import type { Env } from "./env";
import { lookup, resultSentence } from "./lookup";
import { getSnapshot } from "./snapshot";

function json(value: unknown, summary?: string) {
  const content: { type: "text"; text: string }[] = [];
  if (summary) content.push({ type: "text", text: summary });
  content.push({ type: "text", text: JSON.stringify(value, null, 2) });
  return { content };
}

function createServer(env: Env) {
  let snap: Promise<Snapshot> | undefined;
  const snapshot = () => (snap ??= getSnapshot(env));
  const server = new McpServer({ name: "isthereaburnban", version: "1.0.0" });

  server.registerTool(
    "check_burn_ban",
    {
      description:
        "Check whether a US county has an active burn ban. Give a 5-digit ZIP, or lat and lon, or a 5-digit county FIPS code. Returns one result per county (a ZIP can touch several). Status is ban, restricted, none, or unknown; unknown means we can't confirm, not that burning is allowed. Always point the user to officialUrl.",
      inputSchema: z.object({
        zip: z.string().regex(/^\d{5}$/).optional().describe("5-digit US ZIP code"),
        lat: z.number().min(-90).max(90).optional(),
        lon: z.number().min(-180).max(180).optional(),
        fips: z.string().regex(/^\d{5}$/).optional().describe("5-digit county FIPS, e.g. 40143 for Tulsa County, OK"),
      }),
    },
    async (args) => {
      try {
        const r = await lookup(env, await snapshot(), args);
        return json(r, r.results.map(resultSentence).join("\n"));
      } catch (err) {
        return { content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
      }
    },
  );

  server.registerTool(
    "list_active_bans",
    {
      description: "List counties with an active burn ban or burning restriction, optionally for one state (2-letter code). Only states with a live feed are included; see the coverage tool.",
      inputSchema: z.object({ state: z.string().length(2).optional().describe("2-letter state code, e.g. TX") }),
    },
    async ({ state }) => {
      const r = activeBans(await snapshot(), state);
      return json(r, `${r.counties.length} counties with a ban or restriction${state ? ` in ${state.toUpperCase()}` : ""} as of ${r.generated}.`);
    },
  );

  server.registerTool(
    "coverage",
    { description: "Which states have live burn ban data, which only have official links, and the health of each data source." },
    async () => json(coverage(await snapshot())),
  );

  return server;
}

export function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const site = new URL(env.SITE_URL).hostname;
  const host = new URL(request.url).hostname;
  const hosts = [site, "isthereaburnban.com", "www.isthereaburnban.com", "localhost", "127.0.0.1"];
  if (host.endsWith(".workers.dev")) hosts.push(host);
  return createMcpHandler(() => createServer(env), { route: "/mcp", allowedHostnames: hosts })(request, env, ctx);
}
