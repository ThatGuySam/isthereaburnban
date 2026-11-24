// Private, aggregate usage counts for the API and MCP server, written to Workers Analytics Engine.
// One data point per request: route, tool, format, status, country, client class. Never IPs, full
// user agents or query values. A no-op when the USAGE binding is absent (tests, local dev without it).
import type { Env } from "./env";

export type ClientClass = "browser" | "bot" | "agent" | "script" | "other";

const CRAWLER = /gptbot|claudebot|claude-searchbot|oai-searchbot|perplexitybot|googlebot|google-extended|bingbot|applebot|yandex|baiduspider|duckduckbot|ahrefs|semrush|petalbot|bytespider|ccbot|crawler|spider|slurp/i;
const AGENT = /claude|anthropic|chatgpt|openai|cursor|copilot|gemini|perplexity|windsurf|cline|codex|mcp/i;
const BOT = /bot\b|bot\/|preview|facebookexternalhit|monitor|uptime/i;
const SCRIPT = /^(curl|wget|httpie|python|aiohttp|go-http-client|node|undici|axios|okhttp|java|ruby|php|libwww|deno|bun|postman|insomnia)/i;

/** Broad client type from the User-Agent; the UA itself is never stored. */
export function classifyClient(ua: string | null): ClientClass {
  if (!ua) return "other";
  if (CRAWLER.test(ua)) return "bot";
  if (AGENT.test(ua)) return "agent";
  if (BOT.test(ua)) return "bot";
  if (SCRIPT.test(ua)) return "script";
  if (/^Mozilla\//.test(ua)) return "browser";
  return "other";
}

/** Route template without IDs or query values: /api/v1/counties/40143 -> /api/v1/counties/:fips. */
export function routeName(path: string): string {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/mcp" || p.startsWith("/mcp/")) return "/mcp";
  if (/^\/api\/v1\/counties\/\d{5}$/.test(p)) return "/api/v1/counties/:fips";
  if (/^\/api\/v1\/(status|bans|coverage|fire-weather|push\/(key|subscribe|unsubscribe)|email\/(subscribe|confirm|unsubscribe))$/.test(p)) return p;
  return "/api/other";
}

export type McpCall = { method: string; tool: string };

/** Reads the JSON-RPC method (and tool name for tools/call) from a clone, before the MCP handler consumes the body. */
export async function peekMcp(request: Request): Promise<McpCall | undefined> {
  if (request.method !== "POST" || Number(request.headers.get("content-length") ?? 0) > 65_536) return undefined;
  try {
    const body = (await request.clone().json()) as unknown;
    const msg = (Array.isArray(body) ? body[0] : body) as { method?: unknown; params?: { name?: unknown } } | undefined;
    const method = typeof msg?.method === "string" ? msg.method.slice(0, 64) : "";
    const tool = method === "tools/call" && typeof msg?.params?.name === "string" ? msg.params.name.slice(0, 64) : "";
    return method ? { method, tool } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Columns (keep the order; the SQL in docs/launch.md depends on it):
 * blob1 surface (api|mcp), blob2 route, blob3 MCP method, blob4 tool, blob5 format, blob6 status,
 * blob7 country, blob8 client class; double1 = 1 (count); index1 = surface.
 */
export function recordUsage(env: Pick<Env, "USAGE">, request: Request, response: Response, mcp?: McpCall): void {
  if (!env.USAGE) return;
  const url = new URL(request.url);
  const route = routeName(url.pathname);
  const surface = route === "/mcp" ? "mcp" : "api";
  const format = surface === "mcp" ? "mcp" : url.searchParams.get("format") === "text" ? "text" : "json";
  const country = (request.cf as { country?: string } | undefined)?.country ?? "";
  try {
    env.USAGE.writeDataPoint({
      blobs: [surface, route, mcp?.method ?? "", mcp?.tool ?? "", format, String(response.status), country, classifyClient(request.headers.get("user-agent"))],
      doubles: [1],
      indexes: [surface],
    });
  } catch {
    /* counting must never break a request */
  }
}
