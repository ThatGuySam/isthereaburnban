import { z } from "zod";
import { extractHtmlGrid, htmlText } from "./html";
import { parseIsoTimestamp, parseUsDate } from "./dates";

/** Read the links and displayed publication dates in an Apptegy News index. */
export async function apptegyNews(input: Response | string) {
  const rows = await extractHtmlGrid(input, {
    row: "#news-list .page-container-item",
    cell: "#news-list .article-info .title a, #news-list .article-date",
  });
  if (!rows.length) throw new Error("Missing Apptegy news index");
  return rows.map(([link, published, ...extra]) => {
    const date = parseUsDate(published?.text ?? "");
    if (extra.length || !link?.text || !link.href || !/^\/article\/\d+\/?$/.test(link.href) || !date) {
      throw new Error("Unexpected Apptegy news card");
    }
    return { title: link.text, path: link.href, date };
  });
}

/** Read the published header and paragraphs of an Apptegy news article. */
export async function apptegyArticle(input: Response | string) {
  const rows = await extractHtmlGrid(input, {
    row: "#news-article .page-container-item",
    cell: "#news-article .article-info > h2, #news-article .article-info > p, #news-article .article-content p",
  });
  const [row] = rows;
  const [title, author, published, ...paragraphs] = row ?? [];
  const date = parseUsDate(published?.text ?? "");
  if (rows.length !== 1 || !title?.text || !author?.text || !date || !paragraphs.length) {
    throw new Error("Unexpected Apptegy news article");
  }
  return { title: title.text, author: author.text, date, paragraphs: paragraphs.map(({ text }) => text) };
}

const liveFeed = z.object({
  live_feeds: z.array(z.object({
    id: z.number().int().positive(),
    author_name: z.string().min(1),
    publishing_at: z.string(),
    status: z.string(),
  })).max(100),
  meta: z.object({ sections: z.array(z.object({ id: z.number().int().positive() })) }),
});

/** Read the public Thrillshare Live Feed JSON linked by Apptegy sites. */
export function apptegyLiveFeed(data: unknown, sectionId: number, now: Date) {
  const { live_feeds: entries, meta } = liveFeed.parse(data);
  if (!meta.sections.some(({ id }) => id === sectionId)) throw new Error("Unexpected Apptegy Live Feed section");
  const ids = new Set<number>();
  let previous = now.toISOString();
  return entries.map(({ id, author_name: author, publishing_at: rawDate, status }) => {
    const published = parseIsoTimestamp(rawDate);
    if (!published || published > previous || ids.has(id)) throw new Error("Unexpected Apptegy Live Feed chronology");
    ids.add(id);
    previous = published;
    return { id, author, published, text: htmlText(status) };
  });
}

const apptegyPageState = z.object({
  page: z.object({
    id: z.number().int().positive(),
    status: z.literal("published"),
    content: z.object({ structure: z.unknown() }),
  }),
});
const apptegyPageNode = z.object({
  id: z.string().optional(),
  nodes: z.array(z.unknown()).max(1000).optional(),
  content: z.object({ html: z.string().optional() }).optional(),
});

/** Read a published rich-text node from Apptegy's serialized page state without executing scripts. */
export function apptegyPageText(html: string, pageId: number, nodeId: string): string {
  const marker = 'window.clientWorkStateTemp = JSON.parse(';
  const start = html.indexOf(marker);
  const end = html.indexOf("</script>", start);
  if (start < 0 || end < 0) throw new Error("Missing Apptegy page state");
  const payload = /^("(?:[^"\\]|\\.)*")\)/.exec(html.slice(start + marker.length, end))?.[1];
  if (!payload) throw new Error("Invalid Apptegy page state");
  const encoded = z.string().parse(JSON.parse(payload));
  const { page } = apptegyPageState.parse(JSON.parse(encoded));
  if (page.id !== pageId) throw new Error("Unexpected Apptegy page identity");
  const pending = [page.content.structure];
  const matches: string[] = [];
  for (let i = 0; i < pending.length; i++) {
    const node = apptegyPageNode.parse(pending[i]);
    if (node.id === nodeId && node.content?.html) matches.push(htmlText(node.content.html));
    if (node.nodes) pending.push(...node.nodes);
  }
  if (matches.length !== 1 || !matches[0]) throw new Error("Missing or ambiguous Apptegy page text");
  return matches[0];
}
