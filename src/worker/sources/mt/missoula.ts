import type { CountyStatus } from "../../../shared/types";
import { calendarDayWindows, CALENDAR_RULES } from "../lib/calendar";
import { extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULES = [CALENDAR_RULES.MT_MISSOULA_GENERAL, CALENDAR_RULES.MT_MISSOULA_AGRICULTURE];
const URL = RULES[0].officialUrl;
const META = {
  id: "mt-missoula-outdoor-burning-seasons", state: "MT", scope: "part", stack: "Calendar / county HTML",
  sourceName: "Missoula Public Health", sourceUrl: URL, officialUrl: URL,
} as const;

export function parseMissoulaSeasons(parts: HtmlParts, now: Date): CountyStatus[] {
  const headings = new Set(parts.blocks.filter(({ tag }) => tag === "h2").map(({ text }) => text));
  if (!headings.has("General Outdoor - March 1 to Aug. 31") ||
      !headings.has("Essential Agriculture - March 1 to Oct. 31")) {
    throw new Error("Missoula County: published outdoor burning seasons changed or are missing");
  }

  const checked = now.toISOString();
  return RULES.flatMap((rule) => calendarDayWindows(rule, now).map((window) => ({
    ...window, fips: "30063", county: "Missoula County", state: META.state, sourceId: META.id,
    scope: META.scope, scopeNote: rule.scopeNote, status: rule.status, label: rule.label, note: rule.note,
    checked, sourceUpdated: null, since: null, expires: null,
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
  })));
}

export const mtMissoulaSeasons: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only", recurring: true,
  cadence: { kind: "daily", zone: RULES[0].zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 350_000 });
    if (reply.notModified) throw new Error("Unexpected Missoula season page 304");
    return { rows: parseMissoulaSeasons(await extractHtml(reply.response), now) };
  },
};
