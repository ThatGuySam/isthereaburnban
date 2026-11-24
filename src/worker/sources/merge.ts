import type { CountyStatus, FireWeatherReport, ScopedOrder, Snapshot, SnapshotData, SourceHealth } from "../../shared/types";
import { activeStatus, countyDecision, isScopedBan, STALE_MS } from "../county-decision";
export { STALE_MS } from "../county-decision";
import type { Transition } from "../notification-message";
import type { Source } from "./types";

export type SourceInput = {
  source: Pick<Source, "id" | "state" | "mode" | "product"> & Partial<Pick<Source, "scope" | "officialUrl" | "recurring">>;
  rows: (Omit<CountyStatus, "checked"> & Partial<Pick<CountyStatus, "checked">>)[];
  fireWeather?: FireWeatherReport[];
  lastGood?: string;
  checked: string;
  staleMs?: number;
  error?: string;
  version?: string;
};

const RANK = { unknown: 0, none: 1, restricted: 2, ban: 3 };
const active = (row: CountyStatus) => activeStatus(row.status);

type CheckedCounty = CountyStatus & { checked: string };
type Candidate = { row: CheckedCounty; confirmed: boolean };
type CountyCandidates = Candidate | Candidate[];
function better(current: Candidate | undefined, candidate: Candidate) {
  if (!current) return candidate;
  const rank = RANK[candidate.row.status] - RANK[current.row.status];
  if (rank) return rank > 0 ? candidate : current;
  if (candidate.confirmed !== current.confirmed) return candidate.confirmed ? candidate : current;
  return candidate.row.scope === "county" && current.row.scope === "state" ? candidate : current;
}

function order(row: CheckedCounty): ScopedOrder {
  const { status, label, note, since, expires, sourceId, sourceName, sourceUpdated, sourceUrl, officialUrl, checked, validFrom, validUntil, standing, scopedBan } = row;
  return { status, label, note, since, expires, sourceId, sourceName, sourceUpdated, sourceUrl, officialUrl, checked, validFrom, validUntil, standing, scopedBan,
    scope: row.scope ?? "county", scopeNote: row.scopeNote ?? row.label };
}

