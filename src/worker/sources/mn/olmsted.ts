import type { CountyStatus } from "../../../shared/types";
import { atLocalTime, localClock, parseLocalDateTime, parseUsDate, shiftDay, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";

const META = {
  id: "mn-olmsted-sheriff-orders", state: "MN", scope: "county",
  stack: "Drupal / sheriff's news archive",
  sourceName: "Olmsted County Sheriff's Office",
  sourceUrl: "https://www.olmstedcounty.gov/government/county-departments/sheriffs-office/sheriffs-office-news",
  officialUrl: "https://www.olmstedcounty.gov/government/county-departments/sheriffs-office/sheriffs-office-news",
} as const;
const ZONE = US_ZONES.Central;
const FIPS = "27109";
// The archive is a notice channel. Require recent evidence for an open-ended order.
const NOTICE_DAYS = 30;
const TITLE = ".page-content > .node-header h1.title";
type Notice = { title: string; day: string; url: string };
type Event = { action: "issue"; notice: Notice } | { action: "lift"; notice: Notice; effective: string };

async function noticesIn(input: Response | string, now: Date): Promise<Notice[]> {
  const card = ".page-content article.node--teaser";
  const [heading, ...cards] = await extractHtmlGrid(input, {
    row: `.page-content > .node-header, ${card}`,
    cell: `${TITLE}, a.redirect[rel=bookmark], .node-metadata > li.authored-on`,
  });
  if (heading?.length !== 1 || heading[0].text !== "Sheriff's Office News" || !cards.length) {
    throw new Error("Olmsted: expected the Sheriff's Office News archive");
  }
  const base = new URL(META.sourceUrl);
  const { date } = localClock(now, ZONE);
  const firstDay = shiftDay(date, -NOTICE_DAYS + 1);
  const notices = new Map<string, Notice>();
  for (const [link, stamp, ...extra] of cards) {
    if (!link || !/\b(?:burn(?:ing)? bans?|open burn(?:ing)? restrictions?)\b/i.test(link.text)) continue;
    const day = parseUsDate(stamp?.text ?? "");
    if (extra.length || !link.href || !day) throw new Error("Olmsted: undated or malformed burning notice");
    if (day < firstDay || day > date) continue;
    const url = new URL(link.href, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname + "/") || url.search || url.hash ||
        notices.has(url.href)) throw new Error("Olmsted: unexpected burning notice link");
    notices.set(url.href, { title: link.text, day, url: url.href });
  }
  return [...notices.values()];
}

async function readNotice(input: Response | string, notice: Notice): Promise<Event> {
  const body = ".page-content > .node-content";
  const [heading, content, ...extra] = await extractHtmlGrid(input, {
    row: `.page-content > .node-header, ${body}`,
    cell: `${TITLE}, ${body} > ul > li.authored-on, ${body} > h4, ${body} > p, ${body} > ul > li:not(.authored-on)`,
    spaceLineBreaks: true,
  });
  const [stamp, ...text] = content ?? [];
  if (extra.length || heading?.length !== 1 || heading[0].text !== notice.title ||
      !stamp || parseUsDate(stamp.text) !== notice.day) throw new Error("Olmsted: archive and notice disagree");

  const lead = text[0]?.text ?? "";
  const lift = /\bhas (?:removed|lifted) the burn ban in Olmsted County at (\d{1,2}:\d{2}\s+[ap]\.?m\.?) on ([^.!?]+, \d{4})\./i.exec(lead);
  if (lift && /\bOlmsted County Sheriff\b/i.test(lead)) {
    const effective = parseLocalDateTime(`${lift[2]} ${lift[1]}`, ZONE);
    if (effective && localClock(new Date(effective), ZONE).date >= notice.day) return { action: "lift", notice, effective };
  }
  if (/\bOlmsted County Sheriff\b.*\bhas issued a burn ban for all of Olmsted County\b/i.test(lead) &&
      /\bthe burn ban takes effect immediately and will remain in effect until further notice\b/i.test(lead) &&
      text.some(({ text }) => /^no open burning\.?$/i.test(text)) &&
      text.some(({ text }) => /^no recreational fires\.?$/i.test(text))) {
    return { action: "issue", notice };
  }
  throw new Error("Olmsted: unrecognized issuing authority, scope or effective dates");
}

export async function parseOlmstedOrders(
  input: Response | string, now: Date, read: (url: string) => Promise<Response | string>,
): Promise<CountyStatus[]> {
  const notices = await noticesIn(input, now);
  if (notices.length > 6) throw new Error("Olmsted: too many recent burning notices to verify");
  const events: Event[] = [];
  for (const notice of notices) events.push(await readNotice(await read(notice.url), notice));
  const issue = events.filter(({ action }) => action === "issue").sort((a, b) => b.notice.day.localeCompare(a.notice.day))[0];
  if (!issue) return [];

  const lift = events.flatMap((event) =>
    event.action === "lift" && event.notice.day >= issue.notice.day ? [event.effective] : []).sort()[0];
  const checked = now.toISOString();
  if (lift && lift <= checked) return [];
  const reviewEnd = atLocalTime(shiftDay(issue.notice.day, NOTICE_DAYS), 0, ZONE);
  if (!reviewEnd || reviewEnd <= checked) return [];
  const validUntil = lift && lift < reviewEnd ? lift : reviewEnd;
  return [{
    fips: FIPS, county: "Olmsted County", state: META.state, scope: META.scope,
    status: "ban", label: "Olmsted County burn ban",
    note: "The sheriff's order prohibits open burning, including recreational fires and campfires. Consult the sheriff for updates.",
    sourceId: META.id, sourceName: META.sourceName, sourceUrl: META.sourceUrl,
    officialUrl: issue.notice.url, checked, since: issue.notice.day, expires: null, sourceUpdated: null, validUntil,
  }];
}

export const mnOlmstedOrders: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", keepRowLinks: true,
  reportingFips: [FIPS], cadence: { kind: "hourly" }, staleMs: 6 * 60 * 60 * 1000,
  async fetch({ now }) {
    const read = pacedTextReader({ headers: { accept: "text/html" } });
    return { rows: await parseOlmstedOrders(await read(META.sourceUrl), now, read) };
  },
};
