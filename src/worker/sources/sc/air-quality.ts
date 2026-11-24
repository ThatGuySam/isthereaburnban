import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarDayWindows } from "../lib/calendar";
import { US_ZONES } from "../lib/dates";
import { monitorPdf, manualPdf } from "../lib/pdf";
import type { ActiveSource } from "../types";

const RULES = [CALENDAR_RULES.SC_LAND_CLEARING, CALENDAR_RULES.SC_CONSTRUCTION_SEASON, CALENDAR_RULES.SC_CONSTRUCTION_HOURS];
const META = {
  id: "sc-des-open-burning", state: "SC", scope: "part", stack: "Regulation PDF / calendar",
  sourceName: "South Carolina Department of Environmental Services",
  sourceUrl: "https://des.sc.gov/sites/des/files/Library/Regulations/R.61-62.2.pdf",
  officialUrl: RULES[0].officialUrl,
} as const;
const COUNTIES = countiesInState(META.state);
const REGULATION_SHA256 = "b204f802759a4421de320c50f94fec3b25807c8375887986d6ec229d473b0e85";

function regulationRows(document: { sha256: string }, now: Date): CountyStatus[] {
  if (document.sha256 !== REGULATION_SHA256) throw new Error("SC Regulation 61-62.2 PDF changed and needs review");
  return pinnedRows(now);
}

function pinnedRows(now: Date): CountyStatus[] {
  const checked = now.toISOString();
  return RULES.flatMap((rule) =>
    calendarDayWindows(rule, now).filter(({ validUntil }) => validUntil > checked).flatMap((window) =>
      COUNTIES.map(({ fips, name }) => ({
        ...window, fips, county: name, state: META.state, sourceId: META.id,
        status: rule.status, label: rule.label, note: rule.note, scope: rule.scope, scopeNote: rule.scopeNote,
        sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
        checked, sourceUpdated: null, since: null, expires: null,
      }))));
}

export async function parseScAirQuality(pdf: Response, now: Date): Promise<CountyStatus[]> {
  return regulationRows(await manualPdf(pdf), now);
}

export const scAirQuality: ActiveSource = {
  ...META, recurring: true, pinnedRows, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Eastern, hours: [0] },
  async fetch({ now }) {
    // Recompute the Eastern calendar even when the publisher's bytes are unchanged.
    const reply = await monitorPdf(META.sourceUrl);
    if (reply.notModified) throw new Error("Unexpected SC Regulation 61-62.2 PDF 304");
    return { rows: regulationRows(reply.document, now) };
  },
};
