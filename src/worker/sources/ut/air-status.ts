import { countyByName } from "../../counties";
import { pairedStatusRows } from "../lib/county-bulletin";
import { dailyStatusRows, type DailyDecision } from "../lib/daily-status";
import { localClock, parseLocalDateTime, parseWeekdayDate, reportWindow, shiftDay, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Mountain;
const MAX_REPORT_AGE = 36 * 3_600_000;
const URL = "https://air.utah.gov/mediaforecast.php";
const META = {
  id: "ut-daq-county-air-actions", state: "UT", scope: "part",
  stack: "PHP / paired HTML forecast rows", sourceName: "Utah Division of Air Quality",
  sourceUrl: URL, officialUrl: URL,
} as const;

const HEATING_AREAS = [
  ["Salt Lake", "slc", "Salt Lake County homes and residential property"],
  ["Davis", "bv", "Covered solid-fuel heating devices in Davis County"],
  ["Utah", "ln", "Covered solid-fuel heating devices in Utah County"],
  ["Weber", "hv", "Covered solid-fuel heating devices west of the Wasatch Range"],
  ["Box Elder", "bg", "Covered solid-fuel heating devices between the Wasatch and Promontory ranges, south of Portage"],
  ["Cache", "sm", "Covered solid-fuel heating devices in Cache Valley"],
  ["Tooele", "tooele", "Covered solid-fuel heating devices in the northern Tooele County area defined by R307-302-2"],
] as const;
const ROSTER = [
  ...HEATING_AREAS.map(([county]) => county),
  "Wasatch", "Washington", "Iron", "Carbon", "Grand", "Duchesne", "Uintah",
];

export async function parseUtahAirActions(input: Response | string, now: Date) {
  const [stamp, header, ...rows] = await extractHtmlGrid(input, {
    row: "#content-main p.bodytext, table.clearBorder tr",
    cell: "#content-main p.bodytext > b, table.clearBorder tr > th, table.clearBorder tr > td",
  });
  const posted = /^Last Updated: (.+)$/.exec(stamp?.[0]?.text ?? "")?.[1];
  const sourceUpdated = posted ? parseLocalDateTime(posted, ZONE) : null;
  const report = reportWindow(sourceUpdated, now, MAX_REPORT_AGE);
  if (stamp?.length !== 1 || !report || !header?.every(({ tag }) => tag === "th")) {
    throw new Error("Utah DAQ: missing or stale forecast update");
  }
  const [countyHeading, firstDate, secondDate, thirdDate, advisory] = header.map(({ text }) => text);
  const dates = [firstDate, secondDate, thirdDate].map((text) => parseWeekdayDate(text ?? ""));
  const [first, second, third] = dates;
  const today = localClock(now, ZONE).date;
  const publishedDay = localClock(new Date(report.sourceUpdated), ZONE).date;
  if (header.length !== 5 || countyHeading !== "County" || advisory !== "Advisory Message" ||
      !first || first !== publishedDay || second !== shiftDay(first, 1) || third !== shiftDay(first, 2) ||
      !dates.includes(today)) {
    throw new Error("Utah DAQ: changed forecast table or missing current date");
  }
  const actions = pairedStatusRows(rows.map((row) => row.map(({ text }) => text)), ROSTER, 3, { trailingColumns: 1 });
  const codes = new Set(["Mandatory", "Voluntary", "Unrestricted"]);
  if ([...actions.values()].some((row) => row.some((cell) => !codes.has(cell)))) {
    throw new Error("Utah DAQ: unrecognized action");
  }
  const decisions: DailyDecision[] = [];
  for (const [county, station, scopeNote] of HEATING_AREAS) {
    actions.get(county)?.forEach((action, index) => {
      const date = [first, second, third][index];
      const saltLake = county === "Salt Lake";
      const winterActionDay = date.slice(5) >= "11-01" || date.slice(5) <= "03-01";
      const isCountyRule = saltLake && winterActionDay && action !== "Unrestricted";
      const evidence = { date, county, scopeNote, officialUrl: `https://air.utah.gov/forecast.php?id=${station}` };
      if (isCountyRule) {
        decisions.push({
          ...evidence, status: "restricted", label: "Residential solid-fuel no-burn day",
          note: "Salt Lake County Health Regulation 35 limits residential solid-fuel burning on both voluntary and mandatory winter action days. Registered sole-source heaters and other published exceptions may apply.",
        });
      } else if (action === "Mandatory") {
        decisions.push({
          ...evidence, status: "restricted", label: "Mandatory solid-fuel heating restriction",
          note: "The Utah Division of Air Quality has declared a mandatory action day. The limits in R307-302 apply in designated air-quality areas. Check the rule for elevation and registered sole-source heating exceptions.",
        });
      } else {
        decisions.push({ ...evidence, status: "allowed" });
      }
    });
  }
  return dailyStatusRows(META, ZONE, decisions, now).map((row) => ({
    ...row, sourceUpdated: report.sourceUpdated,
    validUntil: row.validUntil && row.validUntil < report.validUntil ? row.validUntil : report.validUntil,
  }));
}

export const utDaqCountyAirActions: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only", keepRowLinks: true,
  reportingFips: HEATING_AREAS.flatMap(([name]) => countyByName(META.state, name)?.fips ?? []),
  cadence: { kind: "daily", zone: ZONE, hours: [2, 8, 14, 20] },
  staleMs: MAX_REPORT_AGE,
  async fetch({ now }) {
    const reply = await fetchSource(URL, {
      headers: { accept: "text/html", "cache-control": "no-cache" }, maxBytes: 250_000,
    });
    if (reply.notModified) throw new Error(`${META.id}: unexpected 304`);
    return { rows: await parseUtahAirActions(reply.response, now) };
  },
};
