import type { CountyStatus } from "../../../shared/types";
import { dailyStatusRows, type DailyDecision } from "../lib/daily-status";
import { atLocalTime, localClock, localDayWindow, parseLocalDateTime, parseUsDate, parseWeekdayDate, shiftDay, US_ZONES } from "../lib/dates";
import { elementorPageBlocks } from "../lib/elementor";
import { parseCsv } from "../lib/feeds";
import { blockAfterHeading, extractHtml, htmlStatusBlocks } from "../lib/html";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const zone = US_ZONES.Pacific;
const umatillaUrl = "https://umatillacounty.gov/departments/community-development/agricultural-and-residential-burning";
const crookUrl = "https://crookcountyfireandrescue.com/";
const unionUrl = "https://unioncountyor.gov/smoke/burnlog.php";
const multnomahUrl = "https://multco.us/info/wood-burning-restrictions";
const umatilla = {
  id: "or-umatilla-burn-day", state: "OR", sourceName: "Umatilla County Community Development",
  sourceUrl: umatillaUrl, officialUrl: umatillaUrl, stack: "TYPO3 / HTML", reportingFips: ["41059"],
};
const crook = {
  id: "or-crook-burn-day", state: "OR", sourceName: "Crook County Fire & Rescue",
  sourceUrl: crookUrl, officialUrl: crookUrl, stack: "WordPress / Elementor", reportingFips: ["41013"],
};
const union = {
  id: "or-union-smoke-line", state: "OR", sourceName: "Union County Smoke Management",
  sourceUrl: "https://unioncountyor.gov/smoke/burnlog.csv", officialUrl: unionUrl,
  stack: "PHP / CSV", reportingFips: ["41061"],
};
const multnomah = {
  id: "or-multnomah-wood-smoke", state: "OR", sourceName: "Multnomah County Health Department",
  sourceUrl: multnomahUrl, officialUrl: multnomahUrl + "#section-1",
  stack: "Drupal / HTML", reportingFips: ["41051"],
};

type DailyPublisher = Pick<ActiveSource, "id" | "state" | "sourceName" | "sourceUrl" | "officialUrl" | "stack" | "reportingFips">;

function dailyPublisher(publisher: DailyPublisher, hours: readonly [number, ...number[]],
  parse: (text: string, now: Date) => CountyStatus[] | Promise<CountyStatus[]>, maxBytes: number): ActiveSource {
  return {
    ...publisher, scope: "part", mode: "positive-only", coverage: "restrictions",
    cadence: { kind: "daily", zone, hours }, pollGroup: "or-local-observations", staleMs: 30 * 3_600_000,
    async fetch({ now }) {
      return { rows: await parse(await getText(publisher.sourceUrl, { maxBytes }), now) };
    },
  };
}

export async function parseUmatillaBurnDay(input: string | Response, now: Date) {
  const blocks = await htmlStatusBlocks(input, "main#page-content", ".well > h2, .well > p");
  const heading = "UMATILLA COUNTY BURN INFO";
  const start = blocks.indexOf(heading);
  const [dateText, decision, update] = blocks.slice(start + 1, start + 4);
  const year = dateText && /, (\d{4})$/.exec(dateText);
  const dates = year && dateText.slice(0, -year[0].length).split(/\s+(?:&|and|through|–)\s+/i)
    .map((day) => parseWeekdayDate(day, Number(year[1])));
  const updated = /^Updated on (.+?) BURN LINE:/i.exec(update ?? "");
  const sourceUpdated = updated && parseLocalDateTime(updated[1], zone);
  const { date: today } = localClock(now, zone);
  const first = dates && dates[0];
  const last = dates && dates.at(-1);
  const inclusiveRange = /\s+(?:through|–)\s+/i.test(dateText ?? "");
  if (start < 0 || blocks.lastIndexOf(heading) !== start || !first || !last || dates.some((day) => !day) ||
      dates.length > 2 || last < first || last > shiftDay(first, 4) ||
      !(inclusiveRange ? today >= first && today <= last : dates.includes(today)) ||
      !sourceUpdated || sourceUpdated > now.toISOString() || sourceUpdated < localDayWindow(first, zone).validFrom) {
    throw new Error("Umatilla: missing or stale dated burn day");
  }
  const ban = /^(?:IS|ARE) NOT A BURN DAY[S]?[.!]?$/i.test(decision ?? "");
  if (!ban && !/^(?:IS|ARE) (?:A )?BURN DAY[S]?[.!]?$/i.test(decision ?? "")) {
    throw new Error("Umatilla: unrecognized burn day");
  }
  // Even a county-designated burn day remains subject to the applicable permit and fire district rules.
  const tomorrow = shiftDay(today, 1);
  const days = (inclusiveRange ? tomorrow <= last : dates.includes(tomorrow)) ? [today, tomorrow] : [today];
  return dailyStatusRows(umatilla, zone, days.map((date): DailyDecision => ({
    date, county: "Umatilla", scopeNote: "Open burning under Umatilla County's burn permit program",
    status: ban ? "ban" : "restricted",
    label: ban ? "Umatilla County no-burn day" : "Umatilla County open burning requires a permit",
    note: "The county posts the decision for burning covered by its permit program. Check the county burn line at 541-278-6397 and any city, fire district, tribal or forestry rules for your address.",
  })), now).map((row) => ({ ...row, sourceUpdated, validFrom: row.validFrom! > sourceUpdated ? row.validFrom : sourceUpdated }));
}

