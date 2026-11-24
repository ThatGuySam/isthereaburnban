import type { CountyStatus } from "../../../shared/types";
import { localClock, localDayWindow, parseUsDate, parseWeekdayDate, shiftDay, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Pacific;
const META = {
  id: "id-kootenai-air", state: "ID", scope: "part", stack: "ASP.NET MVC / HTML status grid",
  sourceName: "Idaho DEQ and Kootenai County Fire & Rescue",
  sourceUrl: "https://www2.deq.idaho.gov/air/AQIPublic/Forecast?siteId=2",
  officialUrl: "https://kootenaifire.com/burn-permits/",
} as const;
const TITLE = /^Coeur d'Alene 3-day Forecast(?:\s+\(Default Site\))?$/;
const LEVELS = new Map([
  ["No Restrictions", "aqi-green-outline"],
  ["Conditional Restrictions", "aqi-yellow-outline"],
  ["Mandatory Restrictions", "aqi-red-outline"],
]);
const SELECTORS = {
  row: "div.col-md-4.col-xs-4, div.center-text, div.aqi-forecast",
  cell: "div.col-md-4.col-xs-4 > h3, div.center-text > strong, .aqi-forecast h3, .aqi-forecast i.fa-flag, .aqi-forecast div.row.text-center:nth-child(3)",
};

export async function parseKootenaiAir(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const grid = (await extractHtmlGrid(input, SELECTORS)).filter((row) => row.length);
  const titles = grid.filter(([first]) => TITLE.test(first.text));
  const updates = grid.filter(([first]) => first.text.startsWith("Last Updated:"));
  const { date: day } = localClock(now, ZONE);
  const published = updates.length === 1 ? parseUsDate(updates[0][0].text.slice("Last Updated:".length)) : null;
  if (titles.length !== 1 || !published || published < shiftDay(day, -1) || published > day) {
    throw new Error("Idaho DEQ: unexpected or stale Coeur d'Alene forecast");
  }
  const current = grid.filter(([first]) => parseWeekdayDate(first.text, Number(day.slice(0, 4))) === day);
  if (current.length !== 1) throw new Error("Idaho DEQ: expected one forecast for today in Pacific time");
  const outdoor = current[0].findIndex(({ text }) => text === "Outdoor Burning");
  const icon = current[0][outdoor + 1]?.className.split(/\s+/);
  const condition = current[0][outdoor + 2]?.text;
  const code = LEVELS.get(condition);
  if (outdoor < 1 || current[0].filter(({ text }) => text === "Outdoor Burning").length !== 1 || !code || !icon?.includes(code)) {
    throw new Error("Idaho DEQ: unrecognized outdoor burning action");
  }
  if (condition === "No Restrictions") return [];

  return [{
    fips: "16055", county: "Kootenai County", state: META.state, sourceId: META.id,
    status: "ban", scope: META.scope, scopeNote: "Kootenai County Fire & Rescue district",
    label: "District outdoor burning restrictions",
    note: `DEQ's Coeur d'Alene forecast shows ${condition.toLowerCase()} for outdoor burning. The district prohibits residential yard waste, burn barrels, logging slash, and recreational or cooking fires on Yellow and Red days. Confirm today's color with the DEQ hotline at 800-633-6247 before burning.`,
    ...localDayWindow(day, ZONE), checked: now.toISOString(), sourceUpdated: null, since: null, expires: null,
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
  }];
}

export const idKootenaiAir: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only", staleMs: 24 * 3_600_000,
  cadence: { kind: "daily", zone: ZONE, hours: [0, 6, 10, 14, 18, 22] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html", "cache-control": "no-cache" } });
    if (reply.notModified) throw new Error("Unexpected Idaho DEQ forecast 304");
    return { rows: await parseKootenaiAir(reply.response, now) };
  },
};
