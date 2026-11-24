import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { localClock, parseUsDate } from "../lib/dates";
import { blockAfterHeading, extractHtml, matchesReviewedHtmlSection } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.NE;
const COUNTIES = countiesInState(RULE.state);
const META = {
  id: "ne-open-burning-law", state: RULE.state, scope: RULE.scope,
  stack: "Nebraska Legislature PHP / HTML and calendar", sourceName: "Nebraska Legislature (Neb. Rev. Stat. § 81-520.01)",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
};
const REVISION = "2026-07-18";
const REVIEWED_TEXT = "a34e94c5ccf591db499303c590c05beebfcea1693e335979d34c591e4ce3c857";

export async function parseNeOpenBurning(input: Response | string, now: Date) {
  const { blocks } = await extractHtml(input);
  const sectionNumbers = blocks.filter(({ tag, text }) => tag === "h2" && text === "81-520.01.");
  const [effective, ...otherDates] = blockAfterHeading(blocks, /^Source$/, { requireUnique: true })
    .filter(({ tag, text }) => tag === "li" && text.startsWith("Effective Date: "));
  if (sectionNumbers.length !== 1 || !effective || otherDates.length ||
      parseUsDate(effective.text.slice("Effective Date: ".length)) !== REVISION ||
      !await matchesReviewedHtmlSection(blocks, /^Statewide open burning ban; waiver; permit; fee; terms, defined\.$/, REVIEWED_TEXT)) {
    throw new Error("Neb. Rev. Stat. § 81-520.01: reviewed statute or effective date changed or is missing");
  }

  // The date is for this text revision. The underlying restriction predates it.
  if (localClock(now, RULE.zone).date < REVISION) return [];
  return calendarStatusRows(RULE, COUNTIES, META, now, { includeTomorrow: true });
}

export const neOpenBurningLaw: ActiveSource = {
  ...META, recurring: true, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: RULE.zone, hours: [9] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 64_000 });
    if (reply.notModified) throw new Error("Unexpected Nebraska statute 304");
    return { rows: await parseNeOpenBurning(reply.response, now) };
  },
};
