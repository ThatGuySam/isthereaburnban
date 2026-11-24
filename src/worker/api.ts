import type { CountyStatus, SnapshotData } from "../shared/types";
import { activeStatus, countyDecision } from "./county-decision";
import { STATES_DIR } from "./counties";
import { withReportDates } from "./report-dates";
import { DISCLAIMER } from "./lookup";

/** Active bans and restrictions, optionally for one state. */
export function activeBans(snapshot: SnapshotData, state?: string, now = Date.now()) {
  const st = state?.trim().toUpperCase();
  const counties: CountyStatus[] = Object.values(snapshot.counties)
    .filter((c) => !st || c.state === st)
    .map((c) => countyDecision(withReportDates(c), now))
    .filter((c) => activeStatus(c.status))
    .sort((a, b) => a.state.localeCompare(b.state) || a.county.localeCompare(b.county));
  const sources = snapshot.sources.filter((s) => !st || s.state === st);
  return { generated: snapshot.generated, counties, sources, disclaimer: DISCLAIMER };
}

export function coverage(snapshot: Pick<SnapshotData, "generated" | "sources">) {
  return { generated: snapshot.generated, states: STATES_DIR, sources: snapshot.sources, disclaimer: DISCLAIMER };
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
  return { generated: snapshot.generated, counties, source, disclaimer: DISCLAIMER };
}
