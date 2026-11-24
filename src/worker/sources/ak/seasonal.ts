import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarDayWindows, type CalendarRule } from "../lib/calendar";
import { US_ZONES } from "../lib/dates";
import { sha256 } from "../lib/hash";
import { extractHtml } from "../lib/html";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";

const PERMITS = CALENDAR_RULES.AK;
const WINTER = CALENDAR_RULES.AK_WINTER;
const COUNTIES = countiesInState("AK");
const ALEUTIANS_WEST = "02016"; // The census area straddles the 49 CFR § 71.12 time-zone boundary.
const WINTER_AREAS = new Map([
  ["02090", "Fairbanks and North Pole PM2.5 nonattainment area"],
  ["02110", "Mendenhall Valley wood smoke control area"],
]);
const basis = (file: "statutes" | "aac", start: string, end = start) =>
  `https://www.akleg.gov/basis/${file}.asp?media=print&secStart=${start}&secEnd=${end}`;
const PERMIT_REGULATION = basis("aac", "11.95.412");
const AIR_AREAS = basis("aac", "18.50.015", "18.50.025");

const PERMIT_SOURCE = {
  id: "ak-dnr-fire-season", stack: "Alaska BASIS / statute calendar",
  sourceName: "Alaska Division of Forestry & Fire Protection (AS 41.15.050 and 11 AAC 95.412)",
  sourceUrl: basis("statutes", "41.15.050"), officialUrl: PERMITS.officialUrl,
};
const WINTER_SOURCE = {
  id: "ak-dec-winter-open-burning", stack: "Alaska BASIS / regulation calendar",
  sourceName: "Alaska Department of Environmental Conservation (18 AAC 50.065(f))",
  sourceUrl: basis("aac", "18.50.065"), officialUrl: WINTER.officialUrl,
};

// Confirm the reviewed law and geography before publishing any calendar windows.
async function verifyLaw(html: string, sections: readonly string[], hash: string) {
  const { blocks } = await extractHtml(html);
  const texts = blocks.map(({ text }) => text).filter((text) => sections.some((section) => text.startsWith(section)));
  if (texts.length !== sections.length || await sha256(texts.join("\n")) !== hash) {
    throw new Error(`Alaska BASIS: changed or missing ${sections.join(", ")}`);
  }
}

type Area = { fips: string; name: string; scopeNote?: string };
function calendarRows(rule: CalendarRule, source: typeof PERMIT_SOURCE, areas: Area[], now: Date): CountyStatus[] {
  const { state, scope, status, label, note } = rule;
  const { id: sourceId, sourceName, sourceUrl, officialUrl } = source;
  const checked = now.toISOString();
  return calendarDayWindows(rule, now).flatMap((window) => areas.map(({ fips, name, scopeNote = rule.scopeNote }) => ({
    ...window, fips, county: name, state, scope, status, label, note, scopeNote,
    sourceId, sourceName, sourceUrl, officialUrl, checked, sourceUpdated: null, since: null, expires: null,
  })));
}

const MAIN_PERMIT_AREAS = COUNTIES.map((county) => county.fips === ALEUTIANS_WEST
  ? { ...county, scopeNote: `${PERMITS.scopeNote} in the Alaska time zone` }
  : county);
const WESTERN_ALEUTIAN_AREAS = COUNTIES.filter(({ fips }) => fips === ALEUTIANS_WEST)
  .map((county) => ({ ...county, scopeNote: `${PERMITS.scopeNote} in the Hawaii–Aleutian time zone` }));
const WINTER_COUNTIES = COUNTIES.flatMap((county) => {
  const scopeNote = WINTER_AREAS.get(county.fips);
  return scopeNote ? [{ ...county, scopeNote }] : [];
});

export async function parseAlaskaFireSeason(statute: string, permits: string, now: Date): Promise<CountyStatus[]> {
  await verifyLaw(statute, ["Sec. 41.15.050."], "15e4362b6b949ca30e2c5dfc2d15b205426f582a3a0e12615ebc9f26d9ce223b");
  await verifyLaw(permits, ["11 AAC 95.412."], "0542834c4c4130554bd17ca3cc25c4d43535b3eb1226f011073027ef066f23dc");
  return [
    ...calendarRows(PERMITS, PERMIT_SOURCE, MAIN_PERMIT_AREAS, now),
    ...calendarRows({ ...PERMITS, zone: US_ZONES.Aleutian }, PERMIT_SOURCE, WESTERN_ALEUTIAN_AREAS, now),
  ];
}

export async function parseAlaskaWinterBurning(regulation: string, areas: string, now: Date): Promise<CountyStatus[]> {
  await verifyLaw(regulation, ["18 AAC 50.065."], "f0f36531d9cef1c1afa67ffd88597ac66680b98d03ef5d9b234a13d02725b473");
  await verifyLaw(areas, ["18 AAC 50.015.", "18 AAC 50.025."], "6b4da765638b194ad9192a30b0fa1d06c460da165e6dc5694e348354321fce04");
  return calendarRows(WINTER, WINTER_SOURCE, WINTER_COUNTIES, now);
}

const recurring = { state: "AK", scope: "part", coverage: "restrictions", mode: "positive-only", recurring: true } as const;
const options = { headers: { accept: "text/html" }, maxBytes: 64_000 };

export const akDnrFireSeason: ActiveSource = {
  ...PERMIT_SOURCE, ...recurring,
  cadence: { kind: "daily", zone: US_ZONES.Alaska, hours: [0, 1] },
  async fetch({ now }) {
    if (!calendarDayWindows(PERMITS, now).length &&
        !calendarDayWindows({ ...PERMITS, zone: US_ZONES.Aleutian }, now).length) return { rows: [] };
    const read = pacedTextReader(options);
    return { rows: await parseAlaskaFireSeason(await read(PERMIT_SOURCE.sourceUrl), await read(PERMIT_REGULATION), now) };
  },
};

export const akDecWinterBurning: ActiveSource = {
  ...WINTER_SOURCE, ...recurring,
  cadence: { kind: "daily", zone: US_ZONES.Alaska, hours: [0] },
  async fetch({ now }) {
    if (!calendarDayWindows(WINTER, now).length) return { rows: [] };
    const read = pacedTextReader(options);
    return { rows: await parseAlaskaWinterBurning(await read(WINTER_SOURCE.sourceUrl), await read(AIR_AREAS), now) };
  },
};
