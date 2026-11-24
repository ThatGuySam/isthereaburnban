import type { CountyStatus } from "../../../shared/types";
import { countiesInState, countyByName, type County } from "../../counties";
import { localClock, localDayWindow, parseLocalDateTime, parseUsDate, parseWeekdayDate, shiftDay, US_ZONES } from "../lib/dates";
import { extractHtml, extractHtmlGrid, type HtmlParts } from "../lib/html";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";

const NEWSROOM = "https://www.ncagr.gov/divisions/nc-forest-service/newsroom";
const META = {
  id: "nc-forest-service-orders", state: "NC", scope: "part", stack: "Drupal / HTML notices",
  sourceName: "N.C. Forest Service", sourceUrl: NEWSROOM, officialUrl: NEWSROOM,
} as const;
const ZONE = US_ZONES.Eastern;
const COUNTIES = countiesInState(META.state);
const LOOKBACK_DAYS = 60;
const MAX_PAGES = 4;

type Listing = { title: string; url: string; published: string };
type Order = Listing & { kind: "issue" | "lift"; effective: string; counties: County[] };

export async function parseNcNewsroom(html: string, today: string): Promise<Listing[]> {
  const rows = await extractHtmlGrid(html, {
    row: ".press-release-view .views-row",
    cell: ".views-field-title a, .views-field-field-release-date time",
  });
  if (!rows.length) throw new Error("NC Forest Service: missing newsroom list");
  let previous = today;
  return rows.map((row) => {
    const [link, date] = row;
    const path = link?.href?.match(/^\/news\/press-releases\/(\d{4})\/(\d{2})\/(\d{2})\/[a-z0-9-]+$/);
    const published = date && parseWeekdayDate(date.text.split(" at ")[0]);
    if (row.length !== 2 || !link.text || !path || !published ||
        path.slice(1).join("-") !== published || published > previous) {
      throw new Error("NC Forest Service: unexpected newsroom title, link or date");
    }
    previous = published;
    return { title: link.text, url: new URL(path[0], NEWSROOM).href, published };
  });
}

export function ncNoticeKind(title: string): Order["kind"] | undefined {
  if (!/\b(?:burn ban|(?:open |outdoor )?burning ban|ban on (?:open|outdoor) burning)\b/i.test(title)) return;
  if (/\b(?:lifted|rescinded)\b/i.test(title)) return "lift";
  if (/\b(?:issued|expanded|imposed)\b/i.test(title.replace(/\bstate[- ]issued\b/gi, ""))) return "issue";
  if (/\b(?:remains? in effect|to continue)\b/i.test(title)) return;
  throw new Error(`NC Forest Service: unrecognized burn-ban announcement: ${title}`);
}

function listedCounties(raw: string, url: string): County[] {
  const counties = raw.trim().replace(/,?\s+and\s+/g, ", ").split(/,\s*/).map((name) => countyByName(META.state, name));
  if (counties.some((county) => !county) || new Set(counties).size !== counties.length) {
    throw new Error(`NC Forest Service: unrecognized or duplicate county in ${url}`);
  }
  return counties.filter((county) => county !== undefined);
}

