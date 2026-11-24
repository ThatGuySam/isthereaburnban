import type { CountyStatus } from "../../../shared/types";
import { countiesInState } from "../../counties";
import { arcgisDistinctUrl, arcgisRows } from "../lib/arcgis";
import { activeRule, CALENDAR_RULES } from "../lib/calendar";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const RULE = CALENDAR_RULES.WY_STATE_LANDS;
const LAYER = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WY_State_Lands_Fire_Restrictions_View/FeatureServer/0";
const META = {
  id: "wy-state-trust-land-fires", state: RULE.state, scope: RULE.scope, stack: "ArcGIS FeatureServer / statute calendar",
  sourceName: "Wyoming Office of State Lands and Investments (W.S. § 36-2-107)",
  sourceUrl: arcgisDistinctUrl(LAYER, ["LandownerK", "LandownerC", "state", "restriction_status", "restriction_order"]),
  officialUrl: RULE.officialUrl,
} as const;

// The ArcGIS parcels marked with this statute intersect all 23 county
// boundaries. See fixtures/README.md for the spatial query and legal sources.
const COUNTIES = countiesInState(RULE.state);
const RULE_TEXT = "Wyoming State Statute 36-2-107 (b)(iv): Building, maintaining, using or attending an open fire, campfire or charcoal grill on state land except in areas established by the board";

export function parseWyomingStateLands(data: unknown, now: Date): CountyStatus[] {
  const standing = arcgisRows(data, { requireComplete: true }).filter((row) => row.restriction_status === "Year Round");
  const [rule] = standing;
  if (standing.length !== 1 || rule.LandownerK !== "State" || rule.LandownerC !== "State" ||
      rule.state !== "Wyoming" || rule.restriction_order !== RULE_TEXT) {
    throw new Error("Wyoming state lands: expected the reviewed year-round rule");
  }
  return pinnedRows(now);
}

function pinnedRows(now: Date) {
  const status = activeRule(RULE, now);
  if (!status) return [];
  const checked = now.toISOString();
  return COUNTIES.map(({ fips, name }) => ({
    ...status, fips, county: name, state: RULE.state, sourceId: META.id,
    checked, since: null, expires: null, sourceUpdated: null,
    sourceName: META.sourceName, sourceUrl: META.sourceUrl,
  }));
}

export const wyStateLands: ActiveSource = {
  ...META, recurring: true, pinnedRows, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: RULE.zone, hours: [3] },
  async fetch({ now }) {
    const body = await getText(META.sourceUrl, { headers: { accept: "application/json", "cache-control": "no-cache" }, maxBytes: 40_000 });
    return { rows: parseWyomingStateLands(JSON.parse(body), now) };
  },
};
