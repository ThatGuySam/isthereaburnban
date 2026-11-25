import type { CountyStatus } from "../../../shared/types";
import { apptegyArticle, apptegyNews } from "../lib/apptegy";
import { localClock, localDayWindow, parseWeekdayDate, US_ZONES } from "../lib/dates";
import { pacedSourceReader } from "../lib/http";
import type { ActiveSource } from "../types";

const NEWS = "https://www.gatlinburgtn.gov/news";
const ZONE = US_ZONES.Eastern;
const META = {
  id: "tn-gatlinburg-permit-notices", state: "TN", scope: "part", stack: "Apptegy News / HTML",
  sourceName: "Gatlinburg Fire Department", sourceUrl: NEWS, officialUrl: NEWS,
} as const;

const SUSPENSION = /^(?:GFD|Gatlinburg Fire Department) (?:suspends burn permits|(?:is )?not issuing burn permits)\b/i;
const LIFT = /^(?:GFD|Gatlinburg Fire Department) (?:lifts (?:the )?burn ban|resumes issuing burn permits|resumes burn permits)\b/i;
const END_DAY = /\bthrough (?:at least )?((?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),? [A-Za-z]+ \d{1,2})(?:, (\d{4}))?\b/i;

export async function latestGatlinburgNotice(input: Response | string, now: Date) {
  const today = localClock(now, ZONE).date;
  return (await apptegyNews(input))
    .filter(({ date, title }) => date <= today && (SUSPENSION.test(title) || LIFT.test(title)))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

export async function parseGatlinburgPermitNotice(
  input: Response | string,
  notice: NonNullable<Awaited<ReturnType<typeof latestGatlinburgNotice>>>,
  now: Date,
): Promise<CountyStatus[]> {
  const article = await apptegyArticle(input);
  if (article.date !== notice.date || article.title !== notice.title || article.author !== "City of Gatlinburg") {
    throw new Error("Gatlinburg: the article differs from the published notice");
  }
  if (!SUSPENSION.test(article.title)) return [];
  const summary = article.paragraphs[0];
  if (!/\bburn permits will not be issued by the Gatlinburg Fire Department\b/i.test(summary)) return [];
  const end = END_DAY.exec(summary);
  if (!end) return [];
  // Cross the year boundary only when a January deadline follows December publication.
  const year = Number(notice.date.slice(0, 4)) + Number(notice.date.slice(5, 7) === "12" && /\bJanuary\b/i.test(end[1]));
  const expires = parseWeekdayDate(end[2] ? `${end[1]}, ${end[2]}` : end[1], year);
  if (!expires || expires < notice.date) throw new Error("Gatlinburg: invalid deadline in permit notice");
  const checked = now.toISOString();
  const { validFrom } = localDayWindow(article.date, ZONE);
  const { validUntil } = localDayWindow(expires, ZONE);
  if (validUntil <= checked || validFrom > checked) return [];
  return [{
    fips: "47155", county: "Sevier County", state: META.state, status: "restricted", scope: META.scope,
    label: "Gatlinburg temporarily suspends burn permits", scopeNote: "City of Gatlinburg burn permit program",
    note: "The fire department paused burn permits due to fire danger. The displayed end is the last day explicitly covered by the notice. Check with the fire department for extensions.",
    checked, sourceUpdated: article.date, since: article.date, expires, validFrom, validUntil,
    sourceId: META.id, sourceName: META.sourceName, sourceUrl: NEWS, officialUrl: new URL(notice.path, NEWS).href,
  }];
}

export const tnGatlinburgPermitNotices: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", keepRowLinks: true,
  cadence: { kind: "daily", zone: ZONE, hours: [8, 12, 16] },
  async fetch({ now }) {
    const read = pacedSourceReader({ headers: { accept: "text/html" }, maxBytes: 2_000_000 });
    const newsroom = await read(NEWS);
    if (newsroom.notModified) throw new Error("Unexpected Gatlinburg news index 304");
    const notice = await latestGatlinburgNotice(newsroom.response, now);
    if (!notice || LIFT.test(notice.title)) return { rows: [] };
    const article = await read(new URL(notice.path, NEWS).href);
    if (article.notModified) throw new Error("Unexpected Gatlinburg news article 304");
    return { rows: await parseGatlinburgPermitNotice(article.response, notice, now) };
  },
};
