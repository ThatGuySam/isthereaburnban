import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { COUNTY_BY_FIPS } from "../../counties";
import { localClock, parseIsoTimestamp, reportWindow, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const META = {
  id: "mo-show-me-fire-bans", state: "MO", scope: "county", stack: "Nuxt / JSON",
  sourceName: "Show Me Fire",
  sourceUrl: "https://api.showmefire.org/api/burn-bans/active",
  officialUrl: "https://showmefire.org/burn-bans",
} as const;

const ACTIVE_BANS = z.object({
  success: z.literal(true),
  count: z.number().int().nonnegative(),
  map: z.object({ updated_at: z.string() }),
  bans: z.array(z.object({
    county_fips: z.string(),
    request_type: z.enum(["issue", "update"]),
    effective_at: z.string(),
    expires_at: z.string().nullable(),
    updated_at: z.string(),
  })),
});
const MAP_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export function parseShowMeFireBans(json: unknown, now: Date): CountyStatus[] {
  const feed = ACTIVE_BANS.parse(json);
  if (feed.count !== feed.bans.length) throw new Error("Show Me Fire: incomplete active-ban list");

  // The daily map stamp dates the current publication. Individual orders can remain active
  // until lifted, so their last edit does not date the list.
  const publication = reportWindow(parseIsoTimestamp(feed.map.updated_at), now, MAP_MAX_AGE_MS);
  if (!publication) throw new Error("Show Me Fire: missing or stale map publication");

  const seen = new Set<string>();
  const checked = now.toISOString();
  const rows: CountyStatus[] = [];
  for (const ban of feed.bans) {
    const county = COUNTY_BY_FIPS.get(ban.county_fips);
    if (county?.state !== META.state || seen.has(county.fips)) {
      throw new Error("Show Me Fire: unexpected or duplicate county FIPS");
    }
    seen.add(county.fips);
    const validFrom = parseIsoTimestamp(ban.effective_at);
    const end = parseIsoTimestamp(ban.expires_at);
    // The equivalent ArcGIS date field confirms the feed's offsetless edit times are UTC.
    const sourceUpdated = parseIsoTimestamp(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ban.updated_at)
        ? ban.updated_at.replace(" ", "T") + "Z"
        : ban.updated_at,
    );
    if (!validFrom || !sourceUpdated || sourceUpdated > checked ||
      (ban.expires_at !== null && (!end || end <= validFrom))) {
      throw new Error("Show Me Fire: invalid active-ban dates");
    }
    if (validFrom > checked || (end && end <= checked)) continue;

    rows.push({
      fips: county.fips, county: county.name, state: META.state, sourceId: META.id,
      status: "ban", scope: META.scope, label: "Reported county burn ban",
      note: "Show Me Fire lists an active burn ban for this county. Confirm the order, boundaries and exceptions with local fire officials.",
      checked, sourceUpdated, validFrom, validUntil: end && end < publication.validUntil ? end : publication.validUntil,
      since: localClock(new Date(validFrom), US_ZONES.Central).date,
      expires: end ? localClock(new Date(end), US_ZONES.Central).date : null,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    });
  }
  return rows;
}

export const moShowMeFireBans: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "hourly" },
  staleMs: 6 * 60 * 60 * 1000,
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "application/json" }, maxBytes: 128_000 });
    if (reply.notModified) throw new Error("Unexpected Show Me Fire 304");
    return { rows: parseShowMeFireBans(await reply.response.json<unknown>(), now) };
  },
};