function summarize(group: CountyCandidates, now: number): Candidate | undefined {
  if (!Array.isArray(group) && group.row.scope !== "part" && !group.row.standing) {
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
    if (row.scope === "part" || row.standing) {
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
    row.scopedBan = selected !== upcoming && isScopedBan(row) ? true : undefined;
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
export function mergeSources(prev: SnapshotData | null, inputs: SourceInput[], now: Date) {
  const at = now.toISOString();
  const clock = now.getTime();
  const counties: Record<string, CountyStatus> = {};
  const changed = { ...prev?.changed };
  const sources: SourceHealth[] = [];
  const sourceVersions: Record<string, string> = {};
  const groups = new Map<string, CountyCandidates>();
  const fireWeather: NonNullable<Snapshot["fireWeather"]> = {};
  const transitions: Transition[] = [];
  const recurring = new Set(inputs.filter((i) => i.source.recurring).map((i) => i.source.id));

  for (const { source, rows, fireWeather: reports, checked, lastGood, staleMs = STALE_MS, error, version } of inputs) {
    if (version) sourceVersions[source.id] = version;
    const mapped = new Set<string>();
    const bans = new Set<string>();
    const health = { checked, lastAttemptedAt: source.mode === "manual" ? null : checked,
      lastSuccessfulAt: lastGood ?? (error ? null : checked), ok: !error, error };
    const defaultChecked = lastGood ?? checked;
    const defaultStale = clock - Date.parse(defaultChecked) > staleMs;
    if (source.product === "fire-weather") {
      for (const { fips, alerts, orders } of reports ?? []) {
        if (defaultStale || !alerts?.length) continue;
        fireWeather[fips] = { alerts, orders: orders?.map((entry) => ({ ...entry, checked: defaultChecked })) };
        mapped.add(fips);
      }
      sources.push({ id: source.id, state: source.state, mode: source.mode, product: source.product,
        officialUrl: source.officialUrl, ...health, counties: mapped.size, bans: 0 });
      continue;
    }
    for (const value of rows) {
      const seen = lastGood ?? value.checked ?? defaultChecked;
      const stale = seen === defaultChecked ? defaultStale : clock - Date.parse(seen) > staleMs;
      const row: CheckedCounty = { ...value, checked: seen, scope: value.scope ?? source.scope, sourceId: source.id };
      if (stale) {
        row.since = null;
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
      officialUrl: source.officialUrl, ...health, counties: mapped.size, bans: bans.size });
  }

  // A verified standing rule can run until local midnight after a warning ends.
  // An earlier disappearance (such as cancellation) drops the derived order.
  if (sources.some((source) => source.product === "fire-weather")) {
    for (const [fips, report] of Object.entries(prev?.fireWeather ?? {})) {
      for (const prior of report.orders ?? []) {
        if (!prior.retainAfter || prior.retainAfter > at || !prior.validUntil || prior.validUntil <= at) continue;
        const weather = fireWeather[fips] ??= { alerts: [] };
        const orders = weather.orders ??= [];
        if (!orders.some((entry) => entry.sourceId === prior.sourceId && entry.validFrom === prior.validFrom &&
          entry.validUntil === prior.validUntil)) orders.push({ ...prior, carried: true });
      }
    }
  }

  for (const [fips, group] of groups) {
    const result = summarize(group, clock);
    if (!result) {
      if (prev?.counties[fips]) changed[fips] = at;
      continue;
    }
    const { row, confirmed } = result;
    const previous = prev?.counties[fips];
    row.firstSeenAt = previous?.firstSeenAt ?? at;
    row.statusChangedAt = previous?.statusChangedAt ?? null;
    const before = previous && countyDecision(previous, Date.parse(prev.generated));
    const decision = countyDecision(row, clock);
    const decisionSource = Array.isArray(group) ? group.find((entry) =>
      entry.row.sourceId === decision.sourceId && entry.row.scopeNote === decision.scopeNote) : group;
    const isRecurring = recurring.has(decision.sourceId ?? "");
    const newScopedBan = before && before.status !== "ban" && isScopedBan(decision) &&
      (!isScopedBan(before) || before.sourceId !== decision.sourceId || before.scopeNote !== decision.scopeNote ||
        before.officialUrl !== decision.officialUrl || before.since !== decision.since);
    const newBan = (decision.status === "ban" || newScopedBan) && !isRecurring;
    const statusChanged = before && before.status !== decision.status;
    if (statusChanged) row.statusChangedAt = at;
    if (!before) {
      changed[fips] = at;
    } else if ((statusChanged || newScopedBan) && !newBan && (isRecurring || recurring.has(before.sourceId ?? ""))) {
      // A scheduled calendar window opened or closed: not news, no alert, no lastmod churn.
    } else if (statusChanged || newScopedBan) {
      changed[fips] = at;
      const retainedAuthority = !before.sourceId || before.sourceId === decision.sourceId ||
        (Array.isArray(group) && group.some((candidate) => candidate.confirmed && candidate.row.sourceId === before.sourceId));
      const lostAuthority = !newScopedBan && (!retainedAuthority || (before.status === "ban" && decision.scope === "part"));
      if ((decisionSource?.confirmed ?? confirmed) && !lostAuthority && decision.status !== "unknown") {
        transitions.push({ fips, oldStatus: before.status, newStatus: decision.status, at });
      }
    }
    counties[fips] = row;
  }

  const snapshot: Snapshot = { version: 1, generated: at, counties, sources, changed, sourceVersions,
    ...(Object.keys(fireWeather).length ? { fireWeather } : {}) };
  return { snapshot, transitions };
}
