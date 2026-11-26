import { countyByName } from "../../counties";
import { dailyStatusRows, type DailyDecision } from "../lib/daily-status";
import { localClock, parseUsDate, shiftDay, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";
import { pacedTextReader } from "../lib/http";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Mountain;
const FORM_URL = "https://air.utah.gov/OpenBurning/form/index.php?e=application";
export const UT_PERMIT_CONFIG_URL = "https://air.utah.gov/OpenBurning/form/js/county.php";
const META = {
  id: "ut-daq-local-open-burn-permits", state: "UT", scope: "part",
  stack: "PHP / permit form and literal JavaScript data",
  sourceName: "Utah Division of Air Quality Open Burning Permit System",
  sourceUrl: FORM_URL, officialUrl: FORM_URL,
} as const;

const unincorporated = (name: string) => `${name} County (Unincorporated OR Outside City Limits)`;
const PERMIT_AREAS = [
  ["Beaver", unincorporated("Beaver"), "Unincorporated Beaver County"],
  ["Emery", "Castle Dale", "Castle Dale city limits"],
  ["Grand", unincorporated("Grand"), "Unincorporated Grand County"],
  ["Iron", unincorporated("Iron"), "Unincorporated Iron County"],
  ["Piute", unincorporated("Piute"), "Unincorporated Piute County"],
  ["Sevier", "Richfield", "Richfield city limits"],
  ["Washington", unincorporated("Washington"), "Unincorporated Washington County"],
] as const;

const FIELDS = [
  "Menu", "County", "AllowBurn", "OpenBurnPermit", "ClearingIndexAirShed",
  "ValidStart1", "ValidEnd1", "ClearingIndex1", "ValidStart2", "ValidEnd2", "ClearingIndex2",
  "ValidStart3", "ValidEnd3", "ClearingIndex3", "ValidStart4", "ValidEnd4", "ClearingIndex4",
];
const FIELD = new RegExp(`^[ \\t]*'(${FIELDS.join("|")})': '([^'\\r\\n]*)',?\\r?$`, "gm");

function permitAreas(config: string) {
  if (!/^var burnPermits\s*=\s*\[/.test(config)) throw new Error("Utah DAQ: missing permit directory");
  const menus = new Set<string>(PERMIT_AREAS.map(([, menu]) => menu));
  const found = new Map<string, ReadonlyMap<string, string>>();
  // The public configuration is a JavaScript literal. Read only the named
  // permit fields. The remainder includes contact details and is unused.
  for (const [, object] of config.matchAll(/^\t\t\{\r?\n([\s\S]*?)^\t\t\},?\r?$/gm)) {
    const menu = /^[ \t]*'Menu': '([^'\r\n]*)',?\r?$/m.exec(object)?.[1];
    if (!menu || !menus.has(menu)) continue;
    const fields = [...object.matchAll(FIELD)].map(([, key, value]) => [key, value] as const);
    const values = new Map(fields);
    if (fields.length !== FIELDS.length || values.size !== FIELDS.length || found.has(menu)) {
      throw new Error(`Utah DAQ: incomplete or duplicate permit configuration for ${menu}`);
    }
    found.set(menu, values);
  }
  if (found.size !== menus.size) throw new Error("Utah DAQ: permit area missing");
  return found;
}

async function dailyClearingIndex(html: string, today: string) {
  const rows = await extractHtmlGrid(html, {
    row: "#permits table tr", cell: "#permits table tr > th", spaceLineBreaks: true,
  });
  const [days, ...extra] = rows.filter((row) => row.length);
  const names = ["Today", "Tomorrow", "Following"];
  if (extra.length || days?.length !== names.length || days.some(({ text }, index) => {
    const match = /^(Today|Tomorrow|Following) \(([^)]+)\)$/.exec(text);
    return !match || match[1] !== names[index] || parseUsDate(match[2]) !== shiftDay(today, index);
  })) throw new Error("Utah DAQ: stale or malformed clearing-index dates");

  const [literal, ...duplicates] = html.matchAll(/^ var clearingIndex = \{\r?\n([\s\S]+?)\};[ \t]*$/gm);
  if (!literal || duplicates.length) throw new Error("Utah DAQ: expected one clearing-index report");
  const found = new Map<string, number>();
  for (const line of literal[1].trim().split(/\r?\n/)) {
    const row = /^\s*shed([1-9]\d?): \{ today: (-?\d{1,4}), tomorrow: -?\d{1,4}, following: -?\d{1,4}\},?\s*$/.exec(line);
    if (!row || found.has(row[1])) throw new Error("Utah DAQ: malformed or duplicate airshed reading");
    found.set(row[1], Number(row[2]));
  }
  return found;
}

