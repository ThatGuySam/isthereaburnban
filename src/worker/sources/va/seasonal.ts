import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.VA;
const COUNTIES = countiesInState(RULE.state);
const META = {
  id: "va-4pm-burning-law", state: RULE.state, scope: RULE.scope, stack: "Virginia LIS HTML / statute and calendar",
  sourceName: "Virginia Department of Forestry (Code of Virginia § 10.1-1142)",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

// Verify the reviewed seasonal scope, dates and exceptions on each poll.
const RULE_TEXT_HASH = "2784099267a211ccade8b2f17f141237cdaa8776dc6888895cfca9d22ded16de";

export async function parseVirginiaSeasonal({ blocks }: HtmlParts, now: Date): Promise<CountyStatus[]> {
  const clauses = blockAfterHeading(blocks, /^§ 10\.1-1142\. Regulating the burning of woods, brush, etc\.; penalties\.$/)
    .filter(({ tag }) => tag === "p").map(({ text }) => text);
  const start = clauses.findIndex((text) => text.startsWith("B. "));
  const end = clauses.findIndex((text) => text.startsWith("D. "));
  if (start < 0 || end <= start || await sha256(clauses.slice(start, end).join("\n")) !== RULE_TEXT_HASH) {
    throw new Error("Virginia Code § 10.1-1142: seasonal burning clauses changed or are missing");
  }
  return calendarStatusRows(RULE, COUNTIES, META, now, { includeTomorrow: true });
}

export const vaSeasonal: ActiveSource = {
  ...META, recurring: true, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 128_000 });
    if (reply.notModified) throw new Error("Unexpected Virginia statute 304");
    return { rows: await parseVirginiaSeasonal(await extractHtml(reply.response), now) };
  },
};
