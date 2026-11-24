import { parseUsDate } from "./dates";
import { blockAfterHeading, extractHtmlGrid, type HtmlParts } from "./html";

// Inventory: CivicPlus/CivicEngage, including AlertCenter, CivicAlerts and mobile News Flash
// in Pima, Angel Fire, Greenwich, Placer, and Puget Sound Clean Air's embedded status table.
export function civicPlusUrl(site: string, channel: "alerts" | "news" | "mobile"): string {
  return new URL({ alerts: "/AlertCenter.aspx", news: "/CivicAlerts.aspx", mobile: "/m/newsflash" }[channel], site).href;
}

/** Read the text widgets in a classic CivicPlus content page, excluding menus and sidebars. */
export async function civicPlusPageParagraphs(input: Response | string, title: string): Promise<string[]> {
  const page = "#moduleContent #page";
  const rows = await extractHtmlGrid(input, {
    row: page,
    cell: `${page} #versionHeadLine, ${page} .pageContent .widgetText .textContent > p`,
  });
  const [heading, ...body] = rows[0] ?? [];
  const paragraphs = body.map(({ text }) => text).filter(Boolean);
  if (rows.length !== 1 || heading?.text !== title || !paragraphs.length) {
    throw new Error(`CivicPlus content page: expected ${title} and its text widgets`);
  }
  return paragraphs;
}

/** Read the visible details of a CivicPlus emergency alert widget below its unique title. */
export function civicPlusAlertDetails(parts: HtmlParts, heading: RegExp): string[] {
  const title = new RegExp(heading.source, heading.flags.replace(/[gy]/g, ""));
  const titles = parts.blocks.filter(({ tag, text }) => tag === "h2" && title.test(text));
  if (titles.length !== 1) return [];
  const blocks = blockAfterHeading(parts.blocks.slice(parts.blocks.indexOf(titles[0])), title);
  if (blocks[0]?.tag !== "h3" || blocks[0].text !== "Alert Type:") return [];
  return blocks.filter(({ tag }) => tag === "p").map(({ text }) => text);
}

export function civicPlusNotices(parts: HtmlParts, pageUrl: string): { title: string; url: string }[] {
  const home = new URL(pageUrl);
  const found = new Map<string, { title: string; url: string }>();
  for (const { href, text } of parts.links) {
    if (!text) continue;
    let url: URL;
    try { url = new URL(href, home); } catch { continue; }
    if (url.origin !== home.origin) continue;
    const item = /^\/(?:AlertCenter\.aspx|CivicAlerts\.aspx)$/i.test(url.pathname)
      ? url.searchParams.get("AID") ?? url.searchParams.get("aid")
      : /^\/(?:AlertCenter|CivicAlerts\/showalert|m\/newsflash\/(?:home\/detail|archive\/item))\/(?:[^/]+-)?(\d+)\/?$/i.exec(url.pathname)?.[1];
    if (!item || !/^\d+$/.test(item)) continue;
    url.hash = "";
    found.set(url.href, { title: text, url: url.href });
  }
  return [...found.values()];
}

/** Read the active category list in the redesigned CivicPlus News Flash, excluding the carousel. */
export async function civicPlusNewsFlash(input: Response | string, { id, name }: { id: number; name: string }) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid News Flash category ID");
  const header = `#articles-category-${id}-header`;
  const list = `#list-articles-category-${id}`;
  const [category, ...items] = await extractHtmlGrid(input, {
    row: `${header}, ${list} > li`,
    cell: `${header} h2, ${header} .category-count, ${list} .article-list-header, ${list} .article-preview, ${list} .article-list-footer .fst-italic`,
  });
  const count = /^(\d+) news items?$/.exec(category?.[1]?.text ?? "");
  if (category?.length !== 2 || category[0].text !== name || !count || Number(count[1]) !== items.length) {
    throw new Error("CivicPlus News Flash: expected a complete active category list");
  }
  return items.map((cells) => {
    const [title, preview, date] = cells.map(({ text }) => text);
    const stamp = /^Posted on ([^|]+?)(?: \| Last Updated on (.+))?$/.exec(date ?? "");
    const posted = stamp && parseUsDate(stamp[1]);
    const updated = stamp?.[2] ? parseUsDate(stamp[2]) : posted;
    if (cells.length !== 3 || !title || !posted || !updated || updated < posted) {
      throw new Error("CivicPlus News Flash: expected a title, preview and valid publication date");
    }
    return { title, preview, posted, updated };
  });
}