function dailyThreshold(fields: ReadonlyMap<string, string>, today: string, menu: string) {
  const year = Number(today.slice(0, 4));
  const thresholds: number[] = [];
  for (const slot of [1, 2, 3, 4]) {
    const start = fields.get(`ValidStart${slot}`);
    const end = fields.get(`ValidEnd${slot}`);
    if (!start && !end) continue;
    const from = parseUsDate(start ?? "", year);
    const through = parseUsDate(end ?? "", year);
    const raw = fields.get(`ClearingIndex${slot}`) ?? "";
    const threshold = raw === "" || raw === "0" ? 500 : Number(raw);
    if (!from || !through || through < from || (raw && !/^\d{1,4}$/.test(raw)) || threshold < 1 || threshold > 1000) {
      throw new Error(`Utah DAQ: invalid permit window for ${menu}`);
    }
    if (today >= from && today <= through) thresholds.push(threshold);
  }
  if (thresholds.length > 1) throw new Error(`Utah DAQ: overlapping permit windows for ${menu}`);
  return thresholds[0];
}

export async function parseUtahPermitConditions(html: string, config: string, now: Date) {
  const { date: today } = localClock(now, ZONE);
  const readings = await dailyClearingIndex(html, today);
  const areas = permitAreas(config);
  const decisions: DailyDecision[] = [];
  for (const [county, menu, geography] of PERMIT_AREAS) {
    const row = areas.get(menu);
    const allow = row?.get("AllowBurn");
    const open = row?.get("OpenBurnPermit");
    const shed = row?.get("ClearingIndexAirShed");
    if (row?.get("County") !== county || (allow !== "0" && allow !== "1") || (open !== "0" && open !== "1") || !shed) {
      throw new Error(`Utah DAQ: invalid permit geography or codes for ${menu}`);
    }
    const reading = readings.get(shed);
    if (reading === undefined) throw new Error(`Utah DAQ: missing airshed ${shed} for ${menu}`);
    const base = { date: today, county, scopeNote: `Residential open burning covered by DAQ online permits in ${geography}` };
    // Several unincorporated jurisdictions route closed-season applicants to the
    // fire warden. A missing or disabled online permit does not establish a ban.
    const threshold = allow === "1" && open === "1" && (today.slice(5) < "06-01" || today.slice(5) > "10-31")
      ? dailyThreshold(row, today, menu) : undefined;
    if (threshold === undefined || reading < 0) {
      decisions.push({ ...base, status: "pending" });
    } else if (reading < threshold) {
      decisions.push({
        ...base, status: "restricted", label: "Clearing index too low for residential open burning",
        note: `The DAQ permit system lists airshed ${shed} at ${reading} today, below the ${threshold} required for this residential burn permit. See the permit system for local conditions and other types of burning.`,
      });
    } else {
      decisions.push({ ...base, status: "allowed" });
    }
  }
  return dailyStatusRows(META, ZONE, decisions, now);
}

const MAX_AGE = 12 * 3_600_000;
export const utDaqLocalOpenBurnPermits: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", staleMs: MAX_AGE,
  reportingFips: [...new Set(PERMIT_AREAS.flatMap(([name]) => countyByName(META.state, name)?.fips ?? []))],
  cadence: { kind: "daily", zone: ZONE, hours: [2, 8, 14, 20] },
  async fetch({ now }) {
    const read = pacedTextReader({
      headers: { "cache-control": "no-cache" }, maxBytes: 450_000, maxResponseAgeMs: MAX_AGE,
    });
    const config = await read(UT_PERMIT_CONFIG_URL);
    const html = await read(FORM_URL);
    return { rows: await parseUtahPermitConditions(html, config, now) };
  },
};
