import type { CountyStatus } from "../../../shared/types";
import { COUNTY_BY_FIPS } from "../../counties";
import { localClock, parseLocalDateTime, parseWeekdayDate, reportWindow, shiftDay, US_ZONES, weekdayOnOrAfter } from "../lib/dates";
import { extractHtmlGrid, htmlStatusBlocks } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Alaska;
const DAY = 24 * 60 * 60 * 1000;
const JUNEAU = "02110";
const FAIRBANKS = "02090";

const JUNEAU_PAGE = "https://juneau.org/lands/air-quality";
const JUNEAU_STATUS_ASSETS = "https://juneau.org/wp-content/uploads/2017/05/burn_Status-";
const juneau = {
  id: "ak-juneau-woodsmoke-alert", stack: "WordPress / GravityView HTML",
  sourceName: "City and Borough of Juneau Lands & Resources", sourceUrl: JUNEAU_PAGE, officialUrl: JUNEAU_PAGE,
};

const NWS_RELAY = "https://forecast.weather.gov/product.php?issuedby=AFG&product=AQA&site=NWS";
const fairbanks = {
  id: "ak-fairbanks-air-alert", stack: "NWS text product / HTML",
  sourceName: "Alaska DEC via NWS Fairbanks", sourceUrl: NWS_RELAY, officialUrl: NWS_RELAY,
};

function statusFields(publisher: typeof juneau, fips: string, now: Date) {
  const county = COUNTY_BY_FIPS.get(fips);
  if (!county) throw new Error(`Unknown Alaska FIPS ${fips}`);
  const { id: sourceId, sourceName, sourceUrl, officialUrl } = publisher;
  return { fips, county: county.name, state: county.state, scope: "part", status: "restricted",
    sourceId, sourceName, sourceUrl, officialUrl, checked: now.toISOString(), since: null, expires: null } as const;
}

export async function parseJuneauWoodsmoke(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const selector = ".gv-list-view-title .gv-field-34-custom";
  const [[image, stamp, ...cells] = [], ...cards] = await extractHtmlGrid(input, {
    row: selector, cell: `${selector} img, ${selector} p`,
  });
  const raw = stamp?.tag === "p" && /^Last Updated:\s+(\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2})$/.exec(stamp.text)?.[1];
  if (cards.length || cells.length || image?.tag !== "img" || !raw) {
    throw new Error("Juneau: missing or ambiguous dated wood-smoke icon");
  }
  const window = reportWindow(parseLocalDateTime(raw, ZONE), now, DAY);
  if (!window) throw new Error("Juneau: stale or invalid wood-smoke decision time");
  if (image.src === `${JUNEAU_STATUS_ASSETS}green-L.png`) return [];
  if (image.src !== `${JUNEAU_STATUS_ASSETS}red-L.png`) throw new Error("Juneau: unknown wood-smoke icon");
  return [{
    ...statusFields(juneau, JUNEAU, now), ...window,
    label: "Mendenhall Valley wood-smoke air emergency",
    scopeNote: "Mendenhall Valley Woodsmoke Hazard Area",
    note: "Juneau prohibits wood-stove use in the hazard area during the declared air emergency. Pellet stoves and qualifying masonry heaters are exempt. Check the city’s current decision or call 907-586-5252.",
  }];
}

const RELAY_DATE = /\b(\d{1,4}) ([AP]M) (AK[SD]T) ([A-Z]{3} [A-Z]{3} \d{1,2} \d{4})\b/i;
const RELAY_ORDER = /\bThe Department of Environmental Conservation has issued an Air Quality Alert which is (IN EFFECT (?:UNTIL|FROM) [^.]+)\./;
const RELAY_ZONES = ["Fairbanks", "North Pole", "Goldstream"];

function localRelayTime(date: string, time: string, abbreviation?: string) {
  const stamp = parseLocalDateTime(`${date} ${time}`, ZONE);
  if (!stamp || !abbreviation) return stamp;
  // Reject inconsistent AKST/AKDT labels instead of moving the restriction by an hour.
  const local = localClock(new Date(stamp), ZONE);
  const offsetHours = (Date.parse(stamp) - Date.parse(`${local.date}T00:00:00Z`) - local.minute * 60_000) / 3_600_000;
  return offsetHours === (abbreviation === "AKST" ? 9 : 8) ? stamp : null;
}

