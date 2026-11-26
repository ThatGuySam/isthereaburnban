import type { CountyStatus } from "../../../shared/types";
import { localClock, parseLocalDateTime, parseUsDate, reportWindow, US_ZONES } from "../lib/dates";
import { extractHtml, extractHtmlGrid } from "../lib/html";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";

const zone = US_ZONES.Arizona;
const archive = "https://www.mohave.gov/news-notices/?search_field=fire";
const meta = {
  id: "az-mohave-county-orders", state: "AZ", scope: "part", stack: "Umbraco / HTML county notices",
  sourceName: "Mohave County Emergency Management", sourceUrl: archive, officialUrl: archive,
} as const;
const day = 86_400_000;
const lifetime = 120 * day;

function noticeTime(value: string | undefined) {
  const dateTime = value?.match(/^(\d{1,2}:\d{2} [ap]\.m\.) on (.+)$/i);
  return dateTime ? parseLocalDateTime(`${dateTime[2]} ${dateTime[1]}`, zone) : null;
}

export async function parseMohaveOrders(input: Response | string, now: Date, readNotice: (url: string) => Promise<string>): Promise<CountyStatus[]> {
  const cards = await extractHtmlGrid(input, {
    row: ".gs-feed-list-news li.gs-feed-list-item",
    cell: "a.gs-feed-list-title, span.gs-feed-list-author > a, span.gs-feed-list-date",
  });
  if (!cards.length) throw new Error("Mohave County fire notice archive is missing");
  const today = localClock(now, zone).date;
  const notices = cards.flatMap(([link, author, stamp, ...extra]) => {
    if (!link?.href || !link.text || !author?.text || !stamp?.text || extra.length) {
      throw new Error("Mohave County notice archive changed");
    }
    if (author.text !== "Mohave County" || !/\b(?:fire restrictions|fire and fireworks prohibition)\b/i.test(link.text)) return [];
    const date = parseUsDate(stamp.text);
    const url = new URL(link.href, archive);
    if (!date || date > today || url.origin !== new URL(archive).origin || !url.pathname.startsWith("/news-notices/posts/")) {
      throw new Error("Mohave County fire notice has an invalid date or link");
    }
    return [{ title: link.text, date, url: url.href }];
  }).sort((left, right) => right.date.localeCompare(left.date));
  const [latest, previous] = notices;
  if (!latest) return [];
  if (latest.date === previous?.date) throw new Error("Ambiguous latest Mohave County fire notice");

  const { blocks } = await extractHtml(await readNotice(latest.url));
  const heading = blocks.find(({ tag }) => tag === "h1")?.text;
  if (!heading?.toLowerCase().startsWith(latest.title.toLowerCase())) throw new Error("Mohave County notice headline mismatch");
  const body = blocks.filter(({ tag }) => tag === "p").map(({ text }) => text).join(" ");
  if (/^County Outdoor Fire and Fireworks Prohibition Lifted$/i.test(latest.title)) {
    const determination = body.match(/issued a determination on (.+?), that a state of fire emergency no longer existed for elevations above 4200\s*ft located within the Hualapai Mountain Range/i)?.[1];
    const finalDay = determination && parseUsDate(determination);
    const effective = noticeTime(body.match(/for the unincorporated areas of the County, has been lifted effective (.+?\b\d{4})\.(?=\s|$)/i)?.[1]);
    if (!(finalDay && finalDay <= today) && !(effective && effective <= now.toISOString())) {
      throw new Error("Mohave County full lift is missing an explicit determination");
    }
    return [];
  }
  const partial = /^County Outdoor Fire and Fireworks Prohibition Partially Lifted$/i.test(latest.title);
  const issued = /^Fire Restrictions Implemented County-Wide in Response to Increased Wildfire Risk$/i.test(latest.title);
  const effectiveText = partial
    ? body.match(/lifted effective (.+?), except for elevations above 4,200 feet within the Hualapai Mountain Range, where the prohibition will remain in effect/i)?.[1]
    : body.match(/all four Fire Zones within the unincorporated areas of the county\. These restrictions take effect (.+?), and remain in place until/i)?.[1];
  const validFrom = noticeTime(effectiveText);
  if ((!partial && !issued) || !validFrom || !body.includes("Mohave County Ordinance 2013-04") ||
      (issued && !/prohibit all open fires, campfires/i.test(body))) {
    throw new Error("Mohave County fire order changed or is missing effective terms");
  }
  const nowIso = now.toISOString();
  if (validFrom > nowIso) return [];
  const window = reportWindow(validFrom, now, lifetime);
  if (!window) throw new Error("Mohave County fire order needs a newer update");
  return [{
    ...meta, fips: "04015", county: "Mohave County", sourceId: meta.id, officialUrl: latest.url, checked: nowIso,
    scopeNote: partial ? "Unincorporated Hualapai Mountain Range above 4,200 feet" : "All four fire zones in unincorporated Mohave County",
    status: "ban", label: "County outdoor fire prohibition",
    note: "Mohave County prohibits covered open fires and campfires in the affected area. The county notice lists exemptions and fireworks rules.",
    validFrom, validUntil: window.validUntil, since: localClock(new Date(validFrom), zone).date,
    sourceUpdated: latest.date, expires: null,
  }];
}

export const azMohaveOrders: ActiveSource = {
  ...meta, mode: "positive-only", coverage: "restrictions", keepRowLinks: true, reportingFips: ["04015"],
  cadence: { kind: "daily", zone, hours: [8, 16] }, pollGroup: "az-county-daily", staleMs: 1.5 * day,
  async fetch({ now }) {
    const read = pacedTextReader({ headers: { accept: "text/html" }, maxBytes: 500_000, maxResponseAgeMs: 1.5 * day });
    return { rows: await parseMohaveOrders(await read(archive), now, read) };
  },
};
