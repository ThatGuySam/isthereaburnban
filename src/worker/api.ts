import type { CountyStatus, SnapshotData } from "../shared/types";
import { activeStatus, countyDecision } from "./county-decision";
import { countiesInState, STATES_DIR } from "./counties";
import { withReportDates } from "./report-dates";
import { DISCLAIMER } from "./lookup";
import { SOURCES } from "./sources/registry";

const SOURCE_BY_ID = new Map(SOURCES.map((source) => [source.id, source]));

/** Active bans and restrictions, optionally for one state. */
export function activeBans(snapshot: SnapshotData, state?: string, now = Date.now()) {
  const st = state?.trim().toUpperCase();
  const reports = Object.values(snapshot.counties)
    .filter((c) => !st || c.state === st)
    .map((c) => countyDecision(withReportDates(c), now));
  const counties: CountyStatus[] = reports.filter((c) => activeStatus(c.status))
    .sort((a, b) => a.state.localeCompare(b.state) || a.county.localeCompare(b.county));
  const sources = snapshot.sources.filter((s) => !st || s.state === st);
  const unknownCount = st ? countiesInState(st).length - reports.filter((row) => row.status !== "unknown").length : undefined;
  return { generated: snapshot.generated, counties, sources, unknownCount, disclaimer: DISCLAIMER };
}

export function coverage(snapshot: Pick<SnapshotData, "generated" | "sources">) {
  const sources = snapshot.sources.map((source) => {
    const meta = SOURCE_BY_ID.get(source.id);
    return meta ? { ...source, sourceName: meta.sourceName, sourceUrl: meta.sourceUrl, cadence: meta.cadence } : source;
  });
  return { generated: snapshot.generated, states: STATES_DIR, sources, disclaimer: DISCLAIMER };
}

export function activeFireWeather(snapshot: SnapshotData, state?: string) {
  const st = state?.trim().toUpperCase();
  const counties = Object.keys(snapshot.fireWeather ?? {}).sort().flatMap((fips) => {
    const row = snapshot.counties[fips];
    if (!row?.alerts?.length || (st && row.state !== st)) return [];
    const { state, county, alerts } = row;
    return [{ fips, state, county, alerts }];
  });
  const source = snapshot.sources.find((entry) => entry.product === "fire-weather") ?? null;
  const message = counties.length ? undefined : "No matching published fire-weather signal.";
  return { generated: snapshot.generated, counties, source, message, disclaimer: DISCLAIMER };
}
