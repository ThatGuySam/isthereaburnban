import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { parseLocalDateTime, reportWindow, US_ZONES } from "../lib/dates";
import { parseJson } from "../lib/feeds";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const META = {
  id: "mn-dnr-burning-restrictions", state: "MN", scope: "part",
  stack: "MapServer CGI / JSON", sourceName: "Minnesota Department of Natural Resources",
  sourceUrl: "https://maps.dnr.state.mn.us/cgi-bin/mapserv/burning_restrictions?mode=nquery",
  officialUrl: "https://www.dnr.state.mn.us/forestry/fire/firerating_restrictions.html",
} as const;
const MAX_REPORT_AGE = 48 * 60 * 60 * 1000;

const feed = z.object({
  result: z.object({
    status: z.literal("OK"),
    burning_restrictions: z.object({
      layer: z.literal("burning restrictions"),
      features: z.array(z.object({
        name: z.string().min(1),
        status: z.number().int(),
        last_update: z.string(),
      })).min(1),
    }),
  }),
});

// The map indexes by array position. "legOrder" only sorts the displayed legend.
const DECISIONS = new Map<number, Pick<CountyStatus, "status" | "label" | "note">>([
  [1, { status: "restricted", label: "DNR variance permits only",
    note: "The DNR map limits open-burning permits to variances. Check the DNR map and local rules for campfires." }],
  [2, { status: "restricted", label: "DNR debris-burning permit required",
    note: "The DNR map lists permits as required for debris burning. The DNR permit guide describes exceptions, including for qualifying campfires and snow cover." }],
  [3, { status: "ban", label: "DNR prohibits open burning and allows campfires",
    note: "The DNR map lists no open burning and allows campfires under this restriction. Confirm local and land manager rules for campfires." }],
  [4, { status: "ban", label: "DNR elevated burning restrictions",
    note: "The DNR map lists no open burning. The current order may also restrict campfires or other activities." }],
  [5, { status: "unknown", label: "DNR shows no debris-burning permit required",
    note: "The DNR map lists no debris-burning permit requirement for this area. Other rules may apply." }],
  [6, { status: "restricted", label: "Agency-approved burning permits only",
    note: "The DNR map limits open burning to agency-approved permits. Check with the issuing agency for conditions." }],
]);

// The county permit directory confirms these are separate DNR administrative areas.
const SPLIT_AREAS = new Map([
  ["Beltrami County: North", ["Beltrami", "Northern Beltrami County"]],
  ["Beltrami County: South", ["Beltrami", "Southern Beltrami County"]],
  ["Cass County: North", ["Cass", "Northern Cass County"]],
  ["Cass County: South", ["Cass", "Southern Cass County"]],
  ["St. Louis County: North", ["St. Louis", "Northern St. Louis County"]],
  ["St. Louis County: South", ["St. Louis", "Southern St. Louis County"]],
  ["Polk East County", ["Polk", "Polk East"]],
  ["Roseau East County", ["Roseau", "Roseau East"]],
]);

export function parseMinnesotaRestrictions(text: string, now: Date): CountyStatus[] {
  const data = parseJson(text, (value): value is z.infer<typeof feed> => feed.safeParse(value).success);
  const { features } = data.result.burning_restrictions;
  const seen = new Set<string>();
  const checked = now.toISOString();
  const rows: CountyStatus[] = [];
  let hasRecentReport = false;

  for (const { name, status, last_update } of features) {
    const area = name.trim().replace(/\s+/g, " ");
    const split = SPLIT_AREAS.get(area);
    const countyName = split?.[0] ?? /^(.+) County$/.exec(area)?.[1];
    const county = countyName && countyByName(META.state, countyName);
    if (!county) continue;
    if (seen.has(area)) throw new Error(`Minnesota DNR: repeated permit area ${area}`);
    seen.add(area);

    const stamp = parseLocalDateTime(last_update, US_ZONES.Central);
    const window = reportWindow(stamp, now, MAX_REPORT_AGE);
    if (!window) continue;
    hasRecentReport = true;

    const decision = DECISIONS.get(status);
    if (!decision) continue;
    const areaName = split?.[1] ?? county.name;
    rows.push({
      ...decision, ...window, fips: county.fips, county: county.name, state: META.state,
      scope: META.scope, scopeNote: `${areaName} DNR permit area`, sourceId: META.id,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      checked, since: null, expires: null,
    });
  }

  if (!hasRecentReport) throw new Error("Minnesota DNR: no mapped permit areas updated within 48 hours");
  return rows;
}

export const mnRestrictions: ActiveSource = {
  ...META,
  coverage: "restrictions",
  mode: "positive-only",
  // The public map refreshes throughout the day and orders may change between daily map exports.
  cadence: { kind: "hourly" },
  async fetch({ now }) {
    const body = await getText(META.sourceUrl, { headers: { accept: "application/json" }, maxBytes: 64_000 });
    return { rows: parseMinnesotaRestrictions(body, now) };
  },
};
