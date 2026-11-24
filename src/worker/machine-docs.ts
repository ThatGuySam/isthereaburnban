import { DOCS_ORIGIN } from "../shared/site-origin";
import type { Env } from "./env";

const TYPES: Record<string, string> = {
  "/llms.txt": "text/plain; charset=utf-8",
  "/openapi.json": "application/json; charset=utf-8",
  "/developers": "text/html; charset=utf-8",
  "/data": "text/html; charset=utf-8",
};

export async function serveMachineDocs(request: Request, env: Env, url: URL): Promise<Response | undefined> {
  const contentType = TYPES[url.pathname.replace(/\/$/, "")];
  if (!contentType || (request.method !== "GET" && request.method !== "HEAD")) return;

  const assetHeaders = new Headers(request.headers);
  assetHeaders.delete("if-none-match");
  assetHeaders.delete("if-modified-since");
  const asset = await env.ASSETS.fetch(new Request(request, { headers: assetHeaders }));
  if (!asset.ok) return asset;

  const origin = new URL(env.SITE_URL || url.origin).origin;
  const headers = new Headers(asset.headers);
  for (const header of ["content-length", "content-encoding", "etag", "last-modified"]) headers.delete(header);
  headers.set("content-type", contentType);
  headers.set("cache-control", "public, max-age=300");
  if (url.pathname.endsWith(".json") || url.pathname.endsWith(".txt")) headers.set("access-control-allow-origin", "*");
  const body = request.method === "HEAD" ? null : (await asset.text()).replaceAll(DOCS_ORIGIN, origin);
  return new Response(body, { status: asset.status, headers });
}
