import type { CountyStatus } from "../../../shared/types";
import { atLocalTime, parseWeekdayDate, US_ZONES } from "../lib/dates";
import { blockAfterHeading, extractHtml } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://www.brunswickco.com/cms/One.aspx?pageId=10858888&portalId=10858880";
const SIX_HOURS = 6 * 60 * 60 * 1000;
const META = {
  id: "va-brunswick-burn-ban", state: "VA", scope: "county", stack: "CivicLive / public notices HTML",
  sourceName: "Brunswick County Public Notices", sourceUrl: URL, officialUrl: URL,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

const TITLE = "🔥 COUNTY-WIDE BURN BAN — BRUNSWICK COUNTY 🔥";
const ISSUE = /^Effective (.+), at 12:00 noon, a county-wide burn ban will be in effect for Brunswick County\. (.+)$/;
const DETAILS = "Dry conditions and wind can cause fires to spread quickly, putting homes, property, and lives at risk. " +
  "Please do your part to keep our community safe by following the burn ban and helping spread the word. " +
  "Thank you for helping protect our community and the first responders who serve you!";
const LIFT = /\b(?:no (?:county-wide )?burn ban (?:is )?in effect|burn ban (?:has been |is |was )?(?:lifted|rescinded|cancelled|canceled))\b/i;

export async function parseBrunswickNotices(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const { blocks } = await extractHtml(input);
  const notices = blockAfterHeading(blocks, /^PUBLIC NOTICES$/, { requireUnique: true, headingTag: "h2" });
  if (!notices.length) throw new Error("Brunswick County: expected one public notices panel");
  if (blocks.some(({ text }) => LIFT.test(text))) return [];

  const noticesWithTitle = notices.filter(({ tag, text }) => tag === "h3" && text === TITLE);
  if (!noticesWithTitle.length) return [];
  const notice = notices[notices.indexOf(noticesWithTitle[0]) + 1];
  const issue = notice?.tag === "p" && ISSUE.exec(notice.text);
  const since = issue && parseWeekdayDate(issue[1]);
  const validFrom = since && atLocalTime(since, 12 * 60, US_ZONES.Eastern);
  if (noticesWithTitle.length !== 1 || !issue || !since || !validFrom || issue[2] !== DETAILS) {
    throw new Error("Brunswick County: unrecognized burn ban terms or effective date");
  }
  return [{
    fips: "51025", county: "Brunswick County", state: META.state, status: "ban", scope: META.scope,
    label: "Countywide burn ban",
    note: "Brunswick County posts a countywide burn ban with no end date. See the county notice for updates.",
    sourceId: META.id, sourceName: META.sourceName, sourceUrl: URL, officialUrl: URL,
    checked: now.toISOString(), sourceUpdated: null, since, expires: null, validFrom,
  }];
}

export const vaBrunswickBurnBan: ActiveSource = {
  ...META, mode: "positive-only", coverage: "live", cadence: { kind: "hourly" }, staleMs: SIX_HOURS,
  async fetch({ now }) {
    const reply = await fetchSource(URL, {
      headers: { accept: "text/html" }, maxBytes: 384_000, maxResponseAgeMs: SIX_HOURS,
    });
    if (reply.notModified) throw new Error("Unexpected Brunswick public notices 304");
    return { rows: await parseBrunswickNotices(reply.response, now) };
  },
};
