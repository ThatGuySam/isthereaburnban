import { decodeEntities, cleanText } from "./html";

// Inventory: Wisconsin DNR JSON/CSV, TX XML RSS, Iowa State Fire Marshal RSS/Atom,
// Maine class-day JSON, fiResponse and other public JSON. Feed shape never establishes jurisdiction.
export function parseJson<T>(text: string, accepts: (value: unknown) => value is T): T {
  const value: unknown = JSON.parse(text.replace(/^\ufeff/, ""));
  if (!accepts(value)) throw new Error("Unexpected JSON feed shape");
  return value;
}

/** Legacy .NET JSON dates carry UTC epoch milliseconds. The optional suffix describes the local offset. */
export function parseDotNetJsonDate(text: string): Date | null {
  const match = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(text);
  if (!match) return null;
  const date = new Date(Number(match[1]));
  return Number.isFinite(date.getTime()) ? date : null;
}

export function decodeFeed(bytes: ArrayBuffer, encoding?: string): string {
  const [first, second] = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  const bom = first === 0xff && second === 0xfe ? "utf-16le" : first === 0xfe && second === 0xff ? "utf-16be" : undefined;
  return new TextDecoder(bom ?? encoding ?? "utf-8").decode(bytes);
}

export function parseCsv(text: string, separator = ","): string[][] {
  if (separator.length !== 1 || /["\r\n]/.test(separator)) throw new Error("Invalid CSV separator");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += c;
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === separator || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== separator) {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (closed || c === '"') throw new Error("Invalid CSV quote");
    else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (row.length || cell || closed) rows.push([...row, cell]);
  return rows;
}

type FeedEntry = { id: string; title: string; url: string; published: string | null; text: string };
const unwrap = (s: string) => cleanText(decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")));
function feedField(xml: string, pattern: string): string {
  return unwrap(new RegExp(`<(?:${pattern})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:${pattern})>`, "i").exec(xml)?.[1] ?? "");
}

/** Narrow RSS/Atom reader for notice feeds. Treat content as untrusted text and validate dates downstream. */
export function parseFeed(xml: string): FeedEntry[] {
  if (!/<(?:rss|feed|rdf:RDF)\b/i.test(xml) || /<!DOCTYPE/i.test(xml)) throw new Error("Expected RSS or Atom");
  return Array.from(xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi), ([, kind, body]) => {
    const alternate = Array.from(body.matchAll(/<link\b([^>]+)>/gi), ([, attrs]) => attrs)
      .find((attrs) => /\bhref\s*=/i.test(attrs) && (!/\brel\s*=/i.test(attrs) || /\brel\s*=\s*["']alternate["']/i.test(attrs)));
    const url = kind.toLowerCase() === "entry"
      ? decodeEntities(/\bhref\s*=\s*(["'])(.*?)\1/i.exec(alternate ?? "")?.[2] ?? "")
      : feedField(body, "link");
    const stamp = feedField(body, "pubDate|published|updated|dc:date");
    const time = Date.parse(stamp);
    return {
      id: feedField(body, "guid|id") || url,
      title: feedField(body, "title"),
      url,
      published: Number.isFinite(time) ? new Date(time).toISOString() : null,
      text: feedField(body, "description|summary|content:encoded|content"),
    };
  });
}
