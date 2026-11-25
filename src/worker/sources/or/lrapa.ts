import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { syncfusionGridRows } from "../lib/aspnet";
import { atLocalTime, localClock, localDayWindow, parseLocalDateTime, parseUsDate, shiftDay, US_ZONES } from "../lib/dates";
import { extractHtml, htmlText } from "../lib/html";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const PACIFIC = US_ZONES.Pacific;
const META = {
  state: "OR", stack: "ASP.NET MVC / Syncfusion embedded JSON", sourceName: "Lane Regional Air Protection Agency",
  scope: "part", coverage: "restrictions", mode: "positive-only", staleMs: 30 * 3_600_000,
  reportingFips: ["41039"],
} satisfies Pick<ActiveSource, "state" | "stack" | "sourceName" | "scope" | "coverage" | "mode" | "staleMs" | "reportingFips">;
const outdoor = {
  ...META,
  id: "or-lrapa-outdoor",
  sourceUrl: "https://aqi.lrapa-or.gov/BybBlckMstRcnt/Index",
  officialUrl: "https://www.lrapa-or.gov/air-quality-protection/burning-overview/outdoor-burning/#current-restrictions",
};
const heating = {
  ...META,
  id: "or-lrapa-wood-heating",
  sourceUrl: "https://aqi.lrapa-or.gov/HwhBlckMstRcnt/Index",
  officialUrl: "https://www.lrapa-or.gov/air-quality-protection/burning-overview/wood-heating/",
};

const outdoorAreas = new Map([
  ["CoastalLaneCo", ["Coastal Lane County", "Coastal Lane County"]],
  ["ElsewhereLaneCo", ["Elsewhere in Lane Co.", "Elsewhere in Lane County as mapped by LRAPA"]],
  ["Eugene", ["Eugene", "Eugene city limits"]],
  ["Eugene UGB", ["Eugene UGB", "Eugene urban growth boundary outside city limits"]],
  ["Florence", ["Florence", "Florence city limits"]],
  ["Oakridge", ["Oakridge & UGB", "Oakridge and its urban growth boundary"]],
  ["SpringfieldUGB", ["Springfield & UGB", "Springfield and its urban growth boundary"]],
]);
const heatingAreas = new Map([
  ["EugeneSpringfield", ["Eugene/Springfield", "Eugene, Springfield and their urban growth boundaries"]],
  ["Oakridge", ["Oakridge", "Oakridge and its urban growth boundary"]],
]);

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
const outdoorLevel = z.enum(["Allowed", "Prohibited"]);
const heatingLevel = z.enum(["Allowed", "Caution", "Prohibited"]);
const outdoorGrid = z.array(z.object({
  AdvisoryAreaCd: z.string(),
  AdvisoryAreaNm: z.string(),
  BackyardBurnAdvisoryBlockId: z.number().int().positive(),
  BackyardBurnAdvisoryBlockAdvisoryDate: localDateTime,
  BackyardBurnAdvisoryBlockDatetimeStart: localDateTime,
  BackyardBurnAdvisoryLevelCd: outdoorLevel,
  BackyardBurnAdvisoryLevelNm: outdoorLevel,
  BackyardBurnAdvisoryMessage: z.string().nullable(),
  BackyardBurnAdvisoryTimeStart: z.string().nullable(),
  BackyardBurnAdvisoryTimeStop: z.string().nullable(),
  BYBAdvisoryDisplay: z.string(),
})).length(outdoorAreas.size);
const heatingGrid = z.array(z.object({
  HWHAreaCd: z.string(),
  HWHAreaNm: z.string(),
  HWHBlckId: z.number().int().positive(),
  HWHBlckDtFor: localDateTime,
  HWHBlckPblshDttm: localDateTime,
  HWHLevelCd: heatingLevel,
  HWHLevelNm: heatingLevel,
})).length(heatingAreas.size);

async function advisoryDate(html: string, title: string, now: Date) {
  const matching = (await extractHtml(html)).blocks.filter(({ tag, text }) => tag === "h5" && text.startsWith(title));
  const day = parseUsDate(matching[0]?.text.slice(title.length) ?? "");
  const today = localClock(now, PACIFIC).date;
  if (matching.length !== 1 || !day || (day !== today && day !== shiftDay(today, 1))) {
    throw new Error(`LRAPA: missing or stale ${title.trim()}`);
  }
  return day;
}

function reportStamp(published: string, now: Date, window: { validFrom: string; validUntil: string }) {
  const sourceUpdated = parseLocalDateTime(published, PACIFIC);
  const checked = now.toISOString();
  if (!sourceUpdated || sourceUpdated > checked || sourceUpdated >= window.validUntil ||
      checked >= window.validUntil || Date.parse(window.validUntil) - Date.parse(sourceUpdated) > META.staleMs) {
    throw new Error("LRAPA: invalid or stale advisory publication time");
  }
  return { ...window, sourceUpdated, checked };
}

function burnHour(time: string | null) {
  const match = /^([01]\d|2[0-3]):([0-5]\d):00$/.exec(time ?? "");
  if (!match) throw new Error("LRAPA: invalid yard-debris burn hours");
  const [, hour, minute] = match;
  return `${Number(hour) % 12 || 12}${minute === "00" ? "" : `:${minute}`} ${Number(hour) < 12 ? "AM" : "PM"}`;
}

