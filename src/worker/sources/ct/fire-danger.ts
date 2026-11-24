import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { localClock, localDayWindow, parseWeekdayDate, US_ZONES } from "../lib/dates";
import { extractHtml } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Eastern;
const HEADING = "Daily Forest Fire Danger Report";
const COUNTIES = countiesInState("CT");
const META = {
  id: "ct-deep-fire-danger", state: "CT", scope: "part", stack: "ASP.NET Razor / HTML table (Sitecore embed)",
  sourceName: "Connecticut DEEP Forestry",
  sourceUrl: "https://www.depdata.ct.gov/forestry/forestfire/firerpt.cshtml",
  officialUrl: "https://portal.ct.gov/deep/forestry/forest-fire/forest-fire-danger-report",
} as const;

export async function parseCtFireDanger(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const { tables } = await extractHtml(input);
  const prefix = "The Forest Fire Danger Level for ";
  const reports = tables.filter(({ heading, rows }) => heading === HEADING && rows[0]?.[0]?.startsWith(prefix));
  const [report] = reports;
  if (reports.length !== 1 || report.rows.length !== 1 || report.rows[0].length !== 1) {
    throw new Error("Connecticut DEEP: expected one daily fire danger report cell");
  }

  const text = report.rows[0][0].slice(prefix.length);
  const match = /^(.+?) is (LOW|MODERATE|HIGH|VERY HIGH|EXTREME)(?: (.+))?$/i.exec(text);
  if (!match) throw new Error("Connecticut DEEP: unrecognized fire danger rating");
  const [, stamp, rawRating, areas] = match;
  const rating = rawRating.toUpperCase();
  const date = localClock(now, ZONE).date;
  if (parseWeekdayDate(stamp) !== date) throw new Error("Connecticut DEEP: expected today's Eastern report");
  if ((rating === "LOW" || rating === "MODERATE") && !areas) return [];

  // The headline alone cannot establish geography. Some reports have exceptions
  // keyed to roads or towns, and must be read on the official page.
  if (areas?.toUpperCase() !== `ALL COUNTIES ${rating}`) {
    throw new Error("Connecticut DEEP: expected an explicit, uniform all-counties rating");
  }
  if (rating === "LOW" || rating === "MODERATE") return [];

  const window = localDayWindow(date, ZONE);
  const checked = now.toISOString();
  return COUNTIES.map(({ fips, name }) => ({
    ...window, fips, county: name, state: META.state, sourceId: META.id, status: "restricted",
    scope: META.scope, scopeNote: "Brush burning within 100 feet of woodland or grassland",
    label: `Brush burning restricted by ${rating.toLowerCase()} fire danger`,
    note: "DEEP's rating limits brush burning within 100 feet of woodland or grassland even with a permit. Ask your town's open-burning official or fire marshal about your permit, air quality and other local restrictions.",
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    checked, sourceUpdated: null, since: null, expires: null,
  }));
}

export const ctDeepFireDanger: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions",
  // DEEP normally publishes before 8 a.m. Eastern. Recheck for late reports and revisions.
  cadence: { kind: "daily", zone: ZONE, hours: [8, 11, 15] },
  staleMs: 24 * 3_600_000,
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 64_000 });
    if (reply.notModified) throw new Error("Unexpected Connecticut DEEP fire danger 304");
    return { rows: await parseCtFireDanger(reply.response, now) };
  },
};
