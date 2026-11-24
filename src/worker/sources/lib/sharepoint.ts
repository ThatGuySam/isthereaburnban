import { getText } from "./http";
import { blockAfterHeading, type HtmlParts } from "./html";

// Inventory: Kentucky's county burn-ban list, Maryland DNR, Oregon DEQ and Sacramento Metro AQMD.
// Reuse rendered tables when the public list REST endpoint is unavailable.
export function sharePointListUrl(site: string, list: string, query: Record<string, string> = {}): string {
  const name = encodeURIComponent(list.replace(/'/g, "''")).replace(/'/g, "%27");
  const url = new URL(`_api/web/lists/getbytitle('${name}')/items`, site.replace(/\/?$/, "/"));
  url.search = new URLSearchParams(query).toString();
  return url.href;
}

export function sharePointRows(parts: HtmlParts, columns: string[]): string[][] {
  const expected = columns.map((column) => column.trim().toLowerCase());
  for (const table of parts.tables) {
    const header = table.rows.findIndex((row) => expected.every((column) => row.some((cell) => cell.toLowerCase() === column)));
    if (header < 0) continue;
    const indices = expected.map((column) => table.rows[header].findIndex((cell) => cell.toLowerCase() === column));
    return table.rows.slice(header + 1).map((row) => indices.map((index) => row[index] ?? ""));
  }
  throw new Error("SharePoint list headers not found");
}

/** Rendered list layouts, including SharePoint rich-text lists built from paragraphs. */
export function sharePointListItems(parts: HtmlParts, heading: RegExp): string[] {
  return blockAfterHeading(parts.blocks, heading).filter(({ tag }) => tag === "li" || tag === "p").map(({ text }) => text);
}

export function parseSharePointItems(data: unknown): { rows: Record<string, unknown>[]; next?: string } {
  const envelope = data as { value?: unknown; d?: { results?: unknown; __next?: string }; "@odata.nextLink"?: string; "odata.nextLink"?: string };
  const rows = envelope?.value ?? envelope?.d?.results;
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error("SharePoint returned no item list");
  }
  return { rows, next: envelope["@odata.nextLink"] ?? envelope["odata.nextLink"] ?? envelope.d?.__next };
}

/** Validate the single publishing page returned by a file-name filter. */
export function parseSharePointPage(data: unknown, { fileName, contentField }: { fileName: string; contentField: string }) {
  const { rows, next } = parseSharePointItems(data);
  const [row] = rows;
  if (next || rows.length !== 1 || row.FileLeafRef !== fileName) throw new Error(`Expected one SharePoint page: ${fileName}`);
  const content = row[contentField];
  const stamp = row.Modified;
  if (typeof content !== "string" || !content.trim() || typeof stamp !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(stamp)) {
    throw new Error(`Missing SharePoint page content or UTC edit time: ${fileName}`);
  }
  const time = Date.parse(stamp);
  if (!Number.isFinite(time)) throw new Error(`Invalid SharePoint edit time: ${fileName}`);
  const modified = new Date(time).toISOString();
  if (modified !== stamp && modified.replace(".000Z", "Z") !== stamp) throw new Error(`Invalid SharePoint edit time: ${fileName}`);
  return { content, modified };
}

export async function readSharePointList(url: string, maxPages = 10): Promise<Record<string, unknown>[]> {
  const origin = new URL(url).origin;
  const rows: Record<string, unknown>[] = [];
  const visited = new Set<string>();
  while (url) {
    if (visited.size >= maxPages || visited.has(url) || new URL(url).origin !== origin) throw new Error("Invalid SharePoint pagination");
    visited.add(url);
    const page = parseSharePointItems(JSON.parse(await getText(url, { headers: { accept: "application/json;odata=nometadata" } })));
    rows.push(...page.rows);
    url = page.next ? new URL(page.next, url).href : "";
  }
  return rows;
}
