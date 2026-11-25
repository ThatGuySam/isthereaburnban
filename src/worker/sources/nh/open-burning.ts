import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { extractHtmlGrid } from "../lib/html";
import { getText } from "../lib/http";
import { reviewedRuleFallback, RuleChangedError } from "../statutory-fallback";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.NH;
const COUNTIES = countiesInState(RULE.state);
const META = {
  id: "nh-open-burning-permits", state: RULE.state, scope: RULE.scope,
  stack: "NH General Court / HTML and calendar", sourceName: "New Hampshire General Court (RSA 227-L:17)",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
};
const REVIEWED_SECTION = "e4ce26dc4210ed8072001f4cd20824c4ca84ca85bbe0d99255d4ea5029de972f";
const RULE_REVIEWED = "2026-11-24T16:20:16.000Z";
const permitRows = (now: Date) => calendarStatusRows(RULE, COUNTIES, META, now, { includeTomorrow: true });

export async function parseNhOpenBurning(input: Response | string, now: Date) {
  const [[heading, section, ...extra] = [], ...otherRows] = await extractHtmlGrid(input, {
    row: "body", cell: "body > center > h3, body > codesect",
  });
  if (heading?.text !== "Section 227-L:17" || !section || extra.length || otherRows.length ||
      await sha256(section.text) !== REVIEWED_SECTION) {
    throw new RuleChangedError("New Hampshire RSA 227-L:17: reviewed statute changed or is missing");
  }
  return permitRows(now);
}

export const nhOpenBurningPermits: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", recurring: true,
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    let html: string;
    try {
      html = await getText(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 64_000 });
    } catch (reason) {
      return reviewedRuleFallback(permitRows(now), RULE_REVIEWED, now, reason);
    }
    return { rows: await parseNhOpenBurning(html, now) };
  },
};
