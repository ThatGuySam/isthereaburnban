import { bansPage } from "./bans-page";
import { activeFireWeather, coverage } from "./api";
import { confirmEmail, subscribeEmail, unsubscribeEmailFromForm } from "./email";
import { EMAIL_UNSUBSCRIBE_PATH, UNSUBSCRIBE_FIELD, UNSUBSCRIBE_VALUE } from "./email-message";
import type { Env } from "./env";
import { DISCLAIMER, lookup, LookupError, lookupText, statusFor } from "./lookup";
import { serveMachineDocs } from "./machine-docs";
import { statusCacheControl } from "./map-status";
import { handleMcp } from "./mcp";
import { handleOps } from "./ops";
import { CANARY_CRON, runCanary } from "./notify";
import { handlePage, handleSitemap } from "./pages";
import { readJsonBody, RequestBodyError } from "./request-body";
import { subscribePush, unsubscribePush } from "./push";
import { refresh, snapshotReader } from "./snapshot";
import { consumeSourceQueue, enqueueSources, type SourceMessage } from "./sources/queue";
import { recordUsage } from "./usage";

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

function text(body: string, status = 200, cache = "public, max-age=300"): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": cache, ...CORS } });
}

function error(message: string, status = 400): Response {
  return json({ error: message, disclaimer: DISCLAIMER }, status, "no-store");
}

