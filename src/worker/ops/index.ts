import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Env } from "../env";
import { NotificationError } from "../notify";
import { opsApi } from "./api";
import { dashboardHtml } from "./html";

const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const OPS_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function validToken(token: string, secret?: string): boolean {
  if (!secret || !TOKEN.test(secret) || !TOKEN.test(token)) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(token), digest(secret));
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: OPS_HEADERS });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...OPS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function handleOps(request: Request, env: Env, url: URL): Promise<Response> {
  const route = /^\/ops\/([A-Za-z0-9_-]{32,128})\/(?:api\/([a-z-]+))?$/.exec(url.pathname);
  if (!route || !validToken(route[1], env.DASH_TOKEN)) return notFound();
  const action = route[2];
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (request.method === "POST" && (request.headers.get("Origin") !== url.origin || (fetchSite && fetchSite !== "same-origin"))) {
    return notFound();
  }

  if (!action && (request.method === "GET" || request.method === "HEAD")) {
    const nonce = crypto.randomUUID();
    return new Response(request.method === "HEAD" ? null : dashboardHtml(nonce), {
      headers: {
        ...OPS_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; worker-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
      },
    });
  }
  if (!action) return notFound();

  try {
    const result = await opsApi(request, env, url, action);
    return result === undefined ? notFound() : json(result);
  } catch (err) {
    if (err instanceof NotificationError) return json({ error: err.message }, err.status);
    if (err instanceof z.ZodError) return json({ error: "Check the inputs and try again." }, 400);
    console.error("Notification dashboard request failed", { action });
    return json({
      error: action === "notice"
        ? "The dashboard request failed. Check the delivery log before trying a send again."
        : "The dashboard request failed. Refresh the dashboard to check the current state.",
    }, 500);
  }
}