export async function parseLrapaOutdoor(html: string, now: Date): Promise<CountyStatus[]> {
  const day = await advisoryDate(html, "Outdoor Burning Advisory for ", now);
  const rows = outdoorGrid.parse(syncfusionGridRows(html));
  const first = rows[0];
  const stamp = reportStamp(first.BackyardBurnAdvisoryBlockDatetimeStart, now, localDayWindow(day, PACIFIC));
  const seen = new Set<string>();
  return rows.map((row) => {
    const area = outdoorAreas.get(row.AdvisoryAreaCd);
    const level = row.BackyardBurnAdvisoryLevelCd;
    if (!area || seen.has(row.AdvisoryAreaCd) || area[0] !== row.AdvisoryAreaNm ||
        row.BackyardBurnAdvisoryBlockId !== first.BackyardBurnAdvisoryBlockId ||
        row.BackyardBurnAdvisoryBlockDatetimeStart !== first.BackyardBurnAdvisoryBlockDatetimeStart ||
        row.BackyardBurnAdvisoryBlockAdvisoryDate !== `${day}T00:00:00` || row.BackyardBurnAdvisoryLevelNm !== level) {
      throw new Error("LRAPA: inconsistent yard-debris advisory rows");
    }
    seen.add(row.AdvisoryAreaCd);
    const prohibited = level === "Prohibited";
    const start = row.BackyardBurnAdvisoryTimeStart;
    const stop = row.BackyardBurnAdvisoryTimeStop;
    if (prohibited ? row.BYBAdvisoryDisplay !== "Prohibited" :
      !row.BYBAdvisoryDisplay.startsWith("Allowed ") || !start || !stop || start >= stop) {
      throw new Error("LRAPA: conflicting yard-debris decision or hours");
    }
    const label = prohibited ? "Yard debris burning prohibited" :
      `Yard debris burning limited to ${burnHour(start)}–${burnHour(stop)} Pacific`;
    const message = htmlText(row.BackyardBurnAdvisoryMessage ?? "").replace(/\.$/, "");
    return {
      fips: "41039", county: "Lane County", state: outdoor.state, sourceId: outdoor.id, scope: outdoor.scope,
      status: prohibited ? "ban" : "restricted", scopeNote: `${area[1]}, residential woody yard debris`, label,
      note: `LRAPA's ${day} decision applies to residential woody yard debris. ${message ? `${message}. ` : ""}Check the local fire district for permits and other restrictions.`,
      since: day, expires: day, ...stamp, sourceName: outdoor.sourceName, sourceUrl: outdoor.sourceUrl, officialUrl: outdoor.officialUrl,
    };
  });
}

export async function parseLrapaHeating(html: string, now: Date): Promise<CountyStatus[]> {
  const day = await advisoryDate(html, "Home Wood Heating Advisory for ", now);
  const rows = heatingGrid.parse(syncfusionGridRows(html));
  const first = rows[0];
  const start = shiftDay(day, -1);
  const validFrom = atLocalTime(start, 16 * 60, PACIFIC);
  const validUntil = atLocalTime(day, 16 * 60, PACIFIC);
  if (!validFrom || !validUntil || !first.HWHBlckPblshDttm.startsWith(`${start}T`)) {
    throw new Error("LRAPA: invalid wood heating advisory window");
  }
  const stamp = reportStamp(first.HWHBlckPblshDttm, now, { validFrom, validUntil });
  const inSeason = start.slice(5) >= "10-01" || start.slice(5) <= "05-31";
  const seen = new Set<string>();
  return rows.flatMap((row): CountyStatus[] => {
    const area = heatingAreas.get(row.HWHAreaCd);
    const level = row.HWHLevelCd;
    if (!area || seen.has(row.HWHAreaCd) || area[0] !== row.HWHAreaNm || row.HWHBlckId !== first.HWHBlckId ||
        row.HWHBlckPblshDttm !== first.HWHBlckPblshDttm || row.HWHBlckDtFor !== `${day}T00:00:00` || row.HWHLevelNm !== level) {
      throw new Error("LRAPA: inconsistent wood heating advisory rows");
    }
    seen.add(row.HWHAreaCd);
    if (!inSeason || level === "Allowed") return [];
    const red = level === "Prohibited";
    return [{
      fips: "41039", county: "Lane County", state: heating.state, sourceId: heating.id, status: "restricted",
      scope: heating.scope, scopeNote: area[1],
      label: red ? "Red advisory limits wood heating and prohibits recreational fires" : "Yellow advisory prohibits recreational fires",
      note: red
        ? "Visible smoke from home wood heating is prohibited, subject to approved exemptions. LRAPA also prohibits recreational fires during this advisory."
        : "LRAPA prohibits recreational fires during this advisory and asks residents to use other forms of heat if possible.",
      since: start, expires: day, ...stamp, sourceName: heating.sourceName, sourceUrl: heating.sourceUrl, officialUrl: heating.officialUrl,
    }];
  });
}

export const orLrapaOutdoor: ActiveSource = {
  ...outdoor,
  // LRAPA publishes the next day's decision at 7 p.m. Keep today's report through local midnight.
  cadence: { kind: "daily", zone: PACIFIC, hours: [0, 8, 18] },
  async fetch({ now }) {
    return { rows: await parseLrapaOutdoor(await getText(outdoor.sourceUrl, { maxBytes: 100_000 }), now) };
  },
};

export const orLrapaHeating: ActiveSource = {
  ...heating,
  cadence: { kind: "daily", zone: PACIFIC, hours: [16, 17] },
  async fetch({ now }) {
    return { rows: await parseLrapaHeating(await getText(heating.sourceUrl, { maxBytes: 100_000 }), now) };
  },
};
