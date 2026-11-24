import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.MD_SUMMER_AIR;
const COUNTIES = countiesInState(RULE.state);
const META = {
  id: "md-mde-summer-air", state: RULE.state, scope: RULE.scope,
  stack: "Open Law Library bulk HTML / regulation and calendar",
  sourceName: "Maryland Department of the Environment (COMAR 26.11.07.03C)",
  sourceUrl: "https://raw.githubusercontent.com/maryland-dsd/law-html/HEAD/us/md/exec/comar/26.11.07.03/index.html",
  officialUrl: RULE.officialUrl,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

// Recheck the published county list, dates and exceptions before applying the mapped rule.
const REVIEWED_CLAUSE = "f2499d89983c9ab22a75ae20800d8755e98fb533e8dc8f4106cb0623ae71ab12";

export async function parseMdSummerAir({ blocks }: HtmlParts, now: Date) {
  const section = blockAfterHeading(blocks, /^\.03 Control Officer May Authorize Certain Open Fires\.$/, { requireUnique: true });
  const start = section.findIndex(({ tag, text }) => tag === "p" && text === "C. Prohibition on Open Burning.");
  const end = section.findIndex(({ tag, text }) => tag === "h2" && text === "Cross References");
  if (start < 0 || end <= start || await sha256(section.slice(start, end).map(({ text }) => text).join("\n")) !== REVIEWED_CLAUSE) {
    throw new Error("Maryland COMAR 26.11.07.03: reviewed summer burning clause changed or is missing");
  }
  return pinnedRows(now);
}

function pinnedRows(now: Date) {
  return calendarStatusRows(RULE, COUNTIES, META, now, { includeTomorrow: true });
}

export const mdSummerAir: ActiveSource = {
  ...META, recurring: true, pinnedRows, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "text/plain, text/html" }, maxBytes: 64_000, maxResponseAgeMs: 24 * 60 * 60 * 1000,
    });
    if (reply.notModified) throw new Error("Unexpected Maryland COMAR 304");
    return { rows: await parseMdSummerAir(await extractHtml(reply.response), now) };
  },
};
