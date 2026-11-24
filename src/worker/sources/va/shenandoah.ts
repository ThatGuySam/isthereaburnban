import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { localClock, parseLocalDateTime, parseWeekdayDate, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import { npsAlertTime, parseNpsParkAlerts } from "../lib/nps";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Eastern;
const SIX_HOURS = 6 * 60 * 60 * 1000;
// NPS park statistics list these eight counties. The rest of each county is outside this order.
const PARK_FIPS = new Set(["51003", "51015", "51079", "51113", "51139", "51157", "51165", "51187"]);
const COUNTIES = countiesInState("VA").filter(({ fips }) => PARK_FIPS.has(fips));
const META = {
  id: "va-nps-shenandoah-fire-restrictions", state: "VA", scope: "part", stack: "NPS CommonSpot / public JSON embed",
  sourceName: "National Park Service, Shenandoah National Park",
  sourceUrl: "https://home.nps.gov/shen/park-alerts-shen.json",
  officialUrl: "https://www.nps.gov/shen/planyourvisit/conditions.htm",
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

const FIRE_TITLE = /\b(?:fire restriction(?:s)?|fire ban|campfire ban)\b/i;
const LIFT_TITLE = /^(?:Fire Restrictions?|Fire Ban|Campfire Ban) (?:Lifted|Rescinded)$/i;
const START_TITLE = /^Fire Restriction begins (.+) at (\d{1,2}:\d{2} [ap]\.m\.)$/i;

export function parseShenandoahAlerts(data: unknown, now: Date): CountyStatus[] {
  const checked = now.toISOString();
  const candidates = parseNpsParkAlerts(data, "shen").filter((alert) => alert.is_active === 1 && FIRE_TITLE.test(alert.title));
  const rows = candidates.flatMap((alert): CountyStatus[] => {
    const displayFrom = npsAlertTime(alert.start_date, ZONE);
    const validUntil = npsAlertTime(alert.end_date, ZONE);
    if (validUntil && validUntil <= checked) return [];
    if (LIFT_TITLE.test(alert.title)) return [];

    const start = START_TITLE.exec(alert.title);
    const year = displayFrom && Number(localClock(new Date(displayFrom), ZONE).date.slice(0, 4));
    const day = start && year ? parseWeekdayDate(start[1], year) : null;
    const validFrom = start && day && parseLocalDateTime(`${day} ${start[2]}`, ZONE);
    const issue = /\bthe park has issued a fire restriction beginning (.+?) at (\d{1,2}:\d{2} [ap]\.m\.)/i.exec(alert.description);
    const bodyStart = issue && year && parseLocalDateTime(`${issue[1]} ${issue[2]}`, ZONE, year);
    if (alert.category !== "Danger" || !day || !validFrom || bodyStart !== validFrom ||
      !displayFrom || validFrom < displayFrom || (validUntil && validFrom >= validUntil) ||
      !/\ball wood, charcoal or other solid fuel open air fires\b/i.test(alert.description)) {
      throw new Error("NPS Shenandoah: unrecognized park fire restriction scope, status or time");
    }

    return COUNTIES.map(({ fips, name }) => ({
      fips, county: name, state: META.state, status: "ban", sourceId: META.id, scope: META.scope,
      scopeNote: "Within Shenandoah National Park", label: "Shenandoah National Park fire restriction",
      note: "The park prohibits open solid-fuel fires, including at developed sites. Check the park alert for stove and smoking restrictions.",
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      checked, sourceUpdated: null, since: day, expires: null, validFrom,
      ...(validUntil ? { validUntil } : {}),
    }));
  });
  if (rows.length > COUNTIES.length || (rows.length && candidates.some(({ title }) => LIFT_TITLE.test(title)))) {
    throw new Error("NPS Shenandoah: overlapping fire restriction notices");
  }
  return rows;
}

export const vaShenandoahAlerts: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", cadence: { kind: "hourly" }, staleMs: SIX_HOURS,
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "application/json" }, maxBytes: 128_000, maxResponseAgeMs: SIX_HOURS,
    });
    if (reply.notModified) throw new Error("Unexpected Shenandoah alerts 304");
    return { rows: parseShenandoahAlerts(await reply.response.json(), now) };
  },
};
