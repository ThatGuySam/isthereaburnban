import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarDayWindows } from "../lib/calendar";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.UT;
const COUNTIES = countiesInState(RULE.state);
const META = {
  id: "ut-closed-fire-season", state: RULE.state, scope: RULE.scope, stack: "Statute HTML / calendar",
  sourceName: "Utah State Legislature (Utah Code § 65A-8-211)",
  sourceUrl: RULE.officialUrl, officialUrl: "https://ffsl.utah.gov/wildland-fire/burn-permits/",
} as const;

// The current-version page points to the edition reviewed for dates and scope.
const REVIEWED_VERSION = "C65A-8-S211_2023050320230503";

export function parseUtahSeasonal(html: string, now: Date): CountyStatus[] {
  const editions = [...html.matchAll(/^\s*var versionDefault\s*=\s*"([^"]+)"\s*;/gm)];
  if (editions.length !== 1 || editions[0][1] !== REVIEWED_VERSION) {
    throw new Error("Utah Code § 65A-8-211: current edition changed or is missing");
  }

  const checked = now.toISOString();
  return calendarDayWindows(RULE, now).flatMap((window) =>
    COUNTIES.map(({ fips, name }) => ({
      ...window, fips, county: name, state: RULE.state, sourceId: META.id,
      status: RULE.status, label: RULE.label, note: RULE.note, scope: RULE.scope, scopeNote: RULE.scopeNote,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      checked, sourceUpdated: null, since: null, expires: null,
    })));
}

export const utClosedFireSeason: ActiveSource = {
  ...META, recurring: true, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: RULE.zone, hours: [0] },
  async fetch({ now }) {
    const html = await getText(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 100_000 });
    return { rows: parseUtahSeasonal(html, now) };
  },
};
