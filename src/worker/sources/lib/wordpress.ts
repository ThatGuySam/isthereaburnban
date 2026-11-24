import { htmlText } from "./html";

// Inventory: WordPress, including the Faulkner REST search and Mississippi's Ninja Tables JSON.
// Use the REST query only when the site exposes the relevant content there.
export function wpRestUrl(site: string, kind: "posts" | "pages" | "search", query: Record<string, string> = {}): string {
  const url = new URL(`wp-json/wp/v2/${kind}`, site.replace(/\/?$/, "/"));
  url.search = new URLSearchParams(query).toString();
  return url.href;
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
