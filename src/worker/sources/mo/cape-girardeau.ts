import type { CountyStatus } from "../../../shared/types";
import { extractHtmlGrid } from "../lib/html";
import { localClock, localDayWindow, parseUsDate, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const regulations = "https://www.cityofcapegirardeau.org/departments/fire/fire-prevention/burning-regulations/";
const publisher = {
  id: "mo-cape-girardeau-burn-day", state: "MO", scope: "part", stack: "WordPress / Elementor",
  sourceName: "Cape Girardeau Fire Department", sourceUrl: regulations, officialUrl: regulations,
} as const;

const cityCounties = [
  { fips: "29031", county: "Cape Girardeau County" },
  { fips: "29201", county: "Scott County" },
];

export async function parseCapeGirardeauDay(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const [notice, ...duplicates] = await extractHtmlGrid(input, {
    row: ".burn-notice",
    cell: ".burn-notice h2, .burn-notice > p",
  });
  const message = notice?.[1]?.text;
  const decision = message && /^It's (a No Burn Day|Okay to Burn) in Cape Girardeau - ([A-Z][a-z]+ \d{1,2}, \d{4})\.$/.exec(message);
  if (duplicates.length || notice?.length !== 2 || notice[0].text !== "Burn Notice" || !decision) {
    throw new Error("Cape Girardeau: missing or changed daily burn notice");
  }
  const date = parseUsDate(decision[2]);
  const zone = US_ZONES.Central;
  if (!date || date !== localClock(now, zone).date) throw new Error("Cape Girardeau: burn notice is not for today");
  if (decision[1] !== "a No Burn Day") return [];

  return cityCounties.map((county) => ({
    ...county, state: publisher.state, sourceId: publisher.id, scope: publisher.scope,
    scopeNote: "City of Cape Girardeau",
    status: "restricted", label: "City no-burn day", since: date, expires: date,
    checked: now.toISOString(), sourceUpdated: null, ...localDayWindow(date, zone),
    sourceName: publisher.sourceName, sourceUrl: publisher.sourceUrl, officialUrl: publisher.officialUrl,
    note: "Open burning within city limits is prohibited today except cooking fires and fires specifically permitted by the Fire Chief or designee.",
  }));
}

export const moCapeGirardeau: ActiveSource = {
  ...publisher, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Central, hours: [7, 9, 11, 14, 17] },
  staleMs: 24 * 60 * 60 * 1000,
  async fetch({ now }) {
    const reply = await fetchSource(publisher.sourceUrl, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected Cape Girardeau 304");
    return { rows: await parseCapeGirardeauDay(reply.response, now) };
  },
};
