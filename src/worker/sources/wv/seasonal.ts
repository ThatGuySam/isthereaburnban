import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { blockAfterHeading } from "../lib/html";
import { fetchSource } from "../lib/http";
import { parseWpPageBlocks, wpRestUrl } from "../lib/wordpress";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.WV;
const COUNTIES = countiesInState(RULE.state);
const PAGE = { id: 119, url: RULE.officialUrl };
const META = {
  id: "wv-forestry-fire-season", state: RULE.state, scope: RULE.scope,
  stack: "WordPress REST / Divi HTML and statutory calendar",
  sourceName: "West Virginia Division of Forestry",
  sourceUrl: wpRestUrl(new URL(PAGE.url).origin, "pages/119", { _fields: "id,status,link,modified_gmt,content" }),
  officialUrl: PAGE.url,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

const SEASON_HEADING = /^Burning Season Guidelines$/;
const DIVI_WRAPPERS = /^(?:\[\/?et_pb_[^\]]+\]\s*)+$/;
// The dates, hours and exceptions were checked against W. Va. Code § 20-3-5.
const SEASON_TEXT_HASH = "8dffb4577bfa5158d399e844941fd2ff57ce26d5e5d84774ac15aa18ca125950";

export async function parseWestVirginiaSeasonal(data: unknown, now: Date): Promise<CountyStatus[]> {
  const { blocks, modified } = await parseWpPageBlocks(data, PAGE, now);
  const section = blockAfterHeading(blocks, SEASON_HEADING)
    .filter(({ tag, text }) => tag !== "p" || !DIVI_WRAPPERS.test(text));
  if (blocks.filter(({ tag, text }) => tag === "h3" && SEASON_HEADING.test(text)).length !== 1 ||
      section.length !== 4 || section.some(({ tag }) => tag !== "p") ||
      await sha256(section.map(({ text }) => text).join("\n")) !== SEASON_TEXT_HASH) {
    throw new Error("West Virginia Forestry: seasonal burning guidance changed or is missing");
  }
  return pinnedRows(now)
    .map((row) => ({ ...row, sourceUpdated: modified }));
}

function pinnedRows(now: Date) {
  return calendarStatusRows(RULE, COUNTIES, META, now, { includeTomorrow: true });
}

export const wvForestryFireSeason: ActiveSource = {
  ...META, recurring: true, pinnedRows, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "application/json" }, maxBytes: 64_000, maxResponseAgeMs: 24 * 60 * 60 * 1000,
    });
    if (reply.notModified) throw new Error("Unexpected West Virginia Forestry 304");
    return { rows: await parseWestVirginiaSeasonal(await reply.response.json<unknown>(), now) };
  },
};
