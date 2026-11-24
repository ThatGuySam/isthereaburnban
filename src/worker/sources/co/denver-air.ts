import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { parseLocalDateTime, parseUsDate, US_ZONES } from "../lib/dates";
import { extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://www.colorado.gov/airquality/advisory.aspx";
const META = {
  id: "co-cdphe-denver-air", state: "CO", scope: "part", stack: "ASP.NET / HTML",
  sourceName: "Colorado Air Pollution Control Division", sourceUrl: URL, officialUrl: URL,
} as const;

// Air Quality Control Commission Regulation 4, 5 CCR 1001-6 VII(A).
const COUNTIES = ["Adams", "Arapahoe", "Boulder", "Broomfield", "Denver", "Douglas", "Jefferson"];
const AREA = /seven-county Denver[-–]Boulder metropolitan area/i;
const START = /^This is the Denver Metro Air Pollution Forecast effective (.+?) on (.+):$/i;
const END = /\buntil (?:at least )?(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)\s+((?:[a-z]+,?\s+){1,2}\d{1,2},?\s+\d{4})\./i;

export function parseDenverAir({ blocks }: HtmlParts, now: Date): CountyStatus[] {
  const titles = blocks.filter(({ tag, text }) => tag === "h2" && /^Denver Metro\b/i.test(text));
  const forecasts = blocks.filter(({ tag, text }) => tag === "p" && START.test(text));
  if (titles.length !== 1 || forecasts.length !== 1) throw new Error("CDPHE: missing unique Denver Metro forecast");

  const title = titles[0].text;
  const advisory = blocks[blocks.indexOf(forecasts[0]) + 1];
  const message = advisory?.tag === "p" ? advisory.text : "";
  const clear = /\bNo Indoor Burning Restrictions(?: in Effect)?$/i.test(title);
  const active = !clear && /\bIndoor Burning Restrictions in Effect$/i.test(title);
  const clause = active
    ? /\bIndoor Burning Restrictions\b[^.]*? (?:are|remain) (?:now )?in effect (?=until )/i.exec(message)
    : /^No (?:Advisories|Indoor Burning Restrictions) (?:are )?in effect\b/i.exec(message);
  if (!AREA.test(message) || (!active && !clear) || !clause) {
    throw new Error("CDPHE: unrecognized indoor burning decision or region");
  }

  const start = START.exec(forecasts[0].text);
  const end = END.exec(message.slice(clause.index));
  const validFrom = start && parseLocalDateTime(`${start[2]} at ${start[1]}`, US_ZONES.Mountain);
  const validUntil = end && parseLocalDateTime(`${end[2]} at ${end[1]}`, US_ZONES.Mountain);
  const since = start && parseUsDate(start[2]);
  const expires = end && parseUsDate(end[2]);
  const checked = now.toISOString();
  if (!validFrom || !validUntil || !since || !expires || checked < validFrom || checked >= validUntil ||
      validFrom >= validUntil || Date.parse(validUntil) - Date.parse(validFrom) > 48 * 3_600_000) {
    throw new Error("CDPHE: invalid, future or expired Denver Metro forecast window");
  }
  if (clear) return [];

  return COUNTIES.map((name) => {
    const county = countyByName(META.state, name);
    if (!county) throw new Error(`Colorado county not found: ${name}`);
    return {
      state: META.state, fips: county.fips, county: county.name, sourceId: META.id, scope: META.scope,
      sourceName: META.sourceName, sourceUrl: URL, officialUrl: URL,
      scopeNote: "Denver–Boulder AIR program area at or below 7,000 feet, indoor wood burning",
      status: "restricted", label: "Indoor wood-burning restrictions",
      note: "The state restricts wood burning in the air-quality area during this advisory. Appliance and municipal exceptions apply. Check the separate open-burning forecast and your local fire authority for outdoor burning.",
      checked, sourceUpdated: null, since, expires, validFrom, validUntil,
    };
  });
}

export const coDenverAir: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only", cadence: { kind: "hourly" },
  staleMs: 26 * 3_600_000,
  async fetch({ now }) {
    const reply = await fetchSource(URL, { headers: { accept: "text/html", "cache-control": "no-cache" } });
    if (reply.notModified) throw new Error("Unexpected CDPHE status response: HTTP 304");
    return { rows: parseDenverAir(await extractHtml(reply.response), now) };
  },
};
