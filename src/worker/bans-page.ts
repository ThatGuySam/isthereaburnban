import { COUNTY_BY_FIPS } from "./counties";
import { LookupError } from "./lookup";

export const DEFAULT_BANS_LIMIT = 50;
export const MAX_BANS_LIMIT = 100;

export type BansPage = { limit: number; after?: string; state?: string };

export function compareCountyFips(a: string, b: string): number {
  const left = COUNTY_BY_FIPS.get(a);
  const right = COUNTY_BY_FIPS.get(b);
  return (left?.state ?? "").localeCompare(right?.state ?? "") ||
    (left?.name ?? a).localeCompare(right?.name ?? b) || a.localeCompare(b);
}

export function bansPage(stateQuery?: string, limit = DEFAULT_BANS_LIMIT, cursor?: string): BansPage {
  const state = stateQuery?.trim().toUpperCase() || undefined;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BANS_LIMIT) {
    throw new LookupError(`limit must be an integer from 1 to ${MAX_BANS_LIMIT}`, 400);
  }
  if (cursor === undefined) return { limit, state };
  const match = /^(ALL|[A-Z]{2}):(\d{5})$/.exec(cursor);
  if (!match || match[1] !== (state ?? "ALL") || !COUNTY_BY_FIPS.has(match[2]) ||
      (state && COUNTY_BY_FIPS.get(match[2])?.state !== state)) {
    throw new LookupError("Invalid cursor for this state filter", 400);
  }
  return { limit, state, after: match[2] };
}

export function pageFields(page: BansPage, count: number, total: number, lastFips: string | undefined, hasMore: boolean) {
  return { count, total, next: hasMore && lastFips ? `${page.state ?? "ALL"}:${lastFips}` : null };
}
