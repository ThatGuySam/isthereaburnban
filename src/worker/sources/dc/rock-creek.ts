import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { localClock } from "../lib/dates";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml, matchesReviewedHtmlSection } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.DC_ROCK_CREEK;
const COUNTIES = countiesInState(RULE.state);
const META = {
  id: "dc-nps-rock-creek-fire-rules", state: RULE.state, scope: RULE.scope,
  stack: "NPS CommonSpot / HTML and calendar", sourceName: "National Park Service, Rock Creek Park",
  sourceUrl: RULE.officialUrl.replace("www.nps.gov", "home.nps.gov"), officialUrl: RULE.officialUrl,
};
const REVISION = "2026-08-28";
const SCOPE_TEXT = "0ef5d168e5bebbe049faa281fa654afbcc6ab06394f26638d710fb0f4d119778";
const FIRE_TERMS = "6facadd466a21718dca1d288c897e3ea104fb8e732a95313f53da3501c400342";

export async function parseRockCreekFireRules(input: Response | string, now: Date) {
  const { blocks, tables } = await extractHtml(input);
  const [scope] = blockAfterHeading(blocks, /^B\. Superintendent’s Compendium$/, { requireUnique: true });
  const approvals = tables.flatMap(({ rows }) => rows.flat()).filter((text) => text.includes("Approved: "));
  if (!blocks.some(({ tag, text }) => tag === "h1" && text === "Rock Creek Park Superintendent's Compendium") ||
      approvals.length !== 1 || !approvals[0].includes("Approved: August 28, 2026 Brian D. Joyner, Superintendent") ||
      scope?.tag !== "p" || await sha256(scope.text) !== SCOPE_TEXT ||
      !await matchesReviewedHtmlSection(blocks, /^36 CFR 2\.13 – FIRES$/, FIRE_TERMS)) {
    throw new Error("NPS Rock Creek: reviewed fire rules, approval date or park scope changed.");
  }
  return pinnedRows(now);
}

function pinnedRows(now: Date) {
  if (localClock(now, RULE.zone).date < REVISION) return [];
  return calendarStatusRows(RULE, COUNTIES, META, now, { includeTomorrow: true });
}

export const dcRockCreekFireRules: ActiveSource = {
  ...META, recurring: true, pinnedRows, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: RULE.zone, hours: [9] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "text/html" }, maxBytes: 200_000, maxResponseAgeMs: 48 * 3_600_000,
    });
    if (reply.notModified) throw new Error("Unexpected NPS Rock Creek compendium 304");
    return { rows: await parseRockCreekFireRules(reply.response, now) };
  },
};