const crookChoices = {
  "No Burn Day": ["No burning allowed.", "ban", "Outdoor debris burning prohibited"],
  "Restricted Burn Day": ["Burn barrels are allowed from 9am until 12 noon in accordance with the burn regulations.", "restricted",
    "Only burn barrels allowed, 9 a.m. to noon"],
  "Regulated Burn Day": ["Burn barrels and debris piles are allowed from 9am until sunset in accordance with the burn regulations.", "restricted",
    "Burn barrels and debris piles limited to 9 a.m. to sunset"],
} as const;

export async function parseCrookBurnDay(input: string | Response, now: Date) {
  const section = ".elementor-element-1f10005";
  const [heading, dateText, title, description, ...extra] = await elementorPageBlocks(
    input, 74, `${section} h2, ${section} p, ${section} h3, ${section} .elementor-cta__description`,
    { section, hiddenWidgets: ".ae-visibility-hidden" },
  );
  const date = parseUsDate(dateText ?? "");
  const choice = Object.hasOwn(crookChoices, title) ? crookChoices[title as keyof typeof crookChoices] : undefined;
  if (heading !== "Today's Outdoor Burning Information" || date !== localClock(now, zone).date || extra.length ||
      !choice || description !== choice[0]) {
    throw new Error("Crook: missing, stale or unrecognized daily burning panel");
  }
  return dailyStatusRows(crook, zone, [{
    county: "Crook", date, scopeNote: "Outdoor burning in the Crook County Fire & Rescue service area",
    status: choice[1], label: choice[2],
    note: "Crook County Fire & Rescue's daily determination covers debris piles and burn barrels in its service area. Check the burn line at 541-447-2876 for updates and permit requirements.",
  }], now);
}

export function parseUnionSmokeLine(csv: string, now: Date) {
  // The public history is newest first. Today's decision, if issued, is its first row.
  const [header, record] = parseCsv(csv.split(/\r?\n/, 2).join("\n"));
  if (header?.join(",") !== "Date_Time,Error_Level,Morning_Burn,Afternoon_Burn,UC_Ban,Decision Data" || record?.length !== 6) {
    throw new Error("Union: unrecognized smoke-line history");
  }
  const [stamp, error, morning, afternoon, closure] = record;
  const clock = /^([a-z]{3} [a-z]{3}\s+\d{1,2}) (\d{2}:\d{2}:\d{2}) (AM|PM) (PST|PDT) (\d{4})$/i.exec(stamp);
  const date = clock && parseWeekdayDate(`${clock[1]}, ${clock[5]}`);
  const sourceUpdated = clock && date && parseLocalDateTime(`${date} ${clock[2]} ${clock[3]}`, zone);
  if (!clock || !date || !sourceUpdated || date !== localClock(now, zone).date || sourceUpdated > now.toISOString() ||
      clock[4] !== (localDayWindow(date, zone).validUntil.endsWith("T08:00:00.000Z") ? "PST" : "PDT")) {
    throw new Error("Union: no current smoke-line decision");
  }
  const decision = morning + afternoon;
  if (error !== "0" || !/^[01]{2}$/.test(decision) || !/^[01]$/.test(closure) || (closure === "1" && decision !== "00")) {
    throw new Error("Union: unrecognized or errored smoke-line decision");
  }
  const morningOnly = decision === "10";
  const afternoonOnly = decision === "01";
  const label = decision === "00" ? "Union County Smoke Line: no open burning today"
    : morningOnly ? "Union County Smoke Line: morning burning only"
    : afternoonOnly ? "Union County Smoke Line: afternoon burning only"
    : "Union County requires a same-day open-burning permit";
  return dailyStatusRows(union, zone, [{
    county: "Union", date, scopeNote: "Open burning outside incorporated city limits under Union County Ordinance 2024-02",
    status: decision === "00" ? "ban" : "restricted", label,
    note: "The county Smoke Line governs covered open burning outside city limits. Where burning is authorized, follow Ordinance 2024-02 and check the day’s conditions at 541-963-4040. Separate rules apply to exempt uses.",
  }], now).map((row) => ({ ...row, sourceUpdated, validFrom: sourceUpdated }));
}

