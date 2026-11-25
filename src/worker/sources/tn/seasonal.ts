import type { CountyStatus } from "../../../shared/types";
import { countiesInState, matchKey } from "../../counties";
import { CALENDAR_RULES, calendarStatusRows } from "../lib/calendar";
import { US_ZONES } from "../lib/dates";
import { extractHtml, type HtmlParts } from "../lib/html";
import { getText } from "../lib/http";
import { reviewedRuleFallback, RuleChangedError } from "../statutory-fallback";
import type { ActiveSource } from "../types";
import { tennesseeZone } from "./zones";

const RULE = CALENDAR_RULES.TN;
const PINNED_RULE = "https://publications.tnsosfiles.com/rules/0080/0080-07/0080-07-05.20140729.pdf";
const RULE_REVIEWED = "2026-11-24T12:28:47.000Z";
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

function seasonRows(now: Date, officialUrl = META.officialUrl) {
  return ZONES.flatMap(({ rule, counties }) => calendarStatusRows({ ...rule, officialUrl }, counties, {
    ...META, sourceUrl: officialUrl,
  }, now, { includeTomorrow: true }));
}

export function parseTennesseePermitSeason({ blocks }: HtmlParts, now: Date): CountyStatus[] {
  const hasHeading = blocks.some(({ tag, text }) => tag === "h1" && /^Get a burn permit$/i.test(text));
  const hasRule = blocks.some(({ tag, text }) => tag === "p" &&
    /^From October 15 through May 15, a burn permit from the Tennessee Division of Forestry \(TDF\) is required for debris pile fires and prescribed fires\.$/i.test(text));
  if (!hasHeading || !hasRule) throw new RuleChangedError("Tennessee Forestry: the seasonal permit guidance changed or is missing");

  return seasonRows(now);
}

export const tnSeasonalBurnPermits: ActiveSource = {
  ...META, recurring: true, mode: "positive-only", coverage: "restrictions", keepRowLinks: true,
  cadence: { kind: "daily", zone: US_ZONES.Eastern, hours: [0] },
  async fetch({ now }) {
    let html: string;
    try {
      html = await getText(META.sourceUrl, { headers: { accept: "text/html" }, maxBytes: 256_000 });
    } catch (reason) {
      return reviewedRuleFallback(seasonRows(now, PINNED_RULE), RULE_REVIEWED, now, reason);
    }
    return { rows: parseTennesseePermitSeason(await extractHtml(html), now) };
  },
};
