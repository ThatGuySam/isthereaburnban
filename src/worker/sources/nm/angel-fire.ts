import { COUNTY_BY_FIPS } from "../../counties";
import { calendarStatusRows, type CalendarRule } from "../lib/calendar";
import { civicPlusPageParagraphs } from "../lib/civicplus";
import { localClock, parseUsDate, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://www.angelfirenm.gov/182/Current-Fire-Restrictions";
const META = {
  id: "nm-angel-fire-permits", state: "NM", scope: "part", stack: "CivicPlus / HTML",
  sourceName: "Village of Angel Fire Fire Department", sourceUrl: URL, officialUrl: URL,
} as const;
const ZONE = US_ZONES.Mountain;

export async function parseAngelFirePermits(input: Response | string, now: Date) {
  const [notice] = await civicPlusPageParagraphs(input, "Current Fire Restrictions");
  const lift = /^As of (.+?) the Temporary Fire Ban has been officially lifted\. While outdoor burning with permit and campfires are once again permitted,/.exec(notice);
  const date = lift && parseUsDate(lift[1]);
  if (!date || date > localClock(now, ZONE).date) {
    throw new Error("Angel Fire: expected a dated lift with the village's ongoing permit requirement");
  }
  return pinnedRows(now, date);
}

function pinnedRows(now: Date, liftDate?: string) {
  const colfax = COUNTY_BY_FIPS.get("35007")!;
  const rule: CalendarRule = {
    state: META.state, officialUrl: URL, zone: ZONE, scope: META.scope, status: "restricted",
    scopeNote: "Village of Angel Fire",
    label: "Angel Fire outdoor burning permits",
    note: (liftDate ? `The village lifted its temporary ban on ${liftDate}. ` : "") +
      "Outdoor burning requires a permit and inspection, with an exception for personal-use campfires. Check the Fire Department for short-term No Burn Days.",
  };
  return calendarStatusRows(rule, [colfax], META, now, { includeTomorrow: true });
}

export const nmAngelFirePermits: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", recurring: true, pinnedRows,
  cadence: { kind: "daily", zone: ZONE, hours: [6] },
  async fetch({ now }) {
    const reply = await fetchSource(URL, {
      headers: { accept: "text/html" }, maxBytes: 150_000, maxResponseAgeMs: 24 * 3_600_000,
    });
    if (reply.notModified) throw new Error("Unexpected Angel Fire 304");
    return { rows: await parseAngelFirePermits(reply.response, now) };
  },
};
