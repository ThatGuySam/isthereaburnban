import type { SnapshotData, SourceHealth } from "../shared/types";
import { COUNTY_BY_FIPS } from "./counties";
import { prepareBanEntries, type BanEntry } from "./active-bans";

export const INDEX_KEY = "snapshot:v2:index";
// A separate body keeps coverage, sitemap and county requests off the national list.
export const ACTIVE_KEY = "snapshot:v2:active";
export const PRETTY_ACTIVE_KEY = "snapshot:v2:active:pretty";
export const stateKey = (state: string) => `snapshot:v2:${state}`;

export type StateSnapshot = SnapshotData & { version: 2; state: string; revision: string };
export type StateReference = { revision: string; signature: string; cached: boolean; lastChanged?: string };
export type SnapshotIndex = Pick<SnapshotData, "generated" | "sources" | "sourceVersions"> & {
  version: 2;
  revision: string;
  states: Partial<Record<string, StateReference>>;
  orderChecks: Record<string, string>;
  weatherChecked?: string;
};

type ActiveHeader = Pick<SnapshotData, "counties" | "fireWeather"> & { revision: string; bans: BanEntry[] };
export type ActiveProjection = ActiveHeader & { bodyStart: number; raw: string };
export type StateSummary = Pick<SnapshotData, "sourceVersions"> & {
  signature: string;
  lastChanged?: string;
  sources: SourceHealth[];
};

export function latest(dates: Iterable<string | undefined>): string | undefined {
  let best: string | undefined;
  let time = -Infinity;
  for (const date of dates) {
    const candidate = date ? Date.parse(date) : NaN;
    if (candidate > time) {
      time = candidate;
      best = date;
    }
  }
  return best;
}

export function lastChangedByState(changed: SnapshotData["changed"]) {
  const states: Record<string, string[]> = {};
  for (const [fips, date] of Object.entries(changed)) {
    const state = COUNTY_BY_FIPS.get(fips)?.state;
    if (state) (states[state] ??= []).push(date);
  }
  return Object.fromEntries(Object.entries(states).map(([state, dates]) => [state, latest(dates)]));
}

type ActiveFragments = { active: string; weatherCounties: string; weather: string };

export function encodeState(snapshot: StateSnapshot, signature: string) {
  const { sources, sourceVersions, fireWeather, changed } = snapshot;
  const summary: StateSummary = { signature, sources, sourceVersions, lastChanged: latest(Object.values(changed)) };
  const { compact, pretty, weatherCounties } = prepareBanEntries(snapshot);
  return {
    snapshot: JSON.stringify(snapshot), summary: JSON.stringify(summary),
    active: compact, pretty,
    weatherCounties: JSON.stringify(weatherCounties).slice(1, -1),
    weather: fireWeather ? JSON.stringify(fireWeather).slice(1, -1) : "",
  };
}

/** A JSON header holds the dynamic fields. County bodies follow unescaped and in the same order. */
export function encodeActive(revision: string, rows: ActiveFragments[]) {
  const headers: string[] = [];
  const bodies: string[] = [];
  for (const { active } of rows) {
    const newline = active.indexOf("\n");
    if (newline > 0) headers.push(active.slice(0, newline));
    bodies.push(active.slice(newline + 1));
  }
  const collect = (field: "weatherCounties" | "weather") => rows.map((row) => row[field]).filter(Boolean).join(",");
  return `{"revision":${JSON.stringify(revision)},"bans":[${headers.join(",")}],"counties":{${collect("weatherCounties")}},"fireWeather":{${collect("weather")}}}\n${bodies.join("")}`;
}

export function decodeActive(raw: string): ActiveProjection {
  const newline = raw.indexOf("\n");
  if (newline < 1) throw new Error("Active projection missing its header");
  const header: ActiveHeader = JSON.parse(raw.slice(0, newline));
  return { ...header, raw, bodyStart: newline + 1 };
}
