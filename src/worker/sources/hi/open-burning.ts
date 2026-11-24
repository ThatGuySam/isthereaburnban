import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.HI;
const COUNTIES = countiesInState(RULE.state);
const META = {
  id: "hi-cab-open-burning", state: RULE.state, scope: RULE.scope,
  stack: "WordPress / HTML and calendar", sourceName: "Hawaiʻi Department of Health Clean Air Branch",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
};

// The first two paragraphs summarize §§ 11-60.1-52 and -53. Amendments need a scope review.
const REVIEWED_TEXT = "cfa3529e5ebceff597196f1a3cc4176e7b6f746115ff5cbb4efa7b162c1fcbd0";

export async function parseHiOpenBurning(input: Response | string, now: Date) {
  const { blocks } = await extractHtml(input);
  const paragraphs = blockAfterHeading(blocks, /^Open Burning and Agricultural Burning Permits in Hawaii$/, { requireUnique: true })
    .slice(0, 2);
  if (paragraphs.length !== 2 || paragraphs.some(({ tag }) => tag !== "p") ||
      await sha256(paragraphs.map(({ text }) => text).join("\n")) !== REVIEWED_TEXT) {
    throw new Error("Hawaiʻi Clean Air Branch: reviewed open-burning guidance changed or is missing");
  }
  return calendarStatusRows(RULE, COUNTIES, META, now, { includeTomorrow: true });
}

export const hiCabOpenBurning: ActiveSource = {
  ...META, recurring: true, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: RULE.zone, hours: [8] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 180_000 });
    if (reply.notModified) throw new Error("Unexpected Hawaiʻi open-burning guidance 304");
    return { rows: await parseHiOpenBurning(reply.response, now) };
  },
};
