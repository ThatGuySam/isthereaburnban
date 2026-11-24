import type { CountyStatus, FireWeatherReport, RuleReview, Snapshot, SnapshotData, SourceHealth } from "../../shared/types";
import { countyDecision, isScopedBan, storeCountyReports } from "../county-decision";
import { checkDeadline, evidenceInEffect } from "../../shared/evidence";
export { STALE_MS } from "../county-decision";
import type { Transition } from "../notification-message";
import type { ActiveSource, Source } from "./types";
import { reviewWindow } from "./statutory-fallback";

export type SourceInput = {
  source: Pick<Source, "id" | "state" | "mode" | "product"> & Partial<Pick<ActiveSource, "scope" | "officialUrl" | "recurring" | "staleMs">>;
  rows: (Omit<CountyStatus, "checked"> & Partial<Pick<CountyStatus, "checked">>)[];
  fireWeather?: FireWeatherReport[];
  lastGood?: string;
  checked: string;
  staleMs?: number;
  error?: string;
  failedSince?: string;
  ruleReview?: RuleReview;
  version?: string;
};

/** Merge independently scoped reports before comparing any county status with its previous value. */
export function mergeSources(prev: SnapshotData | null, inputs: SourceInput[], now: Date) {
  const at = now.toISOString();
  const clock = now.getTime();
  const counties: SnapshotData["counties"] = {};
  const changed = { ...prev?.changed };
  const answers: Record<string, CountyStatus> = {};
  const previousTime = Date.parse(prev?.generated ?? "");
  const previousClock = Number.isFinite(previousTime) ? previousTime : clock;
  const sources: SourceHealth[] = [];
  const sourceVersions: Record<string, string> = {};
  const groups = new Map<string, CountyStatus | CountyStatus[]>();
  const ended = new Set<string>();
  const fireWeather: NonNullable<Snapshot["fireWeather"]> = {};
  let weatherChecked: string | undefined;
  const transitions: Transition[] = [];
  const recurring = new Set(inputs.filter((i) => i.source.recurring).map((i) => i.source.id));

  for (const { source, rows, fireWeather: reports, checked, lastGood, staleMs: configured = source.staleMs, error,
    failedSince, ruleReview, version } of inputs) {
    if (version) sourceVersions[source.id] = version;
    const mapped = new Set<string>();
    const bans = new Set<string>();
    const successful = lastGood ?? (error ? null : checked);
    const staleMs = ruleReview ? reviewWindow(ruleReview) : configured;
    const attempted = source.mode !== "manual" && error !== "Awaiting first source refresh";
    const outage = error && attempted ? failedSince ?? checked : undefined;
    const health = { checked, lastAttemptedAt: attempted ? checked : null,
      lastSuccessfulAt: successful, ok: !error, error, failedSince: outage, staleMs, ruleReview };
    const timing = { ...(staleMs === undefined ? {} : { staleMs }),
      ...(outage ? { sourceCheckFailed: true as const, sourceFailedSince: outage, lastAttemptedAt: checked } : {}) };
    if (source.product === "fire-weather") {
      weatherChecked = successful ?? undefined;
      for (const { fips, alerts, orders } of reports ?? []) {
        if (!successful || clock >= checkDeadline(successful, staleMs) || !alerts?.length) continue;
        fireWeather[fips] = { alerts, orders: orders?.map((entry) => ({ ...entry, checked: successful, ...timing })) };
        mapped.add(fips);
      }
      sources.push({ id: source.id, state: source.state, mode: source.mode, product: source.product,
        officialUrl: source.officialUrl, ...health, counties: mapped.size, bans: 0 });
      continue;
    }
    for (const value of rows) {
      if (value.validUntil && Date.parse(value.validUntil) <= clock) {
        ended.add(value.fips);
        continue;
      }
      const row: CountyStatus = { ...value, ...timing, checked: ruleReview?.reviewedAt ?? lastGood ?? value.checked ?? successful,
        scope: value.scope ?? source.scope, sourceId: source.id };
      mapped.add(row.fips);
      if (row.status === "ban" && row.scope !== "part" && evidenceInEffect(row, clock)) bans.add(row.fips);
      const group = groups.get(row.fips);
      if (Array.isArray(group)) group.push(row);
      else groups.set(row.fips, group ? [group, row] : row);
    }
    sources.push({ id: source.id, state: source.state, mode: source.mode, scope: source.scope,
      officialUrl: source.officialUrl, ...health, counties: mapped.size, bans: bans.size });
  }

  // A verified standing rule can run until local midnight after a warning ends.
  // An earlier disappearance (such as cancellation) drops the derived order.
  if (sources.some((source) => source.product === "fire-weather" && source.ok)) {
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
    const { row, answer: decision } = storeCountyReports(group, clock);
    const previous = prev?.counties[fips];
    row.firstSeenAt = previous?.firstSeenAt ?? at;
    row.statusChangedAt = previous?.statusChangedAt ?? null;
    const before = previous && countyDecision(previous, previousClock);
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
        (Array.isArray(group) && group.some((candidate) => !candidate.sourceCheckFailed && candidate.sourceId === before.sourceId));
      const lostAuthority = !newScopedBan && (!retainedAuthority || (before.status === "ban" && decision.scope === "part"));
      const repeatsDisputedBan = decision.status === "ban" && before.conflict?.reports.some((report) =>
        report.status === "ban" && report.sourceId === decision.sourceId && report.since === decision.since);
      if (!decision.sourceCheckFailed && !lostAuthority && !repeatsDisputedBan && decision.status !== "unknown") {
        transitions.push({ fips, oldStatus: before.status, newStatus: decision.status, at });
      }
    }
    counties[fips] = row;
    decision.firstSeenAt = row.firstSeenAt;
    decision.statusChangedAt = row.statusChangedAt;
    answers[fips] = decision;
  }
  for (const fips of ended) if (!counties[fips] && prev?.counties[fips]) changed[fips] = at;

  const snapshot: Snapshot = { version: 1, generated: at, counties, sources, changed, sourceVersions,
    ...(Object.keys(fireWeather).length ? { fireWeather, weatherChecked } : {}) };
  return { snapshot, transitions, answers };
}
