import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://www.franklinvermont.org/home";
const META = {
  id: "vt-franklin-town-burning", state: "VT", scope: "part", stack: "Google Sites / HTML",
  sourceName: "Town of Franklin", sourceUrl: URL, officialUrl: URL,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;
const COUNTY = countyByName(META.state, "Franklin");
const ACTIVE = /^A burn ban is in effect for the town of Franklin until further notice\.$/i;
const CAMPFIRES = /^Please note that camp fires are permitted, however a camp fire is defined as having a diameter of no more than 3 feet\.$/i;
const BAN_MENTION = /\bburn(?:ing)? ban\b/i;
const LIFT = /^The burn ban(?: for the town of Franklin)? (?:(?:has been|is) (?:lifted|rescinded)|has expired|is no longer in effect)\.$/i;

export function parseFranklinBurning(parts: HtmlParts, now: Date): CountyStatus[] {
  const section = blockAfterHeading(parts.blocks, /^Town of Franklin$/, { requireUnique: true });
  if (!section.length || !COUNTY) throw new Error("Franklin: town homepage or county is missing");
  const notices = section.filter(({ text }) => BAN_MENTION.test(text));
  if (!notices.length || (notices.length === 1 && LIFT.test(notices[0].text))) return [];
  if (notices.length !== 1 || !ACTIVE.test(notices[0].text)) throw new Error("Franklin: unrecognized or conflicting burn-ban notice");
  const index = section.indexOf(notices[0]);
  if (!section.slice(index + 1, index + 4).some(({ text }) => CAMPFIRES.test(text))) {
    throw new Error("Franklin: reviewed campfire exception changed or is missing");
  }
  return [{
    fips: COUNTY.fips, county: COUNTY.name, state: META.state, sourceId: META.id,
    status: "ban", scope: META.scope, scopeNote: "Town of Franklin, outdoor burning covered by the town order",
    label: "Franklin town burn ban",
    note: "The Franklin fire warden's undated notice says the town ban is in effect until further notice. The notice allows campfires up to three feet in diameter. Check the town notice and state permit rules for your fire.",
    checked: now.toISOString(), sourceUpdated: null, since: null, expires: null,
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
  }];
}

export const vtFranklinBurning: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Eastern, hours: [2, 8, 14, 20] },
  staleMs: 10 * 3_600_000,
  async fetch({ now }) {
    const reply = await fetchSource(URL, {
      headers: { accept: "text/html" }, maxBytes: 512_000, maxResponseAgeMs: 2 * 3_600_000,
    });
    if (reply.notModified) throw new Error("Unexpected Franklin 304");
    return { rows: parseFranklinBurning(await extractHtml(reply.response), now) };
  },
};
