import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { localClock, localDayWindow, parseLocalDateTime, parseUsDate, shiftDay, US_ZONES } from "../lib/dates";
import { htmlText } from "../lib/html";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://smkmgt.com/burn.php";
const PACIFIC = US_ZONES.Pacific;
const META = {
  id: "or-willamette-backyard", state: "OR", stack: "PHP / HTML bulletin",
  sourceName: "Oregon DEQ and ODF", sourceUrl: URL, officialUrl: URL, scope: "part",
  mode: "positive-only", coverage: "restrictions",
} satisfies Pick<ActiveSource, "id" | "state" | "stack" | "sourceName" | "sourceUrl" | "officialUrl" | "scope" | "mode" | "coverage">;

// OAR 340-264-0078(5) and (7) define the control area and its special areas.
// The daily announcement additionally limits its scope to Zone 604 north of Lane County.
const valleyNames = new Set(["Benton", "Clackamas", "Linn", "Marion", "Multnomah", "Polk", "Washington", "Yamhill"]);
const counties = countiesInState("OR").filter(({ name }) => valleyNames.has(name.replace(/ County$/, "")));

export function parseWillametteBackyard(html: string, now: Date): CountyStatus[] {
  const bulletin = htmlText(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/i.exec(html)?.[1] ?? "");
  if (!bulletin.includes("WILLAMETTE VALLEY OPEN BURNING ANNOUNCEMENT (NORTH OF LANE COUNTY)") ||
      !bulletin.includes("Willamette Valley boundary (Zone 604)")) {
    throw new Error("Willamette: missing bulletin scope");
  }
  const today = localClock(now, PACIFIC).date;
  const lastDay = shiftDay(today, 3);
  const reports = [...bulletin.matchAll(/Open Burn Announcement for ([a-z]+, [a-z]+ \d{1,2}(?:st|nd|rd|th)?, \d{4})\b/gi)];
  const dates = new Set<string>();
  const rows: CountyStatus[] = [];
  for (const [index, heading] of reports.entries()) {
    const day = parseUsDate(heading[1]);
    if (!day) throw new Error("Willamette: invalid bulletin date");
    if (day < today || day > lastDay) continue;
    if (dates.has(day)) throw new Error("Willamette: duplicate bulletin date");
    dates.add(day);
    const body = bulletin.slice(heading.index + heading[0].length, reports[index + 1]?.index);
    const decision = /Backyard burning inside special control areas:\s*(.*?)\s*(?:➤|$)/i.exec(body)?.[1];
    const prohibited = decision === "Based on air quality considerations backyard burning is not allowed.";
    const hours = /^When allowed locally and based on air quality considerations backyard burning is allowed from (.+?) to (.+)$/.exec(decision ?? "");
    let label = "Backyard burning prohibited";
    if (!prohibited) {
      const from = hours && parseLocalDateTime(`${day} ${hours[1]}`, PACIFIC);
      const to = hours && parseLocalDateTime(`${day} ${hours[2]}`, PACIFIC);
      if (!hours || !from || !to || from >= to) throw new Error("Willamette: unrecognized backyard burning decision");
      label = `Backyard burning limited to ${hours[1]}–${hours[2]} Pacific where locally allowed`;
    }
    const window = localDayWindow(day, PACIFIC);
    for (const county of counties) {
      rows.push({
        fips: county.fips, county: county.name, state: META.state, sourceId: META.id, scope: META.scope,
        scopeNote: "Special Open Burning Control Areas inside Willamette Valley Zone 604",
        status: prohibited ? "ban" : "restricted", label,
        note: `The ${day} DEQ and ODF bulletin applies to backyard burning in the special control areas. Check your address and local fire district rules before burning.`,
        checked: now.toISOString(), since: day, expires: day, sourceUpdated: null, ...window,
        sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      });
    }
  }
  if (!dates.has(today)) throw new Error("Willamette: no announcement for the current Pacific date");
  return rows;
}

export const orWillametteBackyard: ActiveSource = {
  ...META,
  cadence: { kind: "daily", zone: PACIFIC, hours: [0, 8, 10, 15] },
  staleMs: 96 * 3_600_000,
  async fetch({ now }) {
    return { rows: parseWillametteBackyard(await getText(URL, { maxBytes: 100_000 }), now) };
  },
};
