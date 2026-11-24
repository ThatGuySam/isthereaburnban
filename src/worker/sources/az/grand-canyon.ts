import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { atLocalTime, parseUsDate, reportWindow, US_ZONES } from "../lib/dates";
import { extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://www.nps.gov/grca/learn/management/fireinformation.htm";
const META = {
  id: "az-nps-grand-canyon", state: "AZ", scope: "part", stack: "CommonSpot / HTML headings",
  sourceName: "National Park Service, Grand Canyon National Park", sourceUrl: URL, officialUrl: URL,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;
const MAX_BULLETIN_AGE_MS = 30 * 24 * 3_600_000;
const RIM_STAGE = /^(North Rim|South Rim): (?:Stage ([12]) Fire Restrictions|No (?:Current )?Fire Restrictions(?: in Effect)?)[.!]?$/i;

export function parseGrandCanyonFire(parts: HtmlParts, now: Date): CountyStatus[] {
  const stamps = parts.blocks.filter(({ tag, text }) => tag === "p" && /^Last updated: /i.test(text));
  const day = stamps.length === 1 ? parseUsDate(stamps[0].text.replace(/^Last updated: /i, "")) : null;
  const window = reportWindow(day && atLocalTime(day, 0, US_ZONES.Arizona), now, MAX_BULLETIN_AGE_MS);
  if (!day || !window) throw new Error("Grand Canyon fire bulletin: missing, future or stale update date");

  const seen = new Set<string>();
  const rows: CountyStatus[] = [];
  const county = countyByName(META.state, "Coconino");
  if (!county) throw new Error("Coconino County is missing from the county list");
  for (const { tag, text } of parts.blocks) {
    const match = tag === "h2" ? RIM_STAGE.exec(text) : null;
    if (!match) continue;
    const [, rim, stage] = match;
    const key = rim.toLowerCase();
    if (seen.has(key)) throw new Error("Grand Canyon fire bulletin: conflicting rim decisions");
    seen.add(key);
    if (!stage) continue;
    rows.push({
      state: META.state, scope: META.scope, sourceId: META.id, county: county.name, fips: county.fips,
      sourceName: META.sourceName, sourceUrl: URL, officialUrl: URL, status: "restricted",
      scopeNote: `Grand Canyon National Park, ${key === "north rim" ? "North Rim" : "South Rim"}`,
      label: `Stage ${stage} fire restrictions`,
      note: "See the park's fire bulletin for campfire rules and exceptions.",
      checked: now.toISOString(), sourceUpdated: day, since: null, expires: null, validUntil: window.validUntil,
    });
  }
  if (!seen.size) throw new Error("Grand Canyon fire bulletin: no recognized rim decision");
  return rows;
}

export const azGrandCanyonFire: ActiveSource = {
  ...META,
  coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Arizona, hours: [0, 12] },
  async fetch({ now }) {
    const reply = await fetchSource(URL, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected Grand Canyon fire bulletin 304");
    return { rows: parseGrandCanyonFire(await extractHtml(reply.response), now) };
  },
};
