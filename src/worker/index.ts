import { activeFireWeather, coverage } from "./api";
import { confirmEmail, subscribeEmail, unsubscribeEmail } from "./email";
import type { Env } from "./env";
import { DISCLAIMER, lookup, LookupError, lookupText, statusFor } from "./lookup";
import { handleMcp } from "./mcp";
import { handleOps } from "./ops";
import { CANARY_CRON, runCanary } from "./notify";
import { handlePage, handleSitemap } from "./pages";
import { subscribePush, unsubscribePush } from "./push";
import { refresh, snapshotReader } from "./snapshot";
import { consumeSourceQueue, enqueueSources, type SourceMessage } from "./sources/queue";
import { peekMcp, recordUsage, type McpCall } from "./usage";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body: unknown, status = 200, cache = "public, max-age=300"): Response {
  return jsonResponse(JSON.stringify(body), status, cache);
}

function jsonResponse(body: string, status = 200, cache = "public, max-age=300"): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, ...CORS },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300", ...CORS } });
}

function error(message: string, status = 400): Response {
  return json({ error: message, disclaimer: DISCLAIMER }, status, "no-store");
}

function page(title: string, message: string, status = 200): Response {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font:18px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#123646}a{color:inherit}</style></head><body><h1>${esc(title)}</h1><p>${esc(message)}</p><p><a href="/">Is there a burn ban?</a></p></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) throw new LookupError("body too large", 413);
  try {
    return await request.json();
  } catch {
    throw new LookupError("body must be JSON");
  }
}

async function api(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "");
  const p = url.searchParams;
  const method = request.method;
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, "access-control-max-age": "86400" } });

  if (method === "GET") {
    if (path === "/api/v1/push/key") return env.VAPID_PUBLIC_KEY ? json({ publicKey: env.VAPID_PUBLIC_KEY }) : error("push is not configured", 503);
    if (path === "/api/v1/email/confirm") {
      return (await confirmEmail(env, p.get("token") ?? ""))
        ? page("You're subscribed", "We'll email you when the burn ban status changes for the counties you picked.")
        : page("Link not valid", "This confirmation link is invalid or was already unsubscribed.", 404);
    }
    if (path === "/api/v1/email/unsubscribe") {
      return (await unsubscribeEmail(env, p.get("token") ?? ""))
        ? page("Unsubscribed", "You won't get any more burn ban emails from us.")
        : page("Link not valid", "This unsubscribe link is invalid.", 404);
    }

    const snapshots = snapshotReader(env);
    if (path === "/api/v1/status") {
      const here = p.get("here") === "1";
      const cf = request.cf as { latitude?: string; longitude?: string } | undefined;
      if (here && !(cf?.latitude && cf?.longitude)) return error("could not locate this request; try zip= instead", 422);
      const q = here
        ? { lat: Number(cf!.latitude), lon: Number(cf!.longitude) }
        : {
            zip: p.get("zip") ?? undefined,
            fips: p.get("fips") ?? undefined,
            city: p.get("city") ?? undefined, state: p.get("state") ?? undefined,
            lat: p.has("lat") ? Number(p.get("lat")) : undefined,
            lon: p.has("lon") ? Number(p.get("lon")) : undefined,
          };
      const result = await lookup(env, snapshots, q);
      if (p.get("format") === "text") return text(lookupText(result) + `\n${DISCLAIMER}\n`);
      return json(result, 200, here ? "private, max-age=300" : undefined);
    }
    if (path === "/api/v1/map-status") {
      const map = await snapshots.mapStatus();
      const maxAge = Math.max(0, Math.floor((map.expiresAt - Date.now()) / 1000));
      return json(map, 200, `public, max-age=${maxAge}, must-revalidate`);
    }
    if (path === "/api/v1/bans") return jsonResponse((await snapshots.bans(p.get("state") ?? undefined)).body.join(""));
    if (path === "/api/v1/fire-weather") return json(activeFireWeather(await snapshots.weather(), p.get("state") ?? undefined));
    if (path === "/api/v1/coverage") return json(coverage(await snapshots.coverage()));
    const m = path.match(/^\/api\/v1\/counties\/(\d{5})$/);
    if (m) return json({ ...statusFor(await snapshots.county(m[1]), m[1]), disclaimer: DISCLAIMER });
  }

  if (method === "POST") {
    let r: { ok: boolean; error?: string };
    if (path === "/api/v1/push/subscribe") r = await subscribePush(env, await readJson(request));
    else if (path === "/api/v1/push/unsubscribe") r = await unsubscribePush(env, await readJson(request));
    else if (path === "/api/v1/email/subscribe") r = await subscribeEmail(env, await readJson(request));
    else return error("not found", 404);
    return json(r, r.ok ? 200 : 400, "no-store");
  }

  return error("not found", 404);
}

async function route(request: Request, env: Env, ctx: ExecutionContext, mcp?: McpCall): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/ops" || path.startsWith("/ops/")) return handleOps(request, env, url);
  try {
    if (path.startsWith("/api/")) return await api(request, env, url);
    if (path === "/mcp" || path.startsWith("/mcp/")) return await handleMcp(request, env, ctx, mcp);
    if (path.startsWith("/us/")) return await handlePage(request, env, snapshotReader(env));
    if (path === "/sitemap.xml" || path.startsWith("/sitemaps/")) return await handleSitemap(request, env, snapshotReader(env));
  } catch (err) {
    if (err instanceof LookupError) return error(err.message, err.status);
    console.error(err);
    return error("internal error", 500);
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    // Aggregate API/MCP counts (src/worker/usage.ts); nothing identifying is written.
    const path = new URL(request.url).pathname;
    const counted = request.method !== "OPTIONS" && (path.startsWith("/api/") || path === "/mcp" || path.startsWith("/mcp/"));
    const mcp = counted && path.startsWith("/mcp") ? await peekMcp(request) : undefined;
    const response = await route(request, env, ctx, mcp);
    if (counted) recordUsage(env, request, response, mcp);
    return response;
  },

  scheduled(controller, env, ctx) {
    ctx.waitUntil(controller.cron === CANARY_CRON
      ? runCanary(env, controller.scheduledTime)
      : env.SOURCE_QUEUE
        ? enqueueSources(env, controller.scheduledTime)
        : refresh(env, undefined, controller.scheduledTime));
  },
  queue: consumeSourceQueue,
} satisfies ExportedHandler<Env, SourceMessage>;

