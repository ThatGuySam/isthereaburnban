import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.ME;
const COUNTIES = countiesInState(RULE.state);
const META = {
  id: "me-open-burning-permits", state: RULE.state, scope: RULE.scope,
  stack: "Maine Legislature / HTML and calendar", sourceName: "Maine Legislature (12 M.R.S. §9325)",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
};
const REVIEWED_SECTION = "0b474b040eb0d13822a270ba2e0b25784e7a533cfcaad264e5b96114ad79ff0d";

export async function parseMaineOpenBurning(input: Response | string, now: Date) {
  const rows = await extractHtmlGrid(input, { row: ".MRSSection .MRSSubSection", cell: ".MRSSubSection .mrs-text" });
  const subsections = rows.map((row) => row.map(({ text }) => text));
  if (await sha256(JSON.stringify(subsections)) !== REVIEWED_SECTION) {
    throw new Error("Maine §9325: reviewed open-burning statute changed or is missing");
  }
  return calendarStatusRows(RULE, COUNTIES, META, now, { includeTomorrow: true });
}

export const meOpenBurningPermits: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", recurring: true,
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 64_000 });
    if (reply.notModified) throw new Error("Unexpected Maine statute 304");
    return { rows: await parseMaineOpenBurning(reply.response, now) };
  },
};