function relativeRelayTime(text: string, issuedDate: string) {
  const match = /^(\d{1,2}(?::\d{2})? [AP]M|NOON) (?:(AK[SD]T) )?(THIS (?:MORNING|AFTERNOON|EVENING)|TODAY|TONIGHT|TOMORROW|[A-Z]+)$/.exec(text);
  if (!match) return;
  const [, time, zoneName, day] = match;
  const date = day === "TOMORROW" ? shiftDay(issuedDate, 1)
    : day.startsWith("THIS ") || day === "TODAY" || day === "TONIGHT" ? issuedDate
    : weekdayOnOrAfter(issuedDate, day, 6);
  const instant = date && localRelayTime(date, time === "NOON" ? "12 PM" : time, zoneName);
  if (date && instant) return { date, instant };
}

export async function parseFairbanksAirAlert(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const [product, ...extra] = await htmlStatusBlocks(input, ".contentArea", "pre.glossaryProduct");
  if (extra.length || !product?.includes("AQAAFG Air Quality Alert Message Department of Environmental Conservation Relayed by National Weather Service Fairbanks AK")) {
    throw new Error("Fairbanks: expected one DEC air-quality relay");
  }
  const issued = RELAY_DATE.exec(product);
  const date = issued && parseWeekdayDate(issued[4]);
  const issuedHour = issued?.[1].padStart(3, "0");
  const sourceUpdated = date && issued && issuedHour && localRelayTime(date, `${issuedHour.slice(0, -2)}:${issuedHour.slice(-2)} ${issued[2]}`, issued[3]);
  const checked = now.toISOString();
  if (!date || !sourceUpdated || sourceUpdated > checked) throw new Error("Fairbanks: invalid relay issue time");
  if (product.includes("...AIR QUALITY ALERT CANCELLED...") &&
    product.includes("The Department of Environmental Conservation has cancelled the Air Quality Alert.")) return [];

  // Some relays give two headline windows but assign stages to just the one in the body.
  const order = RELAY_ORDER.exec(product)?.[1];
  if (!order || !product.includes(`...AIR QUALITY ALERT ${order}...`)) throw new Error("Fairbanks: no corroborated relay window");
  const schedule = /^IN EFFECT (?:UNTIL (.+)|FROM (.+) TO (.+))$/.exec(order);
  if (!schedule) throw new Error("Fairbanks: unrecognized relay window");
  const start = schedule[2] ? relativeRelayTime(schedule[2], date) : undefined;
  const end = relativeRelayTime(schedule[1] ?? schedule[3], date);
  if ((schedule[2] && !start) || !end || end.instant <= sourceUpdated || (start && end.instant <= start.instant)) {
    throw new Error("Fairbanks: invalid relay window");
  }
  if (end.instant <= checked) return [];

  const rows: CountyStatus[] = [];
  for (const area of RELAY_ZONES) {
    const [decision, ...duplicates] = [...product.matchAll(new RegExp(`\\b${area} has ([^.]+)\\.`, "g"))];
    if (!decision && area === "Goldstream") continue;
    if (!decision || duplicates.length) throw new Error(`Fairbanks: missing or ambiguous decision for ${area}`);
    if (decision[1] === "no alert") continue;
    const stage = /^a Stage ([12]) alert$/.exec(decision[1])?.[1];
    if (!stage) throw new Error(`Fairbanks: unknown decision for ${area}`);
    rows.push({
      ...statusFields(fairbanks, FAIRBANKS, now), sourceUpdated, validUntil: end.instant, expires: end.date,
      ...(start ? { validFrom: start.instant } : {}),
      label: `${area} Stage ${stage} wood-smoke restriction`,
      scopeNote: `${area} air-quality reporting zone in Fairbanks North Star Borough`,
      note: `Alaska DEC restricts solid-fuel heating during this Stage ${stage} alert. Check DEC’s zone boundaries, waivers and exemptions at 907-748-2142.`,
    });
  }
  return rows;
}

function localStatusSource(
  publisher: typeof juneau, fips: string, maxBytes: number,
  parse: (input: Response, now: Date) => Promise<CountyStatus[]>,
): ActiveSource {
  return {
    ...publisher, state: "AK", scope: "part", mode: "positive-only", coverage: "restrictions",
    cadence: { kind: "hourly" }, reportingFips: [fips],
    async fetch({ now }) {
      const reply = await fetchSource(publisher.sourceUrl, { maxBytes, headers: { accept: "text/html" } });
      if (reply.notModified) throw new Error(`Unexpected ${publisher.id} 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
}

export const akJuneauWoodsmoke = localStatusSource(juneau, JUNEAU, 1_500_000, parseJuneauWoodsmoke);
export const akFairbanksAirAlert = localStatusSource(fairbanks, FAIRBANKS, 48_000, parseFairbanksAirAlert);
