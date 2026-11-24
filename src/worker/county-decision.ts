import { DEFAULT_STALE_MS, evidenceDeadline, evidenceInEffect, nextEvidenceBoundary } from "../shared/evidence";
import type { CountyReport, CountyStatus, ScopedOrder, StoredCountyStatus } from "../shared/types";

export { DEFAULT_STALE_MS as STALE_MS };

export function activeStatus(status: CountyStatus["status"]): boolean {
  return status === "ban" || status === "restricted";
}

export function isScopedBan(row: Pick<CountyStatus, "status" | "scope" | "scopedBan">): boolean {
  return row.scope === "part" && (row.status === "ban" || (row.status === "restricted" && row.scopedBan === true));
}

const RANK = { unknown: 0, none: 1, restricted: 2, ban: 3 };
type Report = CountyReport | ScopedOrder;

function preferred(current: Report | undefined, report: Report): Report {
  if (!current) return report;
  const rank = RANK[report.status] - RANK[current.status];
  if (rank) return rank > 0 ? report : current;
  if (Boolean(report.sourceCheckFailed) !== Boolean(current.sourceCheckFailed)) {
    return report.sourceCheckFailed ? current : report;
  }
  return report.scope === "county" && current.scope === "state" ? report : current;
}

function currentReport<T extends Report>(report: T, now: number): T {
  if (report.status === "unknown") return report;
  if (report.validFrom && Date.parse(report.validFrom) > now) {
    return { ...report, status: "unknown", label: "Scheduled order has not started" };
  }
  if (!(now < evidenceDeadline(report))) {
    const ended = report.validUntil && Date.parse(report.validUntil) <= now;
    return { ...report, status: "unknown", label: ended ? "Source decision expired" : "Last successful source check is too old",
      note: undefined, since: null, expires: null };
  }
  if (report.status === "none" && report.sourceCheckFailed) {
    return { ...report, status: "unknown", label: "No current confirmation from the source" };
  }
  return report;
}

export function toCountyReport(row: StoredCountyStatus): CountyReport {
  const { fips: _fips, state: _state, county: _county, firstSeenAt: _first, statusChangedAt: _change,
    countywide: _broad, orders: _orders, alerts: _alerts, candidates: _candidates, ...report } = row;
  return report;
}

function order(report: Report): ScopedOrder | undefined {
  if (!report.checked) return;
  return { ...report, checked: report.checked, scope: report.scope ?? "county", scopeNote: report.scopeNote ?? report.label };
}

function selectReports(base: CountyStatus, reports: Report[], now: number, saveDecision?: (row: CountyStatus) => void): CountyStatus {
  let broad: Report | undefined;
  let local: Report | undefined;
  let localBan: Report | undefined;
  let fallback: Report | undefined;
  const orders: ScopedOrder[] = [];
  let visibleOrders: ScopedOrder[] | undefined;
  for (const raw of reports) {
    const scoped = raw.scope === "part" || raw.standing;
    const current = currentReport(raw, now);
    if (scoped) {
      const fresh = evidenceDeadline(raw) > now;
      if (!fresh && saveDecision) visibleOrders ??= orders.slice();
      const entry = (fresh || saveDecision) && order(raw);
      if (entry) orders.push(entry);
      if (entry && fresh) visibleOrders?.push(entry);
    }
    if (scoped && activeStatus(current.status)) {
      local = preferred(local, current);
      if (isScopedBan(current)) localBan = preferred(localBan, current);
    } else if (!scoped && evidenceInEffect(raw, now)) {
      broad = preferred(broad, current);
    }
    fallback = preferred(fallback, current);
  }
  const choice = localBan ?? local;
  const selected = broad && broad.status !== "unknown" ? broad : choice ?? broad ?? fallback ?? toCountyReport(base);
  const promoted = choice && selected.status !== "ban" && (selected.status !== "restricted" || localBan) ? choice : selected;
  const result = (report: Report, publishing: boolean, orders: ScopedOrder[]): CountyStatus => {
    const selectedLocal = report.scope === "part";
    const selectedActive = activeStatus(report.status);
    const status = selectedLocal ? selectedActive ? "restricted" : "unknown" : report.status;
    let label = selectedLocal && !selectedActive ? "Countywide status unconfirmed" : report.label;
    if (selectedLocal && selectedActive && report.status === "ban" && !publishing) {
      label = `Burn ban in ${(report.scopeNote ?? report.label).replace(/^within /i, "")}`;
    } else if (selectedLocal && selectedActive && report.scopeNote && !label.includes(report.scopeNote)) {
      label += ` (${report.scopeNote})`;
    }
    let note = report.note;
    if (publishing && orders.length) {
      const other = [...new Set(orders.filter((item) => item.status !== "unknown").map((item) =>
        `${item.validFrom && Date.parse(item.validFrom) > now ? "Upcoming " : ""}${item.label} (${item.scopeNote})`))].filter((text) => text !== label);
      if (other.length) note = [note, `Local reports include ${other.join(". ")}.`].filter(Boolean).join(" ");
    }
    const countywide = broad && broad !== report ? {
      status: broad.status, label: broad.label, checked: broad.checked, sourceId: broad.sourceId, sourceName: broad.sourceName,
      sourceUpdated: broad.sourceUpdated, officialUrl: broad.officialUrl,
    } : undefined;
    const { fips, state, county, alerts, firstSeenAt, statusChangedAt } = base;
    return { fips, state, county, alerts, firstSeenAt, statusChangedAt, ...report, status, label, note,
      sourceUrl: report.sourceUrl ?? report.officialUrl,
      scopedBan: selectedLocal && selectedActive && isScopedBan(report) ? true : undefined,
      countywide, orders: orders.length ? orders : undefined };
  };
  const answer = result(promoted, false, visibleOrders ?? orders);
  if (!saveDecision) return answer;
  saveDecision(answer);
  return result(selected, true, orders);
}

