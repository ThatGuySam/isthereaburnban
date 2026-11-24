import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.NC_AIR_BURN_HOURS;
const COUNTIES = countiesInState(RULE.state);
const META = {
  id: "nc-deq-open-burning-hours", state: RULE.state, scope: "part", stack: "Drupal / HTML + regulation calendar",
  sourceName: "N.C. Division of Air Quality (15A NCAC 02D .1903)",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
} as const;
const REVIEWED_GUIDANCE = "61f134ca00dabf3774725ae4299dbdcba4da7d57e0b77e163000cae742ffcabf";

export async function parseNcAirHours({ blocks }: HtmlParts, now: Date) {
  const hours = blockAfterHeading(blocks, /^Open Burning Rules$/)
    .find(({ tag, text }) => tag === "p" && text.startsWith("Residential yard waste and commercial land clearing"));
  if (!hours || await sha256(hours.text) !== REVIEWED_GUIDANCE) {
    throw new Error("NC DEQ: open-burning hours guidance changed or is missing");
  }
  return calendarStatusRows(RULE, COUNTIES, META, now);
}

export const ncAirHours: ActiveSource = {
  ...META, recurring: true, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected NC DEQ 304");
    return { rows: await parseNcAirHours(await extractHtml(reply.response), now) };
  },
};
