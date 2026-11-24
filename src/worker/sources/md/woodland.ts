import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import { sharePointListItems } from "../lib/sharepoint";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.MD;
// The guidance excludes incorporated towns. Apply it only to covered areas within the 23 counties.
const COUNTIES = countiesInState(RULE.state).filter(({ fips }) => fips !== "24510");
const META = {
  id: "md-dnr-woodland-burning", state: RULE.state, scope: RULE.scope,
  stack: "SharePoint / HTML rich text and calendar",
  sourceName: "Maryland DNR Forest Service (COMAR 08.07.04)",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

// The published scope, conditions and hours were checked against COMAR 08.07.04.01–.03.
const REVIEWED_GUIDANCE = "72bfe0e097a8aa410e545b2e1756109ca4e4cad9f8ee6319a4b57a9c901b761b";

export async function parseMdWoodland(parts: HtmlParts, now: Date) {
  const items = sharePointListItems(parts, /^Open Air Burning$/, { requireUnique: true });
  if (!items.length || await sha256(items.join("\n")) !== REVIEWED_GUIDANCE) {
    throw new Error("Maryland DNR: reviewed woodland burning guidance changed or is missing");
  }
  return calendarStatusRows(RULE, COUNTIES, META, now, { includeTomorrow: true });
}

export const mdDnrWoodland: ActiveSource = {
  ...META, recurring: true, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "text/html" }, maxBytes: 128_000, maxResponseAgeMs: 24 * 60 * 60 * 1000,
    });
    if (reply.notModified) throw new Error("Unexpected Maryland DNR 304");
    return { rows: await parseMdWoodland(await extractHtml(reply.response), now) };
  },
};
