import type { MapStatus, SnapshotData } from "../shared/types";
import { countyDecision, STALE_MS } from "./county-decision";

export const MAP_TTL_MS = 60_000;

export function projectMapStatus(revision: string, snapshots: SnapshotData[], now: number): MapStatus {
  const result: MapStatus = { revision, expiresAt: now + MAP_TTL_MS, counties: {} };
  const boundary = (at: number) => {
    if (now < at && at < result.expiresAt) result.expiresAt = at;
  };
  const validWindow = ({ validFrom, validUntil }: { validFrom?: string; validUntil?: string }) => {
    if (validFrom) boundary(Date.parse(validFrom));
    if (validUntil) boundary(Date.parse(validUntil));
  };
  for (const snapshot of snapshots) {
    for (const row of Object.values(snapshot.counties)) {
      const decision = countyDecision(row, now);
      if (decision.status !== "unknown") {
        result.counties[row.fips] = decision.status;
        if (decision.checked) boundary(Date.parse(decision.checked) + STALE_MS);
      }
      validWindow(row);
      for (const order of row.orders ?? []) validWindow(order);
    }
    for (const report of Object.values(snapshot.fireWeather ?? {})) {
      for (const order of report.orders ?? []) validWindow(order);
    }
  }
  return result;
}
