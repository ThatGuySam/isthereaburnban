import type { CountyStatus, ScopedOrder, Snapshot, SourceHealth } from "../../shared/types";
import type { Transition } from "../notification-message";
import type { Source } from "./types";

export const STALE_MS = 48 * 60 * 60 * 1000;

export type SourceInput = {
  source: Pick<Source, "id" | "state" | "mode"> & Partial<Pick<Source, "scope" | "officialUrl">>;
  rows: (Omit<CountyStatus, "checked"> & { checked?: string })[];
  lastGood?: string;
  checked: string;
  staleMs?: number;
  error?: string;
  version?: string;
};

const RANK = { unknown: 0, none: 1, restricted: 2, ban: 3 };
const active = (row: CountyStatus) => row.status === "ban" || row.status === "restricted";

type Candidate = { row: CountyStatus; confirmed: boolean };
type CountyCandidates = Candidate | Candidate[];
function better(current: Candidate | undefined, candidate: Candidate) {
  if (!current) return candidate;
  const rank = RANK[candidate.row.status] - RANK[current.row.status];
  if (rank) return rank > 0 ? candidate : current;
  if (candidate.confirmed !== current.confirmed) return candidate.confirmed ? candidate : current;
  return candidate.row.scope === "county" && current.row.scope === "state" ? candidate : current;
}

function order(row: CountyStatus): ScopedOrder {
  const { status, label, note, since, expires, sourceId, sourceName, sourceUpdated, officialUrl, checked, validFrom, validUntil } = row;
  return { status, label, note, since, expires, sourceId, sourceName, sourceUpdated, officialUrl, checked, validFrom, validUntil,
    scope: row.scope ?? "county", scopeNote: row.scopeNote ?? row.label };
}

function summarize(group: CountyCandidates, now: number): Candidate | undefined {
  if (!Array.isArray(group) && group.row.scope !== "part") {
    const row = group.row;
    if ((row.validFrom && Date.parse(row.validFrom) > now) || (row.validUntil && Date.parse(row.validUntil) <= now)) return;
    return group;
  }
  const entries = Array.isArray(group) ? group : [group];
  let broad: Candidate | undefined;
  let local: Candidate | undefined;
  let upcoming: Candidate | undefined;
  const orders: ScopedOrder[] = [];
  const localNotes = new Set<string>();
  for (const entry of entries) {
    const { row } = entry;
    if (row.validUntil && Date.parse(row.validUntil) <= now) continue;
    const future = row.validFrom && Date.parse(row.validFrom) > now;
    if (row.scope === "part") {
      orders.push(order(row));
      if (row.status !== "unknown") {
        const text = `${row.label} (${row.scopeNote ?? row.sourceName})`;
        localNotes.add(future ? `Upcoming ${text}` : text);
      }
      if (future) upcoming ??= { row, confirmed: false };
      else local = better(local, entry);
    } else if (!future) broad = better(broad, entry);
  }
  const selected = broad && broad.row.status !== "unknown" ? broad : local && active(local.row) ? local : broad ?? local ?? upcoming;
  if (!selected) return;
  const row = selected.row;
  if (row.scope === "part") {
    row.status = selected !== upcoming && active(row) ? "restricted" : "unknown";
    if (row.status === "unknown") row.label = "Countywide status unconfirmed";
    else if (row.scopeNote && !row.label.includes(row.scopeNote)) row.label += ` (${row.scopeNote})`;
  }
  if (orders.length) {
    row.orders = orders;
    const others = [...localNotes].filter((note) => note !== row.label);
    if (others.length) row.note = [row.note, `Local reports include ${others.join(". ")}.`].filter(Boolean).join(" ");
  }
  return { row, confirmed: selected.confirmed };
}

/** Merge independently scoped reports before comparing any county status with its previous value. */
export function mergeSources(prev: Snapshot | null, inputs: SourceInput[], now: Date) {
  const at = now.toISOString();
  const clock = now.getTime();
  const counties: Record<string, CountyStatus> = {};
  const changed = { ...prev?.changed };
  const sources: SourceHealth[] = [];
  const sourceVersions: Record<string, string> = {};
  const groups = new Map<string, CountyCandidates>();
  const transitions: Transition[] = [];

  for (const { source, rows, checked, lastGood, staleMs = STALE_MS, error, version } of inputs) {
    if (version) sourceVersions[source.id] = version;
    const mapped = new Set<string>();
    const bans = new Set<string>();
    const defaultChecked = lastGood ?? checked;
    const defaultStale = clock - Date.parse(defaultChecked) > staleMs;
    for (const value of rows) {
      const seen = lastGood ?? value.checked ?? defaultChecked;
      const stale = seen === defaultChecked ? defaultStale : clock - Date.parse(seen) > staleMs;
      const row: CountyStatus = { ...value, checked: seen, scope: value.scope ?? source.scope, sourceId: source.id };
      if (stale) {
        row.status = "unknown";
        row.label = `Source unavailable. Our last good data is over ${staleMs / 3_600_000} hours old`;
        row.note = undefined;
      }
      if (!row.validUntil || Date.parse(row.validUntil) > clock) {
        mapped.add(row.fips);
        if (row.status === "ban" && row.scope !== "part" && (!row.validFrom || Date.parse(row.validFrom) <= clock)) {
          bans.add(row.fips);
        }
      }
      const entry = { row, confirmed: !error && !stale };
      const group = groups.get(row.fips);
      if (Array.isArray(group)) group.push(entry);
      else groups.set(row.fips, group ? [group, entry] : entry);
    }
    sources.push({ id: source.id, state: source.state, mode: source.mode, scope: source.scope,
      officialUrl: source.officialUrl, checked, ok: !error, error, counties: mapped.size, bans: bans.size });
  }

  for (const [fips, group] of groups) {
    const result = summarize(group, clock);
    if (!result) {
      if (prev?.counties[fips]) changed[fips] = at;
      continue;
    }
    const { row, confirmed } = result;
    const before = prev?.counties[fips];
    if (!before) {
      changed[fips] = row.since ?? row.sourceUpdated ?? at;
    } else if (before.status !== row.status) {
      changed[fips] = at;
      const retainedAuthority = !before.sourceId || before.sourceId === row.sourceId ||
        (Array.isArray(group) && group.some((candidate) => candidate.confirmed && candidate.row.sourceId === before.sourceId));
      const lostAuthority = !retainedAuthority || (before.scope !== "part" && row.scope === "part");
      if (confirmed && !lostAuthority && row.status !== "unknown") {
        transitions.push({ fips, oldStatus: before.status, newStatus: row.status, at });
      }
    }
    if (!row.since) row.since = before?.status === row.status && before.since ? before.since : changed[fips] ?? at;
    counties[fips] = row;
  }

  const snapshot: Snapshot = { version: 1, generated: at, counties, sources, changed, sourceVersions };
  return { snapshot, transitions };
}
