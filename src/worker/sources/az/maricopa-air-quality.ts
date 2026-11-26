import { countyStatusBulletin } from "../lib/county-bulletin";
import { localClock, localDayWindow, parseLocalDateTime, US_ZONES } from "../lib/dates";
import { htmlStatusBlocks } from "../lib/html";

const zone = US_ZONES.Arizona;
const woodRestriction =
  /^Wood burning in residential fireplaces, chim[ie]neas, outdoor fire pits, and similar outdoor fires(?: \([^)]*\))? is prohibited(?: in Maricopa County)?\./i;

export const azMaricopaAirQuality = countyStatusBulletin({
  id: "az-maricopa-no-burn-day", state: "AZ", county: "Maricopa", stack: "AQD Outreach / HTML widget",
  sourceName: "Maricopa County Air Quality Department",
  sourceUrl: "https://aqdoutreach.com/widgets/wide/en",
  officialUrl: "https://www.maricopa.gov/1244/Air-Quality",
  scopeNote: "Covered wood burning in Maricopa County Air Quality Department jurisdiction",
  cadence: { kind: "hourly" }, pollGroup: "hourly-fire-status", staleMs: 6 * 3_600_000,
  async read(input, now) {
    const [heading, stamp, ...messages] = await htmlStatusBlocks(
      input, "div.w-full.bg-white", "div.mb-1 > h4, div.mb-1 > span, div.text-center > span, div.font-bold.text-white",
    );
    if (heading !== "Today’s Air Quality Restrictions") throw new Error("Missing Maricopa current-decision heading");
    const timestamp = stamp?.match(/^Last updated: (.+)$/)?.[1];
    const sourceUpdated = timestamp && parseLocalDateTime(timestamp, zone);
    const { date } = localClock(now, zone);
    if (!sourceUpdated || sourceUpdated > now.toISOString() || localClock(new Date(sourceUpdated), zone).date !== date) {
      throw new Error("Maricopa air-quality widget has no update from the current local day");
    }
    const allowed = messages.filter((message) => message === "Wood Burning OK").length;
    const restricted = messages.filter((message) => woodRestriction.test(message)).length;
    if (allowed + restricted !== 1) throw new Error("Ambiguous or unknown Maricopa wood-burning decision");
    if (allowed) return;
    return {
      ...localDayWindow(date, zone),
      status: "restricted", sourceUpdated, expires: date, label: "Air-quality No Burn Day",
      note: "Maricopa County restricts residential wood burning in fireplaces, chimineas, fire pits and similar outdoor fires under its air-quality rules. Consult the county for exceptions and applicable boundaries.",
    };
  },
});
