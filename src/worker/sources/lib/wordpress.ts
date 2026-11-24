import { z } from "zod";
import { extractHtml, htmlText } from "./html";

// Inventory: WordPress, including the Faulkner REST search and Mississippi's Ninja Tables JSON.
// Use the REST query only when the site exposes the relevant content there.
export function wpRestUrl(site: string, kind: "posts" | "pages" | "search" | `${"pages" | "posts"}/${number}`, query: Record<string, string> = {}): string {
  return wpRestEndpoint(site, `wp/v2/${kind}`, query);
}

/** Build a URL for a public core or plugin REST route relative to the WordPress install. */
export function wpRestEndpoint(site: string, route: string, query: Record<string, string> = {}): string {
  const url = new URL(`wp-json/${route}`, site.replace(/\/?$/, "/"));
  url.search = new URLSearchParams(query).toString();
  return url.href;
}

const wpPage = z.object({
  id: z.number().int().positive(),
  status: z.literal("publish"),
  link: z.url(),
  modified_gmt: z.iso.datetime({ local: true, precision: 0 }),
  content: z.object({ rendered: z.string().trim().min(1), protected: z.literal(false) }),
});
type PageIdentity = { id: number; url: string };

/** Keep rendered markup so callers can distinguish the current status from historical or explanatory text. */
export function parseWpPage(data: unknown, expected: PageIdentity) {
  const page = wpPage.safeParse(data);
  if (!page.success || page.data.id !== expected.id || page.data.link !== expected.url) {
    throw new Error(`Invalid public WordPress page: ${expected.url}`);
  }
  const stamp = page.data.modified_gmt;
  return { html: page.data.content.rendered, modified: stamp.endsWith("Z") ? stamp : `${stamp}Z` };
}

/** Extract a published page or post's blocks and reject updates dated after this check. */
export async function parseWpPageBlocks(data: unknown, expected: PageIdentity, now: Date) {
  const { html, modified } = parseWpPage(data, expected);
  if (Date.parse(modified) > now.getTime()) throw new Error(`Future WordPress page update: ${expected.url}`);
  return { blocks: (await extractHtml(html)).blocks, modified };
}

/** Require exactly the pages requested from a REST collection and return them in request order. */
export async function parseWpPagesBlocks(data: unknown, expected: readonly PageIdentity[], now: Date) {
  if (!Array.isArray(data) || data.length !== expected.length) throw new Error("Incomplete WordPress page collection");
  return Promise.all(expected.map(async (page) => {
    const matches = data.filter((item) => item?.id === page.id);
    if (matches.length !== 1) throw new Error(`Missing or duplicate WordPress page: ${page.url}`);
    return parseWpPageBlocks(matches[0], page, now);
  }));
}

export function ninjaTablesUrl(site: string, tableId: number): string {
  const url = new URL("wp-admin/admin-ajax.php", site.replace(/\/?$/, "/"));
  url.search = new URLSearchParams({
    action: "wp_ajax_ninja_tables_public_action", table_id: String(tableId), target_action: "get-all-data",
  }).toString();
  return url.href;
}

type RestItem = { id: number; title: string; url: string; published: string | null; body: string };
export function parseWpItems(data: unknown): RestItem[] {
  if (!Array.isArray(data)) throw new Error("WordPress REST returned no item list");
  return data.map((item) => {
    const url = item?.link ?? item?.url;
    const title = typeof item?.title === "string" ? item.title : item?.title?.rendered;
    if (!Number.isInteger(item?.id) || typeof title !== "string" || typeof url !== "string") throw new Error("Invalid WordPress REST item");
    return {
      id: item.id, url, title: htmlText(title),
      published: typeof item.date_gmt === "string" && item.date_gmt ? item.date_gmt.replace(/Z?$/, "Z") : null,
      body: typeof item.content?.rendered === "string" ? htmlText(item.content.rendered) : "",
    };
  });
}

export function parseNinjaRows<T extends object>(data: unknown): T[] {
  if (!Array.isArray(data)) throw new Error("Ninja Tables returned no row list");
  return data.map((row) => {
    if (!row?.value || typeof row.value !== "object" || Array.isArray(row.value)) throw new Error("Invalid Ninja Tables row");
    return row.value as T;
  });
}
