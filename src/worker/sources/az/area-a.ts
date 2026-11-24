import type { CountyStatus } from "../../../shared/types";
import { countiesInState, matchKey } from "../../counties";
import { CALENDAR_RULES, calendarDayWindows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.AZ;
const COUNTIES = countiesInState(RULE.state).filter(({ name }) => RULE.counties?.has(matchKey(name)));
const META = {
  id: "az-area-a-summer", state: RULE.state, scope: RULE.scope, stack: "Statute / calendar + HTML",
  sourceName: "Arizona Legislature (A.R.S. § 49-501)",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

// Review the dates and exceptions if subsections (A) or (B) change.
const RULE_TEXT_HASH = "6c5ce685dd0bf4f1e7f6bcbed59a0d9ff79242de7779732aa99d4c444b0f374f";

export async function parseArizonaAreaA(parts: HtmlParts, now: Date): Promise<CountyStatus[]> {
  const paragraphs = parts.blocks.filter(({ tag }) => tag === "p").map(({ text }) => text);
  const start = paragraphs.findIndex((text) => text.startsWith("A. Notwithstanding "));
  const end = paragraphs.findIndex((text, index) => index > start && text.startsWith("C. Permission "));
  if (!paragraphs[0]?.startsWith("49-501.") || start < 0 || end < 0 ||
      await sha256(paragraphs.slice(start, end).join("\n")) !== RULE_TEXT_HASH) {
    throw new Error("A.R.S. § 49-501: reviewed subsections (A) and (B) changed or are missing");
  }

  return pinnedRows(now);
}

function pinnedRows(now: Date) {
  const checked = now.toISOString();
  return calendarDayWindows(RULE, now).flatMap((window) => COUNTIES.map(({ fips, name }) => ({
    ...window, state: META.state, scope: META.scope, sourceId: META.id, county: name, fips,
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    label: RULE.label, status: RULE.status, scopeNote: RULE.scopeNote, note: RULE.note,
    checked, sourceUpdated: null, since: null, expires: null,
  })));
}

export const azAreaASummer: ActiveSource = {
  ...META,
  recurring: true, pinnedRows, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected Arizona open-burning statute 304");
    return { rows: await parseArizonaAreaA(await extractHtml(reply.response), now) };
  },
};
