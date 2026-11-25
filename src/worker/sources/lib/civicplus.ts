import { parseUsDate } from "./dates";
import { blockAfterHeading, extractHtmlGrid, type HtmlParts } from "./html";

// Inventory: CivicPlus/CivicEngage, including AlertCenter, CivicAlerts and mobile News Flash
// in Pima, Angel Fire, Greenwich, Placer, and Puget Sound Clean Air's embedded status table.
export function civicPlusUrl(site: string, channel: "alerts" | "news" | "mobile"): string {
  return new URL({ alerts: "/AlertCenter.aspx", news: "/CivicAlerts.aspx", mobile: "/m/newsflash" }[channel], site).href;
}

type PageBlock = "h2" | "h3" | "p" | "li";

/** Read selected blocks from CivicPlus text and rich-text widgets, excluding navigation and sidebars. */
export async function civicPlusPageText(
  input: Response | string, title: string, blocks: readonly PageBlock[] = ["p"],
): Promise<string[]> {
  const page = "#moduleContent #page";
  const widgets = [`${page} .pageContent .widgetText .textContent`, `${page} .pageContent .widget.editor .fr-view`];
  const content = widgets.flatMap((widget) => blocks.flatMap((block) => block === "li"
    ? [`${widget} > ul > li`, `${widget} > ol > li`]
    : [`${widget} > ${block}`]));
  const rows = await extractHtmlGrid(input, {
    row: page,
    cell: [`${page} #versionHeadLine`, ...content].join(", "),
  });
  const [heading, ...body] = rows[0] ?? [];
  const text = body.map((block) => block.text).filter(Boolean);
  if (rows.length !== 1 || heading?.text !== title || !text.length) {
    throw new Error(`CivicPlus content page: expected ${title} and its text widgets`);
  }
  return text;
}

export function civicPlusPageParagraphs(input: Response | string, title: string): Promise<string[]> {
  return civicPlusPageText(input, title);
}

/** Read the CivicPlus Form Center heading and its public instruction fields. */
export async function civicPlusFormInstructions(input: Response | string) {
  const [form, ...extra] = await extractHtmlGrid(input, {
    row: "#formWrap",
    cell: "#formWrap .formHeader h2, #formWrap li.HeaderInstructions > .label",
  });
  const [title, ...instructions] = form ?? [];
  if (extra.length || !title?.text || !instructions.length || instructions.some(({ text }) => !text)) {
    throw new Error("CivicPlus Form Center: expected a heading and public instructions");
  }
  return { title: title.text, instructions: instructions.map(({ text }) => text) };
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

/** Read live CivicEngage Alert Center cards and ignore toolbar links and archived notices. */
export async function civicPlusActiveAlerts(input: Response | string, pageUrl: string) {
  const header = '[id$="_divAlertCenterHeader"]';
  const card = '[id$="_categoriesUpdatePanel"] ol.alerts-list > li > .alert.on';
  const title = `${card} > h3 > a`;
  const stamp = `${card} > .date`;
  const [heading, ...alerts] = await extractHtmlGrid(input, {
    row: `${header}, ${card}`,
    cell: `${header} h1, ${stamp}, ${title}, ${card} > p`,
  });
  if (heading?.length !== 1 || heading[0].text !== "Alert Center") throw new Error("Expected a CivicEngage Alert Center");
  const page = new URL(pageUrl);
  return alerts.map((cells) => {
    const hasDate = cells[0]?.className.split(/\s+/).includes("date");
    const [link, ...paragraphs] = hasDate ? cells.slice(1) : cells;
    const url = link?.href && new URL(link.href, page);
    const text = paragraphs.map((paragraph) => paragraph.text).filter(Boolean).join(" ");
    if (!url || url.origin !== page.origin || url.pathname !== page.pathname || !url.searchParams.get("AID") ||
        !link.text) {
      throw new Error("Unexpected CivicEngage Alert Center card");
    }
    return { title: link.text, url: url.href, text, published: hasDate ? cells[0].text : null };
  });
}

/** Read the full text of a CivicEngage alert after identifying it in the live index. */
export async function civicPlusActiveAlertBody(input: Response | string, alert: { title: string; published: string | null }) {
  const card = ".singleAlert > .alert.on";
  const [cells, ...extra] = await extractHtmlGrid(input, {
    row: card, cell: `${card} > .date, ${card} > h3, ${card} > p`, spaceLineBreaks: true,
  });
  const [date, title, ...body] = cells ?? [];
  const text = body.map(({ text }) => text).filter(Boolean).join(" ");
  if (extra.length || date?.text !== alert.published || title?.text !== alert.title || !text) {
    throw new Error("CivicEngage alert details do not match the active listing");
  }
  return text;
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
