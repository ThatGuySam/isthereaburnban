import { z } from "zod";
import { dailyStatusRows, type DailyDecision } from "../lib/daily-status";
import { localClock, parseUsDate } from "../lib/dates";
import { getText, pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";
import { californiaDailySource, californiaFootprint, PACIFIC, winterWoodSmokeDate } from "./daily";

const mendocinoPage = "https://mcaqmd.org/mendocino-county-burn-day-status/";
const mendocinoData = z.object({
  data: z.object({
    effective_date: z.iso.date(),
    type: z.enum(["Permissive", "NoBurn"]),
    BurnStatus: z.string().min(1).max(100),
    BurnMsg: z.string().trim().min(1).max(1500),
  }),
});

export const mendocinoDaily = californiaDailySource({
  publisher: {
    id: "ca-mendocino-burn-day", stack: "WordPress REST JSON", sourceName: "Mendocino County Air Quality Management District",
    sourceUrl: "https://mcaqmd.org/wp-json/mcaqmd-burn/v1/status", officialUrl: mendocinoPage,
  },
  counties: ["Mendocino"], hours: [0, 9, 15], http: { accept: "application/json" },
  async read(input) {
    const { data } = mendocinoData.parse(await input.json());
    const allowed = data.type === "Permissive" && data.BurnStatus === "Permissive Burn";
    if (data.type === "Permissive" && !allowed) throw new Error("Mendocino: contradictory burn status");
    return [{
      date: data.effective_date, county: "Mendocino", scopeNote: "Open burning covered by the Mendocino air district",
      status: allowed ? "restricted" : "ban",
      label: allowed ? "Open burning allowed with permits and limits" : "Mendocino air district no-burn day",
      note: data.BurnMsg.replace(/\s+/g, " "),
    }];
  },
});

const valleyPage = "https://valleyair.org/air-quality-information/residential-wood-smoke-reduction-program/";
const valleyHazardPage = "https://valleyair.org/compliance/hazard-reduction-burning/daily-burn-declarations/";
const valleyUrl = "https://valleyair.org/aqinfo/WebPageForecast00.json";
const valleyTomorrow = "https://valleyair.org/aqinfo/WebPageForecast01.json";
const valleyAreas = new Map([
  ["San Joaquin", { county: "San Joaquin", area: "San Joaquin County" }],
  ["Stanislaus", { county: "Stanislaus", area: "Stanislaus County" }],
  ["Merced", { county: "Merced", area: "Merced County" }],
  ["Madera", { county: "Madera", area: "Madera County" }],
  ["Fresno", { county: "Fresno", area: "Fresno County" }],
  ["Kings", { county: "Kings", area: "Kings County" }],
  ["Tulare", { county: "Tulare", area: "Tulare County" }],
  ["Kern (SJV Air Basin portion)", { county: "Kern", area: "Kern County within the San Joaquin Valley air basin" }],
  ["Sequoia National Park and Forest", { county: "Tulare", area: "Sequoia National Park and Forest in Tulare County" }],
  ["Kern (Greater Frazier Park Area)", { county: "Kern", area: "Greater Frazier Park area" }],
]);
const valleyMeta = {
  id: "ca-valley-air-burn-declarations", state: "CA", scope: "part", stack: "Umbraco / JSON forecast",
  sourceName: "San Joaquin Valley Air Pollution Control District", sourceUrl: valleyUrl, officialUrl: valleyPage, keepRowLinks: true,
} as const;
const valleyForecast = z.array(z.object({
  County: z.string(),
  DateForecastedFor: z.string(),
  strCbybDeclaration: z.string(),
  strHrbDeclaration: z.string(),
}));

type ValleyArea = { county: string; area: string };

function woodSmokeDecision(location: ValleyArea, date: string, code: string): DailyDecision {
  const base = { date, county: location.county, scopeNote: `${location.area}, residential wood burning under Rule 4901` };
  if (!winterWoodSmokeDate(date) || code === "Burning Discouraged") return { ...base, status: "allowed" };
  const closed = code === "No Burning For All";
  if (!closed && code !== "No Burning Unless Registered") throw new Error("Valley Air: unrecognized wood-burning declaration");
  return {
    ...base, status: closed ? "ban" : "restricted",
    label: closed ? "Residential wood burning prohibited" : "Residential wood burning limited to registered devices",
    note: "The district's Rule 4901 declaration applies to covered residential wood burning. Check the district's exemptions for areas without natural gas service and homes that rely on wood as their only heat source.",
  };
}

function hazardReductionDecision(location: ValleyArea, date: string, code: string): DailyDecision {
  const base = {
    date, county: location.county, scopeNote: `${location.area}, hazard-reduction pile burning in the State Responsibility Area`,
    officialUrl: valleyHazardPage,
  };
  if (!code || code === "N/A") return { ...base, status: "pending" };
  if (code === "No") {
    return {
      ...base, status: "ban", label: "Hazard-reduction pile burning prohibited",
      note: "The district lists no hazard-reduction pile burning at any elevation in the covered area. Separate rules apply to agricultural and broadcast burns.",
    };
  }
  const elevation = /^Above (\d{1,2},\d{3}|\d{1,4}) feet only$/.exec(code)?.[1];
  if (code !== "Yes" && !elevation) throw new Error("Valley Air: unrecognized hazard-reduction declaration");
  return {
    ...base, status: "restricted", label: elevation
      ? `Hazard-reduction pile burning limited to above ${elevation} feet` : "Hazard-reduction pile burning requires a permit",
    note: "The declaration applies to permitted hazard-reduction pile burning. The district limits ignition to 9 a.m. to 4 p.m. Follow any additional fire agency restrictions.",
  };
}

function valleyDecisions(json: unknown): DailyDecision[] {
  const records = valleyForecast.parse(json);
  const date = records.length ? parseUsDate(records[0].DateForecastedFor) : null;
  if (!date || records.length !== valleyAreas.size) throw new Error("Valley Air: incomplete declaration roster");
  const seen = new Set<string>();
  return records.flatMap(({ County, DateForecastedFor, strCbybDeclaration, strHrbDeclaration }) => {
    const location = valleyAreas.get(County);
    if (!location || parseUsDate(DateForecastedFor) !== date || seen.has(County)) {
      throw new Error("Valley Air: unexpected declaration area or date");
    }
    seen.add(County);
    return [
      woodSmokeDecision(location, date, strCbybDeclaration),
      hazardReductionDecision(location, date, strHrbDeclaration),
    ];
  });
}

export function parseValleyBurnDeclarations(today: unknown, tomorrow: unknown, now: Date) {
  const earlier = valleyDecisions(today);
  const later = valleyDecisions(tomorrow);
  if (earlier[0].date >= later[0].date) throw new Error("Valley Air: out-of-order forecast dates");
  return dailyStatusRows(valleyMeta, PACIFIC, [...earlier, ...later], now);
}

export const valleyAirBurnDeclarations: ActiveSource = {
  ...valleyMeta, mode: "positive-only", coverage: "restrictions",
  reportingFips: californiaFootprint([...valleyAreas.values()].map(({ county }) => county)),
  cadence: { kind: "daily", zone: PACIFIC, hours: [0, 9, 15, 18] },
  staleMs: 30 * 60 * 60 * 1000,
  async fetch({ now }) {
    const get = pacedTextReader({ headers: { accept: "application/json" } });
    const today: unknown = JSON.parse(await get(valleyUrl));
    const tomorrow: unknown = JSON.parse(await get(valleyTomorrow));
    return { rows: parseValleyBurnDeclarations(today, tomorrow, now) };
  },
};

const sacramentoPage = "https://www.airquality.org/ProgramCoordination/Pages/Check-Before-You-Burn.aspx";
const sacramentoData = "https://sonomatech-production.s3.amazonaws.com/sacramento/airquality_org/cbyb-widget/";
const sacramentoMeta = {
  id: "ca-sacramento-wood-burning", state: "CA", scope: "part", stack: "SharePoint / S3 JSON",
  sourceName: "Sacramento Metropolitan Air Quality Management District", sourceUrl: sacramentoData + "script.js", officialUrl: sacramentoPage,
} as const;
const sacramentoCalendar = z.object({
  burn_history: z.object({ dates: z.record(z.iso.date(), z.number().int()) }),
});

export function sacramentoWoodSmokeUrl(date: string) {
  const year = Number(date.slice(0, 4)) - Number(date.slice(5, 7) < "11");
  return `${sacramentoData}burncheckHistoric_${year}-${year + 1}.txt`;
}

export function parseSacramentoWoodSmoke(json: unknown, now: Date) {
  const { date } = localClock(now, PACIFIC);
  if (!winterWoodSmokeDate(date)) return [];
  const code = sacramentoCalendar.parse(json).burn_history.dates[date];
  if (code === undefined) throw new Error("Sacramento: no current dated wood-burning decision");
  const base = { date, county: "Sacramento", scopeNote: "Sacramento County, wood and solid-fuel burning covered by Rule 421" };
  let decision: DailyDecision;
  switch (code) {
    case 6:
    case 7:
      decision = { ...base, status: "allowed" };
      break;
    case 8:
      decision = {
        ...base, status: "restricted", label: "Stage 1 wood and solid-fuel restrictions",
        note: "The district limits burning to qualifying EPA-certified wood-burning devices and pellet stoves with no visible smoke. Follow Rule 421 and its exemptions.",
      };
      break;
    case 9:
      decision = {
        ...base, status: "ban", label: "Stage 2 wood and solid-fuel prohibition",
        note: "The district prohibits covered solid fuels, including wood, manufactured logs and pellets. Check Rule 421 for applicable exemptions.",
      };
      break;
    default:
      throw new Error("Sacramento: unrecognized wood-burning decision");
  }
  return dailyStatusRows(sacramentoMeta, PACIFIC, [decision], now);
}

export const sacramentoWoodSmoke: ActiveSource = {
  ...sacramentoMeta, coverage: "restrictions", mode: "positive-only",
  reportingFips: californiaFootprint(["Sacramento"]),
  cadence: { kind: "daily", zone: PACIFIC, hours: [13, 16, 20] },
  staleMs: 30 * 60 * 60 * 1000,
  async fetch({ now }) {
    const { date } = localClock(now, PACIFIC);
    if (!winterWoodSmokeDate(date)) return { rows: [] };
    const text = await getText(sacramentoWoodSmokeUrl(date), { headers: { accept: "application/json, text/plain" } });
    return { rows: parseSacramentoWoodSmoke(JSON.parse(text), now) };
  },
};
