import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { localClock, localDayWindow, parseUsDate, shiftDay, US_ZONES } from "../lib/dates";
import { extractHtml } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://www.readygallatin.com/residents/open-burning/";
const META = {
  id: "mt-gallatin-open-burning", state: "MT", scope: "part", stack: "WordPress / HTML table",
  sourceName: "Gallatin County Emergency Management", sourceUrl: URL, officialUrl: URL,
} as const;

const ZONE = US_ZONES.Mountain;
const GALLATIN = "30031";
const MADISON = "30057";
const COUNTIES = countiesInState(META.state);
const GALLATIN_AREAS = new Set([
  "Amsterdam Fire District", "Big Sky Fire Department", "Bozeman Fire Department",
  "Bridger Canyon Fire District", "Central Valley Fire District", "Clarkston Fire Service Area",
  "County Fire (unprotected)", "Fort Ellis Fire Service Area", "Gallatin Gateway Fire District",
  "Gallatin River Ranch Fire District", "Hebgen Basin Fire District", "Hyalite Fire Department",
  "Manhattan Fire District", "Sedan Fire District", "Three Forks Fire Department", "Willow Creek Fire District",
]);

function inPermitSeason(day: string) {
  return day.slice(5) >= "03-01" && day.slice(5) <= "11-30";
}

export async function parseGallatin(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const { date: today } = localClock(now, ZONE);
  if (!inPermitSeason(today)) return [];

  const parts = await extractHtml(input, { tableHeading: ({ tag, text }) => tag === "p" && /^Status as of /i.test(text) });
  const reports = parts.tables.filter(({ heading, rows: [header] }) =>
    /^Status as of /i.test(heading) && header?.length === 2 &&
    header[0] === "Agency" && header[1] === "Open Burning Status");
  if (reports.length !== 1) throw new Error("Gallatin County: expected one dated district status table");

  const [{ heading, rows: [, ...districts] }] = reports;
  const day = parseUsDate(heading.replace(/^Status as of /i, ""));
  // The table is a snapshot and publishes no expiry. Allow the report date
  // and the following day, bounded by the end of the county permit season.
  if (!day || !inPermitSeason(day) || day > today || today > shiftDay(day, 1)) {
    throw new Error("Gallatin County: stale or invalid district status date");
  }
  const { validFrom } = localDayWindow(day, ZONE);
  const lastDay = day.slice(5) === "11-30" ? day : shiftDay(day, 1);
  const { validUntil } = localDayWindow(lastDay, ZONE);
  const checked = now.toISOString();
  const seen = new Set<string>();
  const rows: CountyStatus[] = [];
  let recognized = 0;

  for (const [agency, status, ...extra] of districts) {
    if (!agency || !status || extra.length) throw new Error("Gallatin County: malformed district row");
    const name = agency.replace(/\s+\(\d{3}\) \d{3}-\d{4}$/, "");
    if (!GALLATIN_AREAS.has(name)) continue;
    if (seen.has(name)) throw new Error("Gallatin County: duplicate district status");
    seen.add(name);
    if (status !== "Open" && status !== "Closed") continue;
    recognized++;
    if (status !== "Closed") continue;
    // Gallatin confirms permit administration on the Madison County side of Big Sky.
    const fips = name === "Big Sky Fire Department" ? [GALLATIN, MADISON] : [GALLATIN];
    for (const county of COUNTIES.filter((county) => fips.includes(county.fips))) {
      rows.push({
        fips: county.fips, county: county.name, state: META.state, sourceId: META.id,
        scope: META.scope, scopeNote: `${name} within ${county.name}, county open-burning permits`,
        status: "restricted", label: "Open burning closed by fire district",
        note: `The county's ${day} report lists this district as closed to permitted open burning. Confirm current permit activation and recreational fire rules with the local fire agency.`,
        checked, sourceUpdated: null, since: null, expires: null, validFrom, validUntil,
        sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      });
    }
  }
  if (!recognized) throw new Error("Gallatin County: no recognized district statuses");
  return rows;
}

export const mtGallatinOpenBurning: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: ZONE, hours: [7, 12, 17] },
  staleMs: 24 * 3_600_000,
  async fetch({ now }) {
    if (!inPermitSeason(localClock(now, ZONE).date)) return { rows: [] };
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 700_000 });
    if (reply.notModified) throw new Error("Unexpected Gallatin status 304");
    return { rows: await parseGallatin(reply.response, now) };
  },
};
