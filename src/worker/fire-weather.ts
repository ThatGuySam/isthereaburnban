import type { CountyStatus, Snapshot } from "../shared/types";
import { statusFor } from "./lookup";
import { alertIsCurrent } from "./sources/nws/alerts";

/** Overlay current weather on the publication without advancing status history or notifications. */
export function withFireWeather(snapshot: Snapshot, now = Date.now()): Snapshot {
  if (!snapshot.fireWeather) return snapshot;
  let counties: Snapshot["counties"] | undefined;
  for (const [fips, weather] of Object.entries(snapshot.fireWeather)) {
    const alerts = weather.alerts.filter((alert) => alertIsCurrent(alert, now));
    const orders = weather.orders?.filter(({ validFrom, validUntil }) =>
      validFrom && validUntil && Date.parse(validFrom) <= now && now < Date.parse(validUntil))
      .map(({ retainAfter: _retainAfter, ...order }) => order);
    if (!alerts.length && !orders?.length) continue;
    const base = statusFor(snapshot, fips);
    const row: CountyStatus = { ...base, alerts: alerts.length ? alerts : undefined };
    if (orders?.length) {
      const [rule] = orders;
      row.orders = [...(base.orders ?? []), ...orders];
      if (base.status === "unknown" || base.status === "none") {
        Object.assign(row, rule, { sourceUrl: rule.officialUrl });
      }
    }
    (counties ??= { ...snapshot.counties })[fips] = row;
  }
  return counties ? { ...snapshot, counties } : snapshot;
}
