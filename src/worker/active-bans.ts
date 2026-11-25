import type { CountyStatus, SnapshotData } from "../shared/types";
import { type BansPage, pageFields, pageStart } from "./bans-page";
import { activeStatus, countyBoundary, countyDecision } from "./county-decision";
import { COUNTY_BY_FIPS } from "./counties";
import { weatherBoundary, withFireWeather } from "./fire-weather";
import { DISCLAIMER } from "./lookup";
import { withReportDates } from "./report-dates";
import type { ActiveProjection, SnapshotIndex } from "./snapshot-v2";
import { withCurrentCountyLinks, withCurrentLinks } from "./source-links";
import { applyChecks, applyCountyEvidence, applySourceChecks, reportChecks, type SourceHead } from "./sources/state";

// Older published compact bodies retained precomputed variants before the raw evidence.
type LegacyPrepared = [fips: string, rawLength: number, generated: number, stableUntil: number | null,
  sourceIds: string[], first: [length: number, stamps: unknown[]], after?: unknown];
type LegacyEncoded = [fips: string, sourceId: string | null, checked: string, expires: number | null,
  ordersExpire: number | null, body: [offset: number, length: number], after?: [at: number, body: [offset: number, length: number]]];
export type BanEntry = [fips: string] | [fips: string, rawLength: number] | LegacyPrepared | LegacyEncoded;
const isPrepared = (entry: LegacyPrepared | LegacyEncoded): entry is LegacyPrepared => typeof entry[1] === "number";

function retainedLength(entry: BanEntry): number {
  if (entry.length === 1) return 0;
  if (entry.length === 2) return entry[1];
  return isPrepared(entry) ? entry[1] + entry[5][0] : entry[5][1] + (entry[6]?.[1][1] ?? 0);
}

function rawCounty(raw: string, entry: Exclude<BanEntry, [string]>, from: number, to: number): CountyStatus {
  const body = entry.length === 2 ? raw.slice(from, to) : isPrepared(entry)
    ? raw.slice(from + entry[5][0], to) : raw.slice(from, from + entry[5][1]);
  return JSON.parse(body);
}

const active = (row: Pick<CountyStatus, "status">) => activeStatus(row.status);

/** Serialize county evidence once for both the state shard and national list. */
export function encodeCounties(snapshot: SnapshotData) {
  const countyBodies: string[] = [];
  const weatherCounties: string[] = [];
  const activeRows: { name: string; fips: string; body?: string }[] = [];
  const weather = snapshot.fireWeather;
  for (const [fips, row] of Object.entries(snapshot.counties)) {
    const body = JSON.stringify(row);
    const field = `${JSON.stringify(fips)}:${body}`;
    countyBodies.push(field);
    if (weather?.[fips]) {
      weatherCounties.push(field);
      activeRows.push({ name: row.county, fips });
    } else if (active(row) || row.orders?.some(active) || row.candidates?.some(active)) {
      activeRows.push({ name: row.county, fips, body });
    }
  }
  for (const fips of Object.keys(weather ?? {})) {
    if (!snapshot.counties[fips]) activeRows.push({ name: COUNTY_BY_FIPS.get(fips)?.name ?? fips, fips });
  }
  activeRows.sort((a, b) => a.name.localeCompare(b.name) || a.fips.localeCompare(b.fips));
  const entries: BanEntry[] = [];
  const bodies: string[] = [];
  for (const { fips, body } of activeRows) {
    entries.push(body ? [fips, body.length] : [fips]);
    if (body) bodies.push(body);
  }
  return { compact: `${JSON.stringify(entries).slice(1, -1)}
${bodies.join("")}`,
    counties: countyBodies.join(","), weatherCounties: weatherCounties.join(",") };
}

export function projectWeather(projection: ActiveProjection, index: SnapshotIndex, heads: Map<string, SourceHead>, now: Date) {
  const counties: SnapshotData["counties"] = {};
  for (const row of Object.values(projection.counties)) counties[row.fips] = { ...row };
  const view: SnapshotData = { ...index, counties, fireWeather: projection.fireWeather,
    sources: index.sources.map((source) => ({ ...source })), changed: {} };
  withCurrentLinks(view);
  applyChecks(view, heads, now, index.orderChecks);
  return withFireWeather(view, now.getTime(), index.weatherChecked);
}

// Limit work on sparse pages as well as dense ones. A cursor advances over candidate evidence
// even when every decision in this window has expired.
const MAX_CANDIDATES_PER_PAGE = 250;

export function formatNationalBans(projection: ActiveProjection, index: SnapshotIndex, heads: Map<string, SourceHead>, now: Date, page?: BansPage) {
  const { bans, raw, bodyStart } = projection;
  const clock = now.getTime();
  const checks = reportChecks(index, heads, index.orderChecks);
  let waiting = page ? pageStart(page, index.revision, bans.length) : 0;
  const stop = page ? Math.min(bans.length, waiting + MAX_CANDIDATES_PER_PAGE) : bans.length;
  const counties: CountyStatus[] = [];
  let nextBoundary = Infinity;
  let weather: SnapshotData | undefined;
  let cursor = bodyStart;
  for (let i = 0; i < waiting; i++) cursor += retainedLength(bans[i]);
  for (; waiting < stop; waiting++) {
    const entry = bans[waiting];
    const end = cursor + retainedLength(entry);
    let row: CountyStatus | undefined;
    if (entry.length === 1) {
      if (!weather) {
        weather = projectWeather(projection, index, heads, now);
        nextBoundary = Math.min(nextBoundary, weatherBoundary(weather, clock, index.weatherChecked));
      }
      row = weather.counties[entry[0]];
    } else {
      row = rawCounty(raw, entry, cursor, end);
      withCurrentCountyLinks(row);
      applyCountyEvidence(row, checks);
    }
    cursor = end;
    if (!row) continue;
    nextBoundary = Math.min(nextBoundary, countyBoundary(row, clock));
    const decision = countyDecision(withReportDates(row), clock);
    if (!active(decision)) continue;
    if (page && counties.length === page.limit) break;
    counties.push(decision);
  }
  const sources = weather?.sources ?? index.sources.map((source) => ({ ...source }));
  if (!weather) applySourceChecks(sources, heads);
  const { generated, revision } = index;
  const paging = page && pageFields(revision, counties.length, waiting, bans.length);
  return { data: { generated, counties, sources, disclaimer: DISCLAIMER, ...paging },
    generated, count: counties.length, nextBoundary };
}