function effectiveTime(text: string, published: string): string | null {
  const match = /\b(?:effective(?: at)?|(?:goes|will go) into effect at)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.)|noon|midnight)\s*,?\s+(?:(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(today|[A-Za-z]{3,9}\.?\s+\d{1,2}(?:,\s*\d{4})?)(?!\d)/i.exec(text);
  if (!match) return null;
  const [, rawTime, weekday, rawDay] = match;
  const latest = shiftDay(published, 7);
  const clock = rawTime.toLowerCase().replace("noon", "12 p.m.").replace("midnight", "12 a.m.");
  for (const year of new Set([+published.slice(0, 4), +latest.slice(0, 4)])) {
    const day = /^today$/i.test(rawDay) ? published : parseUsDate(rawDay, year);
    if (!day || day < published || day > latest || (weekday && parseWeekdayDate(`${weekday}, ${day}`) !== day)) continue;
    return parseLocalDateTime(`${day} ${clock}`, ZONE);
  }
  return null;
}

export function parseNcOrder({ blocks }: HtmlParts, listing: Listing): Order {
  const { title, published, url } = listing;
  const kind = ncNoticeKind(title);
  const fail = () => new Error(`NC Forest Service: unrecognized order date, scope or county list in ${url}`);
  const heading = blocks.findIndex(({ tag, text }) => tag === "h1" && text === title);
  if (!kind || heading < 0) throw fail();
  const paragraphs = blocks.slice(heading + 1).filter(({ tag }) => tag === "p").map(({ text }) => text);
  const expectedCount = /\b(\d{1,3}) (?:[\w-]+ ){0,4}count(?:y|ies)\b/i.exec(title)?.[1];
  const opening = paragraphs.slice(0, 3).join(" ");
  const effective = effectiveTime(opening, published);
  if (!effective) throw fail();
  let counties: County[];
  if (kind === "issue") {
    const issue = /\bForest Service has issued a (?:second )?ban on all open burning and has cancell?ed all burning permits (statewide\b|for (?:the following North Carolina counties:\s*)?([^.]+))/i.exec(opening);
    if (!issue || !/\buntil further notice\b/i.test(opening) ||
        !paragraphs.some((text) => /\bdoes not apply to (?:fires started|a fire) within (?:those )?100 feet of an occupied dwelling/i.test(text))) {
      throw fail();
    }
    if (!issue[2]) counties = COUNTIES;
    else {
      const list = issue[2].split(/,?\s+until further notice|\s+effective\b/i)[0].replace(/\s+count(?:y|ies)\s*$/i, "");
      counties = listedCounties(list, url);
    }
  } else {
    if (!/\bForest Service has lifted a ban on all open burning\b/i.test(opening)) throw fail();
    const remaining = /\bban remains in effect for (.+?) count(?:y|ies) until further notice\b/i.exec(opening)?.[1];
    const named = /\bfor the following counties(?: in North Carolina)?:\s*([^.;]+)[.;]/i.exec(opening)?.[1]
      ?? /\bhas lifted a ban on all open burning for ([A-Z][^.]+?) count(?:y|ies)\./.exec(opening)?.[1];
    if (remaining) {
      const kept = new Set(listedCounties(remaining, url).map(({ fips }) => fips));
      counties = COUNTIES.filter(({ fips }) => !kept.has(fips));
    } else if (named && !/^(?:all |\d)/i.test(named)) counties = listedCounties(named, url);
    else if (/\bhas lifted a ban on all open burning (?:statewide|(?:for|in) all (?:100 |North Carolina )?counties)\b/i.test(opening)) counties = COUNTIES;
    else throw fail();
  }
  if (!counties.length || (expectedCount && counties.length !== +expectedCount)) throw fail();
  return { ...listing, kind, effective, counties };
}

export function applyNcOrders(orders: Order[], now: Date): CountyStatus[] {
  const { date: today } = localClock(now, ZONE);
  const cutoff = shiftDay(today, -LOOKBACK_DAYS);
  const checked = now.toISOString();
  const open = new Map<string, CountyStatus & { validFrom: string; validUntil: string }>();
  const rows: CountyStatus[] = [];
  const sorted = orders.filter(({ published }) => published > cutoff && published <= today)
    .sort((a, b) => a.effective.localeCompare(b.effective) || a.published.localeCompare(b.published));
  for (const order of sorted) {
    const until = localDayWindow(shiftDay(order.published, LOOKBACK_DAYS), ZONE).validFrom;
    const since = localClock(new Date(order.effective), ZONE).date;
    for (const { fips, name } of order.counties) {
      const current = open.get(fips);
      if (current) {
        const validUntil = order.effective < current.validUntil ? order.effective : current.validUntil;
        if (validUntil > checked && validUntil > current.validFrom) rows.push({ ...current, validUntil });
        open.delete(fips);
      }
      if (order.kind === "issue") {
        open.set(fips, {
          fips, county: name, state: META.state, sourceId: META.id, status: "ban",
          scope: META.scope, scopeNote: "State Forest Service order beyond 100 feet of occupied dwellings",
          label: "N.C. Forest Service open-burning ban",
          note: "The state order bans covered open burning and cancels permits in the affected area. Ask your local fire marshal about fires within 100 feet of an occupied dwelling.",
          sourceName: META.sourceName, sourceUrl: order.url, officialUrl: order.url,
          checked, sourceUpdated: order.published, since, expires: null,
          validFrom: order.effective, validUntil: until,
        });
      }
    }
  }
  return rows.concat([...open.values()]);
}

export const ncForestOrders: ActiveSource = {
  ...META, keepRowLinks: true, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: ZONE, hours: [0, 4, 8, 12, 16, 20] },
  staleMs: 8 * 60 * 60 * 1000,
  async fetch({ now }) {
    const read = pacedTextReader({ headers: { accept: "text/html" } });
    const { date: today } = localClock(now, ZONE);
    const cutoff = shiftDay(today, -LOOKBACK_DAYS);
    const notices = new Map<string, Listing>();
    let oldest = today;
    for (let page = 0; page < MAX_PAGES && oldest > cutoff; page++) {
      const url = page ? `${NEWSROOM}?page=${page}` : NEWSROOM;
      const listings = await parseNcNewsroom(await read(url), oldest);
      for (const listing of listings) {
        if (notices.has(listing.url)) throw new Error("NC Forest Service: duplicate newsroom item");
        notices.set(listing.url, listing);
      }
      oldest = listings[listings.length - 1].published;
    }
    if (oldest > cutoff) throw new Error("NC Forest Service: newsroom did not reach the order lookback");
    const orders: Order[] = [];
    for (const listing of notices.values()) {
      if (listing.published <= cutoff || !ncNoticeKind(listing.title)) continue;
      orders.push(parseNcOrder(await extractHtml(await read(listing.url)), listing));
    }
    return { rows: applyNcOrders(orders, now) };
  },
};
