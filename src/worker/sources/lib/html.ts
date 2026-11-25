// Inventory shapes HTML table and HTML text/list across Sitecore, Drupal, WordPress, SharePoint,
// CivicPlus, Granicus, WebForms and PHP. Publishers still supply the selectors and interpretation.
import { sha256 } from "./hash";

export { atLocalTime, localClock, parseEndDate, parseLocalDateTime, parseUsDate, US_ZONES } from "./dates";

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", sect: "§",
  ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (entity, code: string) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? entity;
    const n = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : +code.slice(1);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "�";
  });
}

export const cleanText = (text: string) => text.replace(/[\s\u200b\ufeff]+/g, " ").trim();

export function attributes(raw: string): Record<string, string> {
  const found: Record<string, string> = Object.create(null);
  const pairs = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=`<>]+)))?/g;
  for (const [, key, double, single, bare] of raw.matchAll(pairs)) {
    found[key.toLowerCase()] ??= decodeEntities(double ?? single ?? bare ?? "");
  }
  return found;
}

export type Table = { heading: string; id?: string; rows: string[][] };
export type Block = { tag: string; text: string; links?: Link[] };
export type Link = { href: string; text: string };
export type HtmlParts = { blocks: Block[]; tables: Table[]; links: Link[] };

/** Require one identified table with the expected heading and nonempty, fixed-width rows. */
export function statusTableRows(parts: HtmlParts, { id, heading, columns }: {
  id: string; heading: string; columns: readonly string[];
}): string[][] {
  const [table, ...duplicates] = parts.tables.filter((entry) => entry.id === id);
  const [header, ...rows] = table?.rows ?? [];
  if (duplicates.length || table?.heading !== heading ||
      header?.length !== columns.length || columns.some((column, index) => header[index] !== column) ||
      !rows.length || rows.some((row) => row.length !== columns.length || row.some((cell) => !cell))) {
    throw new Error(`Missing or changed HTML status table: ${id}`);
  }
  return rows;
}

const HEAD = /^h[1-6]$/;
const BLOCK = /^(?:h[1-6]|p|li|dt|dd|blockquote|figcaption)$/;
const IGNORED = /^(?:script|style|template|noscript)$/;
const HTML_TAG = "h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,figcaption,table,tr,th,td,br,a,script,style,template,noscript";
type ActiveTable = { table: Table; row?: string[]; cell?: string };

type HtmlOptions = {
  links?: boolean;
  /** Keep links with their enclosing text blocks so callers can restrict them to a section. */
  blockLinks?: boolean;
  tableHeading?: (block: Block) => boolean;
};

function collector({ links: includeLinks = false, blockLinks = false, tableHeading }: HtmlOptions) {
  const parts: HtmlParts = { blocks: [], tables: [], links: [] };
  const tables: ActiveTable[] = [];
  const blocks: Block[] = [];
  let link: Link | undefined;
  let heading = "";
  let ignored = 0;

  function finishCell(table: ActiveTable) {
    if (table.cell !== undefined) table.row?.push(cleanText(table.cell));
    table.cell = undefined;
  }
  function finishRow(table: ActiveTable) {
    finishCell(table);
    if (table.row?.some(Boolean)) table.table.rows.push(table.row);
    table.row = undefined;
  }
  function finishBlock() {
    const block = blocks.pop()!;
    block.text = cleanText(block.text);
    if (block.text && (HEAD.test(block.tag) || tableHeading?.(block))) heading = block.text;
  }
  function finishLink() {
    if (link) {
      link.text = cleanText(link.text);
      if (includeLinks) parts.links.push(link);
      link = undefined;
    }
  }
  function text(value: string) {
    if (ignored) return;
    for (const block of blocks) block.text += value;
    const current = tables.at(-1);
    if (current?.cell !== undefined) current.cell += value;
    if (link) link.text += value;
  }

  return {
    parts,
    capturesText: () => !ignored && (blocks.length > 0 || tables.at(-1)?.cell !== undefined || link !== undefined),
    open(tag: string, get: (key: string) => string | null | undefined) {
      if (IGNORED.test(tag)) ignored++;
      if (ignored) return;
      if (BLOCK.test(tag)) {
        // Paragraph and list-item end tags can be omitted in older publisher pages.
        if (blocks.at(-1)?.tag === tag || blocks.at(-1)?.tag === "p") finishBlock();
        const block = { tag, text: "" };
        blocks.push(block);
        parts.blocks.push(block);
      }
      if (tag === "a" && (includeLinks || blockLinks)) {
        finishLink();
        const href = get("href");
        if (href) {
          link = { href, text: "" };
          if (blockLinks) for (const block of blocks) (block.links ??= []).push(link);
        }
      }
      if (tag === "br") text(" ");
      if (tag === "table") {
        const table = { heading, id: get("id") ?? undefined, rows: [] };
        tables.push({ table });
        parts.tables.push(table);
      }
      const current = tables.at(-1);
      if (tag === "p" && current?.cell !== undefined) current.cell += " ";
      if (current && tag === "tr") {
        finishRow(current);
        current.row = [];
      }
      if (current && (tag === "th" || tag === "td")) {
        finishCell(current);
        current.row ??= [];
        current.cell = "";
      }
    },
    close(tag: string) {
      if (IGNORED.test(tag)) ignored = Math.max(0, ignored - 1);
      if (ignored) return;
      const index = blocks.findLastIndex((block) => block.tag === tag);
      if (index !== -1) while (blocks.length > index) finishBlock();
      if (tag === "a") finishLink();
      const current = tables.at(-1);
      if (!current) return;
      if (tag === "td" || tag === "th") finishCell(current);
      if (tag === "tr" || tag === "table") finishRow(current);
      if (tag === "table") tables.pop();
    },
    text,
    finish() {
      while (blocks.length) finishBlock();
      while (tables.length) finishRow(tables.pop()!);
      finishLink();
      parts.blocks = parts.blocks.filter(({ text }) => text);
      return parts;
    },
  };
}

/** Small fallback for fixtures and scripts. Supports quoted attributes and optional table end tags. */
export function parseHtml(html: string, options: HtmlOptions = {}): HtmlParts {
  const out = collector(options);
  const tokens = /<!--[\s\S]*?(?:-->|$)|<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>|<(\/?)([a-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|[^<]+|</gi;
  for (const [token, ignored, close, rawTag, rawAttrs] of html.matchAll(tokens)) {
    if (ignored || token.startsWith("<!--")) continue;
    if (!rawTag) {
      if (!token.startsWith("<!")) out.text(decodeEntities(token));
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (close) out.close(tag);
    else {
      let attrs: Record<string, string> | undefined;
      out.open(tag, (key) => (attrs ??= attributes(rawAttrs))[key]);
    }
  }
  return out.finish();
}

/** Stream the publisher response through Workers HTMLRewriter. Tests can call parseHtml directly. */
export async function extractHtml(input: Response | string, options: HtmlOptions = {}): Promise<HtmlParts> {
  if (typeof HTMLRewriter === "undefined") return parseHtml(typeof input === "string" ? input : await input.text(), options);
  const out = collector(options);
  const rewriter = new HTMLRewriter()
    .on(HTML_TAG, {
      element(element) {
        const tag = element.tagName;
        out.open(tag, (key) => {
          const value = element.getAttribute(key);
          return value === null ? null : decodeEntities(value);
        });
        if (tag !== "br") element.onEndTag(() => out.close(tag));
      },
    })
    .onDocument({
      text(chunk) {
        if (!out.capturesText()) return;
        // Text chunks can split an entity. Decode the completed text-node run.
        pending += chunk.text;
        if (chunk.lastInTextNode) {
          out.text(decodeEntities(pending));
          pending = "";
        }
      },
    });
  let pending = "";
  const response = rewriter.transform(typeof input === "string" ? new Response(input) : input);
  if (response.body) await response.body.pipeTo(new WritableStream({ write() {} }));
  return out.finish();
}

/** Read CSS-selected status cells. Legacy portals can publish a direct URL outside the href. */
export async function extractHtmlGrid(input: Response | string, selectors: {
  row: string; cell: string; linkAttribute?: string; spaceLineBreaks?: boolean;
}) {
  const rows: { text: string; className: string; href?: string }[][] = [];
  let row: (typeof rows)[number] | undefined;
  let cell: (typeof rows)[number][number] | undefined;
  const rewriter = new HTMLRewriter()
    .on(selectors.row, {
      element(element) {
        if (row) throw new Error("Nested status grid rows");
        row = [];
        rows.push(row);
        element.onEndTag(() => { row = undefined; });
      },
    })
    .on(selectors.cell, {
      element(element) {
        if (!row) return;
        if (cell) throw new Error("Nested status grid cells");
        cell = { text: "", className: element.getAttribute("class") ?? "" };
        const href = element.tagName === "a" ? element.getAttribute(selectors.linkAttribute ?? "href") : null;
        if (href) cell.href = decodeEntities(href);
        row.push(cell);
        element.onEndTag(() => {
          if (cell) cell.text = cleanText(decodeEntities(cell.text));
          cell = undefined;
        });
      },
      text(chunk) {
        if (cell) cell.text += chunk.text;
      },
    });
  if (selectors.spaceLineBreaks) rewriter.on("br", { element() { if (cell) cell.text += " "; } });
  const response = rewriter.transform(typeof input === "string" ? new Response(input) : input);
  if (response.body) await response.body.pipeTo(new WritableStream({ write() {} }));
  if (row || cell) throw new Error("Incomplete status grid");
  return rows;
}

export function blockAfterHeading(
  blocks: Block[], pattern: RegExp,
  { requireUnique = false, headingTag }: { requireUnique?: boolean; headingTag?: `h${1 | 2 | 3 | 4 | 5 | 6}` } = {},
): Block[] {
  const match = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
  const isHeading = ({ tag, text }: Block) => (headingTag ? tag === headingTag : HEAD.test(tag)) && match.test(text);
  const start = blocks.findIndex(isHeading);
  if (start < 0 || (requireUnique && blocks.findLastIndex(isHeading) !== start)) return [];
  const end = blocks.findIndex(({ tag }, index) => index > start && HEAD.test(tag) && tag <= blocks[start].tag);
  return blocks.slice(start + 1, end < 0 ? undefined : end);
}

/** Read a panel without semantic headings. A missing panel is distinct from a partial or duplicate match. */
export function blocksBetweenMarkers(
  blocks: readonly Block[],
  { start, end }: { start: (block: Block) => boolean; end: (block: Block) => boolean },
): Block[] | undefined {
  const first = blocks.findIndex(start);
  const last = blocks.findIndex(end);
  if (first < 0 && last < 0) return;
  if (first < 0 || last <= first || blocks.findLastIndex(start) !== first || blocks.findLastIndex(end) !== last) {
    throw new Error("Missing, out-of-order or duplicate HTML panel markers");
  }
  return blocks.slice(first + 1, last);
}

/** Verify the normalized text under a unique heading, outside surrounding navigation. */
export async function matchesReviewedHtmlSection(blocks: Block[], heading: RegExp, fingerprint: string): Promise<boolean> {
  const section = blockAfterHeading(blocks, heading, { requireUnique: true });
  return section.length > 0 && await sha256(section.map(({ text }) => text).join("\n")) === fingerprint;
}

/** Fingerprint one reviewed rule region so changed wording requires a fresh review. */
export async function reviewedHtmlDigest(input: Response | string, selector: string, startsWith = ""): Promise<string> {
  const regions: string[] = [];
  let text: string | undefined;
  const rewriter = new HTMLRewriter()
    .on("script, style, template, noscript", { element(element) { element.remove(); } })
    .on(selector, {
      element(element) {
        if (text !== undefined) throw new Error("Nested reviewed HTML rule regions");
        text = "";
        element.onEndTag(() => {
          const normalized = cleanText(decodeEntities(text ?? ""));
          if (normalized && normalized.startsWith(startsWith)) regions.push(normalized);
          text = undefined;
        });
      },
      text(chunk) { if (text !== undefined) text += chunk.text; },
    });
  const response = rewriter.transform(typeof input === "string" ? new Response(input) : input);
  if (response.body) await response.body.pipeTo(new WritableStream({ write() {} }));
  if (regions.length !== 1 || text !== undefined) throw new Error("Expected one reviewed HTML rule region");
  return sha256(regions[0]);
}

/** Read a numbered section whose heading is published as a paragraph. */
export function numberedRuleSection(
  { blocks }: HtmlParts, section: string, { compact = false } = {},
): string[] {
  if (!/^\d+(?:\.\d+)+$/.test(section)) throw new Error("Invalid rule section number");
  const chapter = section.slice(0, section.lastIndexOf(".")).replaceAll(".", "\\.");
  const title = compact ? "\\s*[A-Z]" : "\\s+[A-Z][A-Z0-9 ;()/–-]+:";
  const heading = new RegExp(`^${chapter}\\.\\d+${title}`);
  const target = new RegExp(`^${section.replaceAll(".", "\\.")}${title}`);
  const paragraphs = blocks.filter(({ tag }) => tag === "p").map(({ text }) => text);
  const matches = (text: string) => target.test(text);
  const start = paragraphs.findIndex(matches);
  if (start < 0 || paragraphs.findLastIndex(matches) !== start) return [];
  const end = paragraphs.findIndex((text, index) => index > start && heading.test(text));
  return end > start ? paragraphs.slice(start, end) : [];
}

/** Plain text for publisher-provided HTML fragments such as REST titles and notice bodies. */
export function htmlText(html: string): string {
  const visible = html.replace(/<!--[\s\S]*?-->|<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const spaced = visible.replace(/<\/?(?:br|p|div|h[1-6]|li|td|th|tr)\b[^>]*>/gi, " ");
  return cleanText(decodeEntities(spaced.replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, "")));
}