export async function parseMultnomahWoodSmoke(input: string | Response, now: Date) {
  const panel = blockAfterHeading((await extractHtml(input)).blocks, "Can I Burn Today?", { requireUnique: true });
  const updates = panel.map(({ text }) => /^Last update:\s+(.+)$/i.exec(text)).filter(Boolean);
  const marker = panel.findIndex(({ text }) => text === "Wood burning status:");
  const decision = panel[marker + 1]?.text ?? "";
  const today = localClock(now, zone).date;
  const yesterday = shiftDay(today, -1);
  const stamp = updates[0]?.[1];
  const sourceUpdated = stamp && [today, yesterday].map((day) => {
    const instant = parseLocalDateTime(stamp, zone, Number(day.slice(0, 4)));
    return instant && localClock(new Date(instant), zone).date === day ? instant : null;
  }).find(Boolean);
  if (updates.length !== 1 || marker < 0 || panel.findLastIndex(({ text }) => text === "Wood burning status:") !== marker ||
      !sourceUpdated || sourceUpdated > now.toISOString()) {
    throw new Error("Multnomah: missing or stale wood-burning advisory");
  }
  const date = localClock(new Date(sourceUpdated), zone).date;
  const validFrom = atLocalTime(date, 720, zone)!;
  const validUntil = atLocalTime(shiftDay(date, 1), 720, zone)!;
  if (validUntil <= now.toISOString() || sourceUpdated >= validUntil) {
    throw new Error("Multnomah: expired wood-burning advisory");
  }
  if (/^(?:No Restrictions\b|Voluntary (?:Wood[- ]Burning )?(?:Restriction|Advisory)\b|Yellow Day\b)/i.test(decision)) return [];
  if (!/^(?:(?:Red Day|Red Advisory)\b|Mandatory (?:Wood[- ]Burning )?Restriction\b)/i.test(decision)) {
    throw new Error("Multnomah: unrecognized wood-burning advisory");
  }
  return dailyStatusRows(multnomah, zone, [{
    county: "Multnomah", date: today, scopeNote: "Wood-fired heating and outdoor fires covered by Multnomah County's wood smoke ordinance",
    status: "restricted", label: "Mandatory wood-burning restriction",
    note: "Multnomah County prohibits covered fireplaces, wood stoves and outdoor wood fires on red days. Check the county for exemptions and separate fire restrictions.",
  }], now).map((row) => ({
    ...row, sourceUpdated, since: date, expires: shiftDay(date, 1),
    validFrom: sourceUpdated > validFrom ? sourceUpdated : validFrom, validUntil,
  }));
}

export const orUmatillaBurnDay = dailyPublisher(umatilla, [6, 12], parseUmatillaBurnDay, 240_000);
export const orCrookBurnDay = dailyPublisher(crook, [6, 12], parseCrookBurnDay, 750_000);
export const orUnionSmokeLine = dailyPublisher(union, [6, 12], parseUnionSmokeLine, 900_000);
export const orMultnomahWoodSmoke: ActiveSource = {
  ...dailyPublisher(multnomah, [12, 16], parseMultnomahWoodSmoke, 250_000),
  pollGroup: "or-regional-burning",
};
