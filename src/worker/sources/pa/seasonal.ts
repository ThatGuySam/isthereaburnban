import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarDayWindows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.PA;
const META = {
  id: "pa-state-forest-spring", state: RULE.state, scope: RULE.scope, stack: "Statute HTML / calendar",
  sourceName: "Pennsylvania DCNR (17 Pa. Code § 21.118)",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

// DCNR state forest tracts intersected with PennDOT county boundaries. See fixtures/README.md.
const FOREST_COUNTIES = new Set([
  "42001", "42009", "42011", "42015", "42017", "42021", "42023", "42025", "42027", "42029",
  "42031", "42033", "42035", "42037", "42039", "42041", "42043", "42045", "42047", "42051",
  "42053", "42055", "42057", "42061", "42063", "42065", "42067", "42069", "42071", "42079",
  "42081", "42083", "42085", "42087", "42089", "42095", "42097", "42099", "42103", "42105",
  "42107", "42109", "42111", "42113", "42117", "42119", "42121", "42123", "42127", "42129", "42131",
]);
const COUNTIES = countiesInState(RULE.state).filter(({ fips }) => FOREST_COUNTIES.has(fips));
const RULE_TEXT_HASH = "1e5da27750065e66acd5c57f5cf7ca5795f5731295676b056900ab32ceca8e72";

export async function parsePaStateForestSpring(parts: HtmlParts, now: Date): Promise<CountyStatus[]> {
  const clauses = blockAfterHeading(parts.blocks, /^§ 21\.118\. Fires\.$/)
    .filter(({ tag, text }) => tag === "p" && /^\([a-f12]\) /.test(text));
  if (clauses.length !== 8 || await sha256(clauses.map(({ text }) => text).join("\n")) !== RULE_TEXT_HASH) {
    throw new Error("Pennsylvania State Forest rule: § 21.118 text changed or is missing");
  }

  const checked = now.toISOString();
  return calendarDayWindows(RULE, now).flatMap((window) =>
    COUNTIES.map(({ fips, name }) => ({
      ...window, fips, county: name, state: RULE.state, sourceId: META.id,
      status: RULE.status, label: RULE.label, note: RULE.note, scope: META.scope, scopeNote: RULE.scopeNote,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      checked, sourceUpdated: null, since: null, expires: null,
    })));
}

export const paStateForestSpring: ActiveSource = {
  ...META, recurring: true, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 100_000 });
    if (reply.notModified) throw new Error("Unexpected Pennsylvania Code 304");
    return { rows: await parsePaStateForestSpring(await extractHtml(reply.response), now) };
  },
};