/** Keep the publisher's evidence so starts, expirations and changes in source health can be evaluated at read time. */
export function storeCountyReports(rows: CountyStatus | CountyStatus[], now: number) {
  if (!Array.isArray(rows) && rows.scope !== "part" && !rows.standing && currentReport(rows, now) === rows) return { row: rows, answer: rows };
  const reports = Array.isArray(rows) ? rows : [rows];
  const evidence = reports.map(toCountyReport);
  let answer: CountyStatus;
  const selected = selectReports(reports[0], evidence, now, (result) => { answer = result; });
  const row: StoredCountyStatus = { ...selected, candidates: evidence.filter((report) => report.scope !== "part" && !report.standing) };
  return { row, answer: answer! };
}

/** Stored snapshots before candidate retention carry a broad report plus separate local orders. */
function oldDecision(row: CountyStatus, now: number): CountyStatus {
  const current = currentReport(row, now);
  if (!row.orders?.length) return current;
  const surviving = row.orders.filter((item) => evidenceDeadline(item) > now);
  const withOrders = surviving.length === row.orders.length ? current : { ...current, orders: surviving, note: undefined };
  if (current.status === "ban") return withOrders;
  const valid = surviving.filter((item) => activeStatus(item.status) && evidenceInEffect(item, now));
  const selected = valid.find(isScopedBan) ?? valid[0];
  if (!selected || (current.status === "restricted" && current.scope !== "part" && !isScopedBan(selected))) return withOrders;
  const { status, scopeNote, label, sourceUrl, ...report } = selected;
  if (current.scope === "part" && current.status === "restricted" && current.sourceId === report.sourceId &&
      current.scopeNote === scopeNote && status !== "ban") return withOrders;
  const countywide = current.countywide ?? (current.scope !== "part" && !current.standing && current.sourceUrl ? {
    status: current.status, label: current.label, checked: current.checked, sourceId: current.sourceId, sourceName: current.sourceName,
    sourceUpdated: current.sourceUpdated, officialUrl: current.officialUrl,
  } : undefined);
  return { ...withOrders, sourceCheckFailed: undefined, sourceFailedSince: undefined, lastAttemptedAt: undefined, staleMs: undefined,
    ...report, scopeNote, label: status === "ban" ? `Burn ban in ${scopeNote.replace(/^within /i, "")}` : label,
    status: "restricted", scopedBan: isScopedBan(selected) ? true : undefined,
    sourceUrl: sourceUrl || report.officialUrl, countywide };
}

export function countyDecision(row: StoredCountyStatus, now: number): CountyStatus {
  return row.candidates ? selectReports(row, [...row.candidates, ...(row.orders ?? [])], now) : oldDecision(row, now);
}

export function countyBoundary(row: StoredCountyStatus, now: number): number {
  let next = nextEvidenceBoundary(row, now);
  for (const report of row.candidates ?? []) next = Math.min(next, nextEvidenceBoundary(report, now));
  for (const report of row.orders ?? []) next = Math.min(next, nextEvidenceBoundary(report, now));
  for (const alert of row.alerts ?? []) {
    for (const value of [alert.ends, alert.expires]) {
      const end = value ? Date.parse(value) : -Infinity;
      if (end > now) next = Math.min(next, end);
    }
  }
  return next;
}
