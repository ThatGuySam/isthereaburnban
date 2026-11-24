import type { CountyStatus } from "../../../shared/types";
import { countiesInState, matchKey } from "../../counties";
import { CALENDAR_RULES, calendarDayWindows } from "../lib/calendar";
import { US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import { manualPdf } from "../lib/pdf";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.KY;
const META = {
  id: "ky-seasonal-burning", state: "KY", scope: RULE.scope, stack: "Statute PDF / calendar",
  sourceName: "Kentucky Division of Forestry (KRS 149.400)",
  sourceUrl: "https://apps.legislature.ky.gov/law/Statutes/statute.aspx?id=1898",
  officialUrl: RULE.officialUrl,
} as const;
const STATUTE_SHA256 = "e571c700af72e0b7547131c79c355ba5f6fea026c657ae14d27125ce34518730";

// The DOT boundary in 49 CFR 71.5(c) follows county lines across Kentucky.
const CENTRAL = new Set([
  "adair", "allen", "ballard", "barren", "breckinridge", "butler", "caldwell", "calloway", "carlisle", "christian",
  "clinton", "crittenden", "cumberland", "daviess", "edmonson", "fulton", "graves", "grayson", "green", "hancock",
  "hart", "henderson", "hickman", "hopkins", "livingston", "logan", "lyon", "marshall", "mccracken", "mclean",
  "metcalfe", "monroe", "muhlenberg", "ohio", "russell", "simpson", "todd", "trigg", "union", "warren", "webster",
]);
const COUNTIES = countiesInState(META.state);
const ZONES = [
  { rule: RULE, counties: COUNTIES.filter(({ name }) => !CENTRAL.has(matchKey(name))) },
  { rule: { ...RULE, zone: US_ZONES.Central }, counties: COUNTIES.filter(({ name }) => CENTRAL.has(matchKey(name))) },
];

export async function parseKentuckySeasonal(response: Response, now: Date): Promise<CountyStatus[]> {
  const document = await manualPdf(response);
  if (document.sha256 !== STATUTE_SHA256) throw new Error("Kentucky KRS 149.400 PDF changed and needs review");

  const checked = now.toISOString();
  return ZONES.flatMap(({ rule, counties }) =>
    calendarDayWindows(rule, now).filter(({ validUntil }) => validUntil > checked).flatMap((window) =>
      counties.map(({ fips, name }) => ({
        ...window, fips, county: name, state: META.state, sourceId: META.id,
        status: rule.status, label: rule.label, note: rule.note, scope: META.scope, scopeNote: rule.scopeNote,
        sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
        checked, sourceUpdated: null, since: null, expires: null,
      }))));
}

export const kySeasonal: ActiveSource = {
  ...META,
  recurring: true,
  mode: "positive-only",
  coverage: "restrictions",
  // After Central midnight both zones can publish windows for the same local date.
  cadence: { kind: "daily", zone: US_ZONES.Central, hours: [0] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "application/pdf" }, maxBytes: 64_000 });
    if (reply.notModified) throw new Error("Unexpected Kentucky statute 304");
    return { rows: await parseKentuckySeasonal(reply.response, now) };
  },
};
