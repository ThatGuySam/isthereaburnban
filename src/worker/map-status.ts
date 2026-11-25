import type { MapStatus, SnapshotData } from "../shared/types";
import { countyBoundary, countyDecision } from "./county-decision";
import { weatherBoundary } from "./fire-weather";

export const MAP_TTL_MS = 60_000;

export function statusCacheControl(boundary: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor(Math.min(MAP_TTL_MS, boundary - now) / 1_000));
  return `public, max-age=${seconds}, must-revalidate`;
}

export function snapshotBoundary(snapshot: SnapshotData, now: number): number {
  let next = weatherBoundary(snapshot, now);
  for (const row of Object.values(snapshot.counties)) next = Math.min(next, countyBoundary(row, now));
  return next;
}

export function projectMapStatus(revision: string, snapshots: SnapshotData[], now: number): MapStatus {
  const result: MapStatus = { revision, expiresAt: now + MAP_TTL_MS, counties: {} };
  for (const snapshot of snapshots) {
    result.expiresAt = Math.min(result.expiresAt, weatherBoundary(snapshot, now));
    for (const row of Object.values(snapshot.counties)) {
      const decision = countyDecision(row, now);
      if (decision.status !== "unknown") result.counties[row.fips] = decision.status;
      result.expiresAt = Math.min(result.expiresAt, countyBoundary(row, now));
    }
  }
  return result;
}
