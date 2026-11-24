import { activeBans, coverage } from "./api";
import { confirmEmail, subscribeEmail, unsubscribeEmail } from "./email";
import type { Env } from "./env";
import { DISCLAIMER, lookup, LookupError, resultSentence, statusFor } from "./lookup";
import { handleMcp } from "./mcp";
import { handleOps } from "./ops";
import { CANARY_CRON, runCanary } from "./notify";
import { handlePage, handleSitemap } from "./pages";
import { subscribePush, unsubscribePush } from "./push";
import { getSnapshot, refresh } from "./snapshot";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body: unknown, status = 200, cache = "public, max-age=300"): Response {
  return new Response(JSON.stringify(body), {
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

    const snapshot = await getSnapshot(env);
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
      const result = await lookup(env, snapshot, q);
      if (p.get("format") === "text") return text(result.results.map(resultSentence).join("\n") + `\n${DISCLAIMER}\n`);
      return json(result, 200, here ? "private, max-age=300" : undefined);
    }
    if (path === "/api/v1/bans") return json(activeBans(snapshot, p.get("state") ?? undefined));
    if (path === "/api/v1/coverage") return json(coverage(snapshot));
    const m = path.match(/^\/api\/v1\/counties\/(\d{5})$/);
    if (m) return json({ ...statusFor(snapshot, m[1]), disclaimer: DISCLAIMER });
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

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/ops" || path.startsWith("/ops/")) return handleOps(request, env, url);
    try {
      if (path.startsWith("/api/")) return await api(request, env, url);
      if (path === "/mcp" || path.startsWith("/mcp/")) return await handleMcp(request, env, ctx);
      if (path.startsWith("/us/")) return await handlePage(request, env, await getSnapshot(env));
      if (path === "/sitemap.xml" || path.startsWith("/sitemaps/")) return await handleSitemap(request, env, await getSnapshot(env));
    } catch (err) {
      if (err instanceof LookupError) return error(err.message, err.status);
      console.error(err);
      return error("internal error", 500);
    }
    return env.ASSETS.fetch(request);
  },

  scheduled(controller, env, ctx) {
    ctx.waitUntil(controller.cron === CANARY_CRON
      ? runCanary(env, controller.scheduledTime)
      : refresh(env, undefined, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;

