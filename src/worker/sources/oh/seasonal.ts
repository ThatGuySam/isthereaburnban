import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarDayWindows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.OH;
const COUNTIES = countiesInState(RULE.state);
const META = {
  id: "oh-seasonal-burning", state: RULE.state, scope: "part", stack: "Statute / calendar + HTML",
  sourceName: "Ohio Division of Forestry (Ohio Revised Code § 1503.18)",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

// Pinned to the reviewed text of (C) and (D). Amendments need a review of the calendar and scope.
const RULE_TEXT_HASH = "495447551c7dc6b9e75a6b0b9ba64f32efd5f81ff96a193506c46ea1c7a5d5f5";

export async function parseOhioSeasonal(parts: HtmlParts, now: Date): Promise<CountyStatus[]> {
  const clauses = blockAfterHeading(parts.blocks, /^Section 1503\.18 \| Kindled fires\.$/)
    .filter(({ tag, text }) => tag === "p" && /^\([CD]\) /.test(text));
  if (clauses.length !== 2 || await sha256(clauses.map(({ text }) => text).join("\n")) !== RULE_TEXT_HASH) {
    throw new Error("Ohio Revised Code § 1503.18: expected (C) and (D) text changed or missing");
  }

  return pinnedRows(now);
}

function pinnedRows(now: Date) {
  const checked = now.toISOString();
  return calendarDayWindows(RULE, now).filter(({ validUntil }) => validUntil > checked).flatMap((window) =>
    COUNTIES.map(({ fips, name }) => ({
      ...window, fips, county: name, state: RULE.state, sourceId: META.id,
      status: RULE.status, label: RULE.label, note: RULE.note, scope: META.scope, scopeNote: RULE.scopeNote,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      checked, sourceUpdated: null, since: null, expires: null,
    })));
}

export const ohSeasonal: ActiveSource = {
  ...META,
  recurring: true, pinnedRows,
  mode: "positive-only",
  coverage: "restrictions",
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected Ohio statute 304");
    return { rows: await parseOhioSeasonal(await extractHtml(reply.response), now) };
  },
};
