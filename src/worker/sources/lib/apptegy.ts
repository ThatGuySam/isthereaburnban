import { extractHtmlGrid } from "./html";
import { parseUsDate } from "./dates";

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