function page(title: string, message: string, status = 200, unsubscribeAction?: string): Response {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const form = unsubscribeAction
    ? `<form method="post" action="${esc(unsubscribeAction)}"><button type="submit" name="${UNSUBSCRIBE_FIELD}" value="${UNSUBSCRIBE_VALUE}">Unsubscribe</button></form>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font:18px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#123646}a{color:inherit}button{font:inherit;padding:.4em .8em}</style></head><body><h1>${esc(title)}</h1><p>${esc(message)}</p>${form}<p><a href="/">Is there a burn ban?</a></p></body></html>`;
  return new Response(html, { status, headers: {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer",
  } });
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
        ? page("You're subscribed", "Your subscription is active for eligible changes in the counties you picked.")
        : page("Link not valid", "This confirmation link is invalid, expired, or was already unsubscribed.", 404);
    }
    if (path === EMAIL_UNSUBSCRIBE_PATH) {
      const token = p.get("token");
      return token
        ? page("Unsubscribe from burn ban alerts", "Stop email alerts for the county selection linked to this message.", 200,
          `${EMAIL_UNSUBSCRIBE_PATH}?${new URLSearchParams({ token })}`)
        : page("Link not valid", "This unsubscribe link is invalid.", 404);
    }

    const snapshots = snapshotReader(env);
    if (path === "/api/v1/status") {
      const here = p.get("here") === "1";
      const cf = request.cf as { latitude?: string; longitude?: string } | undefined;
      if (here && !(cf?.latitude && cf?.longitude)) return error("could not locate this request; try zip= instead", 422);
      const q = here
        ? { lat: Number(cf!.latitude), lon: Number(cf!.longitude), here: true as const }
        : {
            zip: p.get("zip") ?? undefined,
            fips: p.get("fips") ?? undefined,
            city: p.get("city") ?? undefined, state: p.get("state") ?? undefined,
            lat: p.has("lat") ? Number(p.get("lat")) : undefined,
            lon: p.has("lon") ? Number(p.get("lon")) : undefined,
          };
      const result = await lookup(env, snapshots, q);
      const cache = here || q.lat !== undefined || q.lon !== undefined ? "private, no-store" : statusCacheControl(snapshots.nextBoundary());
      if (p.get("format") === "text") return text(lookupText(result) + `\n${DISCLAIMER}\n`, 200, cache);
      return json(result, 200, cache);
    }
    if (path === "/api/v1/map-status") {
      const map = await snapshots.mapStatus();
      return json(map, 200, statusCacheControl(map.expiresAt));
    }
    if (path === "/api/v1/bans") {
      const limit = p.get("limit") ?? undefined;
      const cursor = p.get("cursor") ?? undefined;
      const bans = await snapshots.bans(p.get("state") ?? undefined,
        limit !== undefined || cursor !== undefined ? bansPage(limit, cursor) : undefined);
      return json(bans.data, 200, statusCacheControl(bans.nextBoundary));
    }
    if (path === "/api/v1/fire-weather") {
      const weather = activeFireWeather(await snapshots.weather(), p.get("state") ?? undefined);
      return json(weather, 200, statusCacheControl(snapshots.nextBoundary()));
    }
    if (path === "/api/v1/coverage") return json(coverage(await snapshots.coverage()));
    const m = path.match(/^\/api\/v1\/counties\/(\d{5})$/);
    if (m) {
      const snapshot = await snapshots.county(m[1]);
      return json({ ...statusFor(snapshot, m[1]), generated: snapshot.generated, disclaimer: DISCLAIMER },
        200, statusCacheControl(snapshots.nextBoundary()));
    }
  }

  if (method === "POST") {
    if (path === EMAIL_UNSUBSCRIBE_PATH) {
      const removed = await unsubscribeEmailFromForm(env, request, p.get("token") ?? "");
      if (request.headers.get("accept")?.includes("text/html")) {
        return removed
          ? page("Unsubscribed", "Email alerts for this county selection are off. A message already being sent may still arrive.")
          : page("Link not valid", "This unsubscribe link is invalid.", 404);
      }
      return new Response(null, { status: removed ? 204 : 404, headers: { "cache-control": "no-store" } });
    }
    let r: { ok: boolean; error?: string };
    if (path === "/api/v1/push/subscribe") r = await subscribePush(env, await readJsonBody(request, 16_384));
    else if (path === "/api/v1/push/unsubscribe") r = await unsubscribePush(env, await readJsonBody(request, 16_384));
    else if (path === "/api/v1/email/subscribe") r = await subscribeEmail(env, await readJsonBody(request, 16_384));
    else return error("not found", 404);
    return json(r, r.ok ? 200 : 400, "no-store");
  }

  return error("not found", 404);
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/ops" || path.startsWith("/ops/")) return handleOps(request, env, url);
  try {
    if (path.startsWith("/api/")) return await api(request, env, url);
    const docs = await serveMachineDocs(request, env, url);
    if (docs) return docs;
    if (path === "/mcp" || path.startsWith("/mcp/")) return await handleMcp(request, env, ctx);
    if (path.startsWith("/us/")) return await handlePage(request, env, snapshotReader(env));
    if (path === "/sitemap.xml" || path.startsWith("/sitemaps/")) return await handleSitemap(request, env, snapshotReader(env));
  } catch (err) {
    if (err instanceof LookupError || err instanceof RequestBodyError) return error(err.message, err.status);
    console.error(err);
    return error("internal error", 500);
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    // Aggregate API/MCP counts (src/worker/usage.ts); nothing identifying is written.
    const url = new URL(request.url);
    const response = await route(request, env, ctx);
    if (request.method !== "OPTIONS" && url.pathname.startsWith("/api/")) recordUsage(env, request, response);
    if (request.method === "GET" && url.pathname.replace(/\/+$/, "") === "/api/v1/status" &&
        url.searchParams.get("here") === "1" && response.headers.get("cache-control") !== "private, no-store") {
      const headers = new Headers(response.headers);
      headers.set("cache-control", "private, no-store");
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  },

  scheduled(controller, env, ctx) {
    ctx.waitUntil(controller.cron === CANARY_CRON
      ? runCanary(env, controller.scheduledTime)
      : env.SOURCE_QUEUE
        ? Promise.all([enqueueSources(env, controller.scheduledTime), env.SOURCE_QUEUE.send({ kind: "deliver" }),
          env.SOURCE_QUEUE.send({ kind: "monitor" }, { delaySeconds: 15 * 60 })])
        : refresh(env, undefined, controller.scheduledTime));
  },
  queue: consumeSourceQueue,
} satisfies ExportedHandler<Env, SourceMessage>;

