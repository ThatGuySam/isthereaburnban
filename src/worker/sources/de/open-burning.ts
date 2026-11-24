import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { sha256 } from "../lib/hash";
import { blockAfterHeading } from "../lib/html";
import { fetchSource } from "../lib/http";
import { parseWpPagesBlocks, wpRestUrl } from "../lib/wordpress";
import type { ActiveSource } from "../types";

const OZONE = CALENDAR_RULES.DE_OZONE;
const RESIDENTIAL = CALENDAR_RULES.DE_RESIDENTIAL;
const COUNTIES = countiesInState("DE");
const PAGES = [
  { id: 8115, url: OZONE.officialUrl },
  { id: 8117, url: RESIDENTIAL.officialUrl },
];
const META = {
  id: "de-dnrec-open-burning", state: OZONE.state, scope: OZONE.scope,
  stack: "WordPress REST / HTML and regulatory calendar",
  sourceName: "Delaware DNREC Division of Air Quality",
  sourceUrl: wpRestUrl("https://dnrec.delaware.gov", "pages", {
    include: PAGES.map(({ id }) => id).join(","), _fields: "id,status,link,modified_gmt,content",
  }),
  officialUrl: OZONE.officialUrl, keepRowLinks: true,
} as const;

// Reviewed against 7 DE Admin. Code 1113 §§ 4–7. Check date, activity and exemption changes before updating.
const OZONE_TEXT = "addfc6755be4f908a697ee23e422dbbd03063c424a6eca07ed68c1164f23f512";
const RESIDENTIAL_TEXT = "3c3a6891647db67be5426ac1382f508e6f019c94f774e69407431bb280ef9088";

export async function parseDeOpenBurning(data: unknown, now: Date) {
  const [ozone, residential] = await parseWpPagesBlocks(data, PAGES, now);
  const lead = ozone.blocks[0];
  const allowed = blockAfterHeading(residential.blocks, /^Allowed Burning$/, { requireUnique: true });
  const notices = residential.blocks.filter(({ tag, text }) =>
    tag === "p" && text.startsWith("Before conducting a residential open burn,"));
  const residentialText = [...allowed.filter(({ tag }) => tag === "p"), ...notices].map(({ text }) => text).join("\n");
  if (lead?.tag !== "p" || await sha256(lead.text) !== OZONE_TEXT || await sha256(residentialText) !== RESIDENTIAL_TEXT) {
    throw new Error("Delaware DNREC: reviewed open-burning guidance changed or is missing");
  }

  return pinnedRows(now, ozone.modified, residential.modified);
}

function pinnedRows(now: Date, ozoneModified: string | null = null, residentialModified: string | null = null) {
  const rules = [[OZONE, ozoneModified], [RESIDENTIAL, residentialModified]] as const;
  return rules.flatMap(([rule, modified]) =>
    calendarStatusRows(rule, COUNTIES, META, now, { includeTomorrow: true, includeSeasonDates: true })
      .map((row) => ({ ...row, sourceUpdated: modified })));
}

export const deOpenBurning: ActiveSource = {
  ...META, recurring: true, pinnedRows, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: OZONE.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "application/json" }, maxBytes: 64_000, maxResponseAgeMs: 24 * 3_600_000,
    });
    if (reply.notModified) throw new Error("Unexpected DNREC open-burning 304");
    return { rows: await parseDeOpenBurning(await reply.response.json<unknown>(), now) };
  },
};
