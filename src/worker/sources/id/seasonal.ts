import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { CALENDAR_RULES, calendarDayWindows } from "../lib/calendar";
import { US_ZONES } from "../lib/dates";
import { sha256 } from "../lib/hash";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.ID;
const META = {
  id: "id-closed-fire-season", state: "ID", scope: "part", stack: "Statute HTML / calendar",
  sourceName: "Idaho Department of Lands (Idaho Code § 38-115)",
  sourceUrl: RULE.officialUrl, officialUrl: "https://burnpermits.idaho.gov/",
} as const;
const COUNTIES = countiesInState(META.state);
const IDAHO_COUNTY = "16049";
const PACIFIC = new Set(["16009", "16017", "16021", "16035", "16055", "16057", "16061", "16069", "16079"]);
const RULE_TEXT_HASH = "f175224d9fb113ae9a5c3c045f5205ff1b1aa83c02b9fd5e89ec2f40e890903f";

export async function parseIdahoSeasonal(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const sections = await extractHtmlGrid(input, { row: "div.pgbrk", cell: "div.pgbrk > div > span.f11s" });
  const clauses = sections.flat().map(({ text }) => text).filter((text) =>
    /^38-115\. Closed season for fires\b|^In seasons, localities and under conditions of unusual fire danger,/.test(text));
  if (clauses.length !== 2 || await sha256(clauses.join("\n")) !== RULE_TEXT_HASH) {
    throw new Error("Idaho Code § 38-115: closed season or extension provisions changed or are missing");
  }

  return pinnedRows(now);
}

function pinnedRows(now: Date) {
  const checked = now.toISOString();
  const rows: CountyStatus[] = [];
  for (const zone of [US_ZONES.Mountain, US_ZONES.Pacific]) {
    const windows = calendarDayWindows({ ...RULE, zone }, now);
    for (const window of windows) {
      for (const { fips, name } of COUNTIES) {
        if (fips !== IDAHO_COUNTY && PACIFIC.has(fips) !== (zone === US_ZONES.Pacific)) continue;
        const scopeNote = fips === IDAHO_COUNTY
          ? `${RULE.scopeNote} in the county's ${zone === US_ZONES.Pacific ? "Pacific" : "Mountain"} time zone`
          : RULE.scopeNote;
        rows.push({
          ...window, fips, county: name, state: META.state, scope: META.scope, sourceId: META.id,
          status: RULE.status, label: RULE.label, note: RULE.note, scopeNote,
          sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
          checked, sourceUpdated: null, since: null, expires: null,
        });
      }
    }
  }
  return rows;
}

export const idSeasonal: ActiveSource = {
  ...META, recurring: true, pinnedRows, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Mountain, hours: [0, 1] },
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 500_000 });
    if (reply.notModified) throw new Error("Unexpected Idaho Code 304");
    return { rows: await parseIdahoSeasonal(reply.response, now) };
  },
};
