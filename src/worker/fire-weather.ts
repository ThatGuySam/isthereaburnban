import { checkDeadline, evidenceInEffect, fireWeatherDeadline, nextEvidenceBoundary } from "../shared/evidence";
import type { CountyStatus, FireWeatherOrder, ScopedOrder, SnapshotData } from "../shared/types";
import { countyBoundary } from "./county-decision";
import { statusFor } from "./lookup";
import { nwsFireWeather } from "./sources/nws/alerts";

function weatherCheck(snapshot: SnapshotData, published?: string) {
  const source = snapshot.sources.find((item) => item.product === "fire-weather");
  const checked = published ?? snapshot.weatherChecked ?? source?.lastSuccessfulAt ?? snapshot.generated;
  const staleMs = source?.staleMs ?? (source?.id === nwsFireWeather.id ? nwsFireWeather.staleMs : undefined);
  return { source, checked, staleMs };
}

function timedOrder(order: FireWeatherOrder, time: ReturnType<typeof weatherCheck>, now: number): ScopedOrder {
  const { retainAfter, carried, ...report } = order;
  // A rule can remain in force past a warning's scheduled end, at most through its known local cutoff.
  const retained = carried || (retainAfter && now >= Date.parse(retainAfter) && checkDeadline(time.checked, time.staleMs) > Date.parse(retainAfter));
  if (retained && report.validUntil) {
    return { ...report, staleMs: Date.parse(report.validUntil) - Date.parse(report.checked) };
  }
  const { source, checked, staleMs } = time;
  const failedSince = source && !source.ok ? source.failedSince ?? source.lastAttemptedAt : undefined;
  return { ...report, checked, staleMs,
    sourceFailedSince: failedSince ?? undefined, sourceCheckFailed: failedSince ? true : undefined,
    lastAttemptedAt: failedSince ? source?.lastAttemptedAt ?? undefined : undefined };
}

export function weatherBoundary(snapshot: SnapshotData, now: number, published?: string): number {
  let next = snapshot.nextBoundary ?? Infinity;
  if (!snapshot.fireWeather) return next;
  const timing = weatherCheck(snapshot, published);
  const deadline = checkDeadline(timing.checked, timing.staleMs);
  for (const report of Object.values(snapshot.fireWeather)) {
    if (report.alerts.length && deadline > now) {
      for (const alert of report.alerts) {
        const end = fireWeatherDeadline(alert);
        if (end > now) next = Math.min(next, deadline, end);
      }
    }
    for (const order of report.orders ?? []) next = Math.min(next, nextEvidenceBoundary(timedOrder(order, timing, now), now));
  }
  return next;
}

/** Overlay current weather on the publication without advancing status history or notifications. */
export function withFireWeather<T extends SnapshotData>(snapshot: T, now = Date.now(), published?: string): T {
  if (!snapshot.fireWeather) return snapshot;
  const timing = weatherCheck(snapshot, published);
  const weatherFresh = now < checkDeadline(timing.checked, timing.staleMs);
  let counties: SnapshotData["counties"] | undefined;
  let nextBoundary = snapshot.nextBoundary ?? Infinity;
  for (const [fips, weather] of Object.entries(snapshot.fireWeather)) {
    const alerts = weatherFresh ? weather.alerts.filter((alert) => fireWeatherDeadline(alert) > now) : [];
    const orders = weather.orders?.map((order) => timedOrder(order, timing, now)).filter((order) => evidenceInEffect(order, now));
    if (!alerts.length && !orders?.length) continue;

    const saved = snapshot.counties[fips];
    // Keep other reports available when there is only a weather alert to display.
    let row: CountyStatus = { ...(saved ?? statusFor(snapshot, fips, now)), alerts: alerts.length ? alerts : undefined };
    if (orders?.length) {
      const base = statusFor(snapshot, fips, now);
      row = { ...base, alerts: row.alerts, orders: [...(base.orders ?? []), ...orders] };
      if (saved) nextBoundary = Math.min(nextBoundary, countyBoundary(saved, now));
      if (!base.conflict && (base.status === "unknown" || base.status === "none")) {
        const [rule] = orders;
        Object.assign(row, { sourceCheckFailed: undefined, sourceFailedSince: undefined, lastAttemptedAt: undefined }, rule,
          { sourceUrl: rule.officialUrl });
      }
    }
    (counties ??= { ...snapshot.counties })[fips] = row;
  }
  return counties ? { ...snapshot, counties, nextBoundary } : snapshot;
}
