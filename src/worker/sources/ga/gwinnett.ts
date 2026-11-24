import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { localClock, localDayWindow, parseUsDate, US_ZONES } from "../lib/dates";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://www.gwinnettcounty.com/government/departments/fire-emergency/outdoor-burning-information";
const META = {
  id: "ga-gwinnett-daily", state: "GA", scope: "part", stack: "Liferay / HTML heading",
  sourceName: "Gwinnett County Fire and Emergency Services", sourceUrl: URL, officialUrl: URL,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DATE_PREFIX = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (\w+ \d{1,2}(?:st|nd|rd|th)?, \d{4}),? /i;
const DECISION = /^is (?:a )?(BURN DAY|NO[- ]BURN(?: DAY)?) in Gwinnett County[.!]?$/i;

export function parseGwinnett(parts: HtmlParts, now: Date): CountyStatus[] {
  const headings = blockAfterHeading(parts.blocks, /^Outdoor Burning$/);
  const candidates = headings.filter(({ tag, text }) => tag === "h2" && DATE_PREFIX.test(text));
  const message = candidates.length === 1 ? candidates[0].text : "";
  const prefix = DATE_PREFIX.exec(message);
  const decision = prefix && DECISION.exec(message.slice(prefix[0].length));
  if (!prefix || !decision) throw new Error("Gwinnett Fire Marshal: expected one dated burn day decision");

  const { date } = localClock(now, US_ZONES.Eastern);
  const weekday = WEEKDAYS[new Date(date).getUTCDay()];
  if (parseUsDate(prefix[2]) !== date || prefix[1].toLowerCase() !== weekday.toLowerCase()) {
    throw new Error(`Gwinnett Fire Marshal: decision date does not match ${date} Eastern`);
  }
  const county = countyByName(META.state, "Gwinnett");
  if (!county) throw new Error("Missing Gwinnett County in county directory");
  const restricted = /^NO/i.test(decision[1]);
  return [{
    ...localDayWindow(date, US_ZONES.Eastern), fips: county.fips, county: county.name,
    state: META.state, scope: META.scope, sourceId: META.id,
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    status: restricted ? "ban" : "unknown",
    scopeNote: "Gwinnett County Fire and EMS District, excluding the City of Loganville",
    label: restricted ? "Gwinnett Fire Marshal no-burn day" : "Gwinnett Fire Marshal burn day",
    note: restricted
      ? "The Fire Marshal posted a no-burn day for the fire district. Check the county page and your local fire authority for the rules at your address."
      : "The Fire Marshal listed a burn day for the fire district. Yard debris burning is prohibited on Sundays and at night. State rules, medical burn zones and city ordinances may also apply.",
    checked: now.toISOString(), sourceUpdated: null, since: date, expires: date,
  }];
}

export const gaGwinnett: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Eastern, hours: [9, 12, 16] },
  async fetch({ now }) {
    const reply = await fetchSource(URL, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected Gwinnett 304");
    return { rows: parseGwinnett(await extractHtml(reply.response), now) };
  },
};
