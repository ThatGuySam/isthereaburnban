import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.NY_NYC_BARBECUES;
const BOROUGHS = new Set(["36005", "36047", "36061", "36081", "36085"]);
const COUNTIES = countiesInState(RULE.state).filter(({ fips }) => BOROUGHS.has(fips));
const META = {
  id: "ny-nyc-barbecuing", state: RULE.state, scope: RULE.scope, stack: "ASP.NET WebForms HTML / calendar",
  sourceName: "NYC 311 and New York City Fire Department",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

export function parseNycBarbecuing({ blocks }: HtmlParts, now: Date): CountyStatus[] {
  const title = blocks.some(({ tag, text }) => tag === "h1" && text === "Barbecuing");
  const residential = blockAfterHeading(blocks, /^Commercial and Residential Barbecuing$/)
    .some(({ tag, text }) => tag === "p" && text ===
      "You can use a charcoal, electric, or piped natural gas or propane barbecue outdoors on the property of residences, including the terrace of an apartment building when in compliance with the Fire Code.");
  const parks = blockAfterHeading(blocks, /^Designated Barbecuing Areas$/)
    .some(({ tag, text }) => tag === "p" && text ===
      "Barbecuing is only allowed in designated areas of certain City parks. Even within these areas, you may not barbecue under a tree.");
  if (!title || !residential || !parks) throw new Error("NYC 311: barbecuing rules changed or are missing");
  return pinnedRows(now);
}

function pinnedRows(now: Date) {
  return calendarStatusRows(RULE, COUNTIES, META, now, { includeTomorrow: true });
}

export const nyNycBarbecuing: ActiveSource = {
  ...META, recurring: true, pinnedRows, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 512_000 });
    if (reply.notModified) throw new Error("Unexpected NYC 311 barbecuing page 304");
    return { rows: parseNycBarbecuing(await extractHtml(reply.response), now) };
  },
};
