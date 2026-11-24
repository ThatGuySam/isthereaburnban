import type { CountyStatus } from "../../../shared/types";
import { extractHtmlGrid } from "../lib/html";
import { localClock, localDayWindow, parseUsDate, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const permitPage = "https://www.lofpd.com/business-resources";
const district = "Lake Ozark Fire Protection District";
const publisher = {
  id: "mo-lake-ozark-burn-day", state: "MO", scope: "part", stack: "Wix / daily banner",
  sourceName: district, sourceUrl: permitPage, officialUrl: permitPage,
} as const;

const districtCounties = [
  { fips: "29029", county: "Camden County" },
  { fips: "29131", county: "Miller County" },
];

export async function parseLakeOzarkDay(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const panel = "#comp-mcz4q29u";
  const [notice, ...duplicates] = await extractHtmlGrid(input, { row: panel, cell: `${panel} > p` });
  const decision = /^(\S.+?)\s*\|\s*(Burn Day|No Burn(?: Day)?)$/i.exec(notice?.[0]?.text ?? "");
  if (duplicates.length || notice?.length !== 1 || !decision) {
    throw new Error("Lake Ozark: missing or changed daily burn banner");
  }
  const date = parseUsDate(decision[1]);
  const zone = US_ZONES.Central;
  if (!date || date !== localClock(now, zone).date) throw new Error("Lake Ozark: burn banner is not for today");
  if (!/^no burn/i.test(decision[2])) return [];

  return districtCounties.map((county) => ({
    ...county, state: publisher.state, sourceId: publisher.id, scope: publisher.scope, scopeNote: district,
    status: "restricted", label: "District no-burn day", since: date, expires: date,
    checked: now.toISOString(), sourceUpdated: null, ...localDayWindow(date, zone),
    sourceName: district, sourceUrl: permitPage, officialUrl: permitPage,
    note: "Lake Ozark Fire Protection District has designated today a no-burn day. See the district's permit policy for covered fires.",
  }));
}

export const moLakeOzark: ActiveSource = {
  ...publisher, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Central, hours: [7, 9, 11, 14, 17] },
  staleMs: 24 * 60 * 60 * 1000,
  async fetch({ now }) {
    const reply = await fetchSource(publisher.sourceUrl, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected Lake Ozark 304");
    return { rows: await parseLakeOzarkDay(reply.response, now) };
  },
};
