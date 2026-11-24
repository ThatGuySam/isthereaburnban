import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.VT;
const COUNTIES = countiesInState(RULE.state);
const META = {
  id: "vt-open-burning-permits", state: RULE.state, scope: RULE.scope,
  stack: "Vermont Legislature / HTML and calendar", sourceName: "Vermont Legislature (10 V.S.A. § 2645)",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
};
// Act 162 amended the permit scope, exceptions and definitions effective July 1, 2026.
const REVIEWED_SECTION = "56b096f1ecbd8c940e87fa263469aabea157a505ae14c4f4cc60d3ef5fcbaec2";

export async function parseVermontPermits(parts: HtmlParts, now: Date) {
  const paragraphs = blockAfterHeading(parts.blocks, /^Subchapter 004\s*:\s*Forest Fires and Fire Prevention$/, { requireUnique: true })
    .filter(({ tag }) => tag === "p").map(({ text }) => text);
  const start = paragraphs.indexOf("§ 2645. Open burning; permits");
  const end = paragraphs.findIndex((text) => text.startsWith("(e) Nothing in this section"));
  if (start < 0 || end <= start || await sha256(paragraphs.slice(start, end + 1).join("\n")) !== REVIEWED_SECTION) {
    throw new Error("Vermont § 2645: reviewed open-burning statute changed or is missing");
  }
  return pinnedRows(now);
}

function pinnedRows(now: Date) {
  return calendarStatusRows(RULE, COUNTIES, META, now, { includeTomorrow: true });
}

export const vtOpenBurningPermits: ActiveSource = {
  ...META, recurring: true, pinnedRows, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "text/html" }, maxBytes: 128_000, maxResponseAgeMs: 24 * 3_600_000,
    });
    if (reply.notModified) throw new Error("Unexpected Vermont statute 304");
    return { rows: await parseVermontPermits(await extractHtml(reply.response), now) };
  },
};
