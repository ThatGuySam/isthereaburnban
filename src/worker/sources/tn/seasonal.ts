import type { CountyStatus } from "../../../shared/types";
import { countiesInState, matchKey } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { US_ZONES } from "../lib/dates";
import { extractHtml, type HtmlParts } from "../lib/html";
import { getText, isSourceUnavailable } from "../lib/http";
import { staleVerificationNote } from "../lib/local-calendar";
import type { ActiveSource } from "../types";
import { tennesseeZone } from "./zones";

const RULE = CALENDAR_RULES.TN;
const META = {
  id: "tn-seasonal-burn-permits", state: RULE.state, scope: RULE.scope, stack: "Adobe AEM HTML / statute and calendar",
  sourceName: "Tennessee Division of Forestry (T.C.A. § 39-14-306)",
  sourceUrl: RULE.officialUrl, officialUrl: RULE.officialUrl,
};

// The state's local permit directory refers these counties to local authorities.
const LOCAL_PROGRAMS = new Set(["davidson", "knox", "shelby"]);
const COUNTIES = countiesInState(RULE.state).filter(({ name }) => !LOCAL_PROGRAMS.has(matchKey(name)));
const ZONES = [US_ZONES.Central, US_ZONES.Eastern].map((zone) => ({
  rule: { ...RULE, zone }, counties: COUNTIES.filter((county) => tennesseeZone(county) === zone),
}));

export function parseTennesseePermitSeason({ blocks }: HtmlParts, now: Date): CountyStatus[] {
  const hasHeading = blocks.some(({ tag, text }) => tag === "h1" && /^Get a burn permit$/i.test(text));
  const hasRule = blocks.some(({ tag, text }) => tag === "p" &&
    /^From October 15 through May 15, a burn permit from the Tennessee Division of Forestry \(TDF\) is required for debris pile fires and prescribed fires\.$/i.test(text));
  if (!hasHeading || !hasRule) throw new Error("Tennessee Forestry: the seasonal permit guidance changed or is missing");

  return permitSeasonRows(now);
}

function permitSeasonRows(now: Date, stale = false): CountyStatus[] {
  return ZONES.flatMap(({ rule, counties }) => calendarStatusRows({
    ...rule,
    note: stale
      ? staleVerificationNote(rule.note, "November 24, 2026")
      : rule.note,
  }, counties, META, now, { includeTomorrow: true }));
}

export const tnSeasonalBurnPermits: ActiveSource = {
  ...META, recurring: true, mode: "positive-only", coverage: "restrictions",
  cadence: { kind: "daily", zone: US_ZONES.Eastern, hours: [0] },
  async fetch({ now }) {
    let guidance: string;
    try {
      guidance = await getText(META.sourceUrl, {
        headers: { accept: "text/html" }, maxBytes: 256_000, timeoutMs: 8_000, attempts: 1,
      });
    } catch (error) {
      if (!isSourceUnavailable(error)) throw error;
      return { rows: permitSeasonRows(now, true) };
    }
    return { rows: parseTennesseePermitSeason(await extractHtml(guidance), now) };
  },
};
