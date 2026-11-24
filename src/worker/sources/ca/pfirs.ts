import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { extractHtml, type HtmlParts } from "../lib/html";
import { atLocalTime, localClock, parseUsDate, shiftDay, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://ssl.arb.ca.gov/pfirs/cb3/cb3.php";
const META = {
  id: "ca-carb-pfirs", state: "CA", stack: "PHP / HTML table", sourceName: "California Air Resources Board",
  sourceUrl: URL, officialUrl: URL, scope: "part",
} as const;

// County lists come from PFIRS row labels and CARB's published basin boundaries.
// https://www.arb.ca.gov/ei/maps/statemap/abmap.htm
// Bay Area sections: https://ww2.arb.ca.gov/sites/default/files/2021-06/BayAreaSMP.pdf#page=48
// A county match can be partial and never removes elevation or basin limits.
const COUNTIES: Record<string, string[]> = {
  "Lake County": ["Lake"],
  "Lake Tahoe": ["El Dorado", "Placer"],
  "Northeast Plateau": ["Lassen", "Modoc", "Siskiyou"],
  "Mojave Desert": ["Kern", "Los Angeles", "San Bernardino", "Riverside"],
  "Salton Sea": ["Imperial", "Riverside"],
  "San Diego West": ["San Diego"],
  "Mountain Counties North": ["Plumas", "Sierra", "Nevada", "Placer", "El Dorado"],
  "Mountain Counties South": ["Amador", "Calaveras", "Tuolumne", "Mariposa"],
  "Great Basin Valleys North": ["Alpine", "Mono"],
  "Great Basin Valleys South": ["Inyo"],
  "San Francisco North": ["Napa", "Solano", "Sonoma"],
  "San Francisco South": ["Contra Costa", "Alameda", "Santa Clara"],
  "San Francisco Coastal": ["San Mateo", "San Francisco", "Marin", "Sonoma"],
};

const ZONES = Object.keys(COUNTIES);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parsePfirs(parts: HtmlParts, now: Date): CountyStatus[] {
  const { date: today } = localClock(now, US_ZONES.Pacific);
  const tomorrow = shiftDay(today, 1);
  const checked = now.toISOString();
  const rows: CountyStatus[] = [];
  const dates = [today, tomorrow].map((day) => ({
    day, weekday: WEEKDAYS[new Date(day).getUTCDay()],
    from: atLocalTime(day, 0, US_ZONES.Pacific),
    until: atLocalTime(shiftDay(day, 1), 0, US_ZONES.Pacific),
  }));
  let freshTables = 0;

  for (const { rows: [header, ...decisions] } of parts.tables) {
    if (!header || header[0] !== "Basin") continue;
    const index = header.findIndex((cell) => /^24-hr Decision\s/i.test(cell));
    if (index < 0) continue;
    const stamp = header[index].replace(/^24-hr Decision\s+/i, "");
    const window = dates.find(({ day, weekday }) =>
      parseUsDate(stamp, +day.slice(0, 4)) === day && stamp.startsWith(weekday));
    if (!window?.from || !window.until) continue;
    const { day: decisionDay, from: validFrom, until: validUntil } = window;
    freshTables++;
    for (const [basin, ...cells] of decisions) {
      const zone = ZONES.find((name) => basin === name || basin.startsWith(name + " "));
      if (!zone) continue;
      const value = cells[index - 1]?.trim() ?? "";
      const decision = /^(no[- ]burn|marginal(?: burn)?|burn)(?:\s*\(|$)/i.exec(value)?.[1].toLowerCase();
      if (!decision) continue;
      const status = decision === "burn" ? "none" : decision.startsWith("marginal") ? "restricted" : "ban";
      const label = decision === "burn" ? "CARB burn day" : status === "ban" ? "CARB no-burn day" : "CARB marginal burn day";
      for (const name of COUNTIES[zone]) {
        const county = countyByName("CA", name);
        if (!county) throw new Error(`Unknown California county in mapped CARB basin: ${name}`);
        rows.push({
          fips: county.fips, county: county.name, state: META.state, sourceId: META.id, status,
          scope: "part", scopeNote: `${basin}, agricultural and prescribed burning`,
          label: `${label} for ${decisionDay}`,
          note: `CARB's ${decisionDay} basin decision applies to agricultural and prescribed burning. Contact the local air district or fire agency for authorization and residential rules.`,
          sourceUpdated: null, checked, since: null, expires: decisionDay, validFrom, validUntil,
          sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
        });
      }
    }
  }

  if (!freshTables) throw new Error("CARB PFIRS: no current 24-hour decision tables");
  return rows;
}

export const pfirs: ActiveSource = {
  ...META,
  coverage: "restrictions",
  mode: "positive-only",
  // PFIRS switches to tomorrow after afternoon publication. Check after midnight and
  // after the 7:45 a.m. deadline for deferred decisions (17 CCR §80110).
  cadence: { kind: "daily", zone: US_ZONES.Pacific, hours: [0, 8] },
  staleMs: 30 * 60 * 60 * 1000,
  async fetch({ now }) {
    // The body has a decision date that needs revalidation each day.
    const reply = await fetchSource(URL, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected CARB PFIRS 304");
    return { rows: parsePfirs(await extractHtml(reply.response), now) };
  },
};
