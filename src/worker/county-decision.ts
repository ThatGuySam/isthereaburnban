import { DEFAULT_STALE_MS, evidenceDeadline, evidenceInEffect, fireWeatherDeadline, nextEvidenceBoundary } from "../shared/evidence";
import type { ConflictReport, CountyReport, CountyStatus, ScopedOrder, StoredCountyStatus } from "../shared/types";

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

function currentReport<T extends Report>(report: T, now: number, start = report.validFrom ? Date.parse(report.validFrom) : -Infinity,
  deadline = evidenceDeadline(report)): T {
  if (report.status === "unknown") return report;
  if (start > now) {
    return { ...report, status: "unknown", label: "Scheduled order has not started" };
  }
  if (!(now < deadline)) {
    const ended = report.validUntil && Date.parse(report.validUntil) <= now;
    const label = ended ? "Source decision expired" : report.ruleReview ? "Statutory rule needs review" : "Last successful source check is too old";
    return { ...report, status: "unknown", label,
      note: undefined, since: null, expires: null };
  }
  if (report.status === "none" && report.sourceCheckFailed) {
    return { ...report, status: "unknown", label: "No current confirmation from the source" };
  }
  return report;
}

function toCountyReport(row: StoredCountyStatus): CountyReport {
  const { fips: _fips, state: _state, county: _county, firstSeenAt: _first, statusChangedAt: _change,
    countywide: _broad, orders: _orders, alerts: _alerts, candidates: _candidates, conflict: _conflict,
    sourceOutages: _outages, ...report } = row;
  return report;
}

function order(report: Report): ScopedOrder | undefined {
  if (!report.checked && !report.ruleReview) return;
  if (isOrder(report)) return report;
  return { ...report, scope: report.scope ?? "county", scopeNote: report.scopeNote ?? report.label };
}

function isOrder(report: Report): report is ScopedOrder {
  return report.scope !== undefined && report.scopeNote !== undefined;
}

function describeConflict(report: Report): ConflictReport {
  return { ...report, sourceUrl: report.sourceUrl ?? report.officialUrl };
}

function issuerDisagreement(issuers: CountyReport[], reports: Report[], now: number): [ConflictReport, ConflictReport] | undefined {
  for (const issuer of issuers) {
    if (!issuer.validFrom || Date.parse(issuer.validFrom) > now) continue;
    const opposite = issuer.status === "ban" ? "none" : "ban";
    const aggregate = reports.find((report) => report.sourceId === issuer.issuerFor && report.scope !== "part" &&
      report.status === opposite && currentReport(report, now).status === opposite);
    if (!aggregate) continue;
    // A verified rescission remains evidence against the older order even if
    // a later check of the county page fails. It carries no general all-clear.
    const olderOrder = issuer.status === "none" && (!aggregate.since ||
      Date.parse(aggregate.since) <= Date.parse(issuer.validFrom));
    if (olderOrder || evidenceInEffect(issuer, now)) return [describeConflict(issuer), describeConflict(aggregate)];
  }
}

function selectReports(base: CountyStatus, reports: Report[], now: number, saveDecision?: (row: CountyStatus) => void): CountyStatus {
  let broad: Report | undefined;
  let local: Report | undefined;
  let localBan: Report | undefined;
  let fallback: Report | undefined;
  let issuers: CountyReport[] | undefined;
  let failedBan: Report | undefined;
  let confirmedClear: Report | undefined;
  const orders: ScopedOrder[] = [];
  let visibleOrders: ScopedOrder[] | undefined;
  for (const raw of reports) {
    const scoped = raw.scope === "part" || raw.standing;
    const start = raw.validFrom ? Date.parse(raw.validFrom) : -Infinity;
    const deadline = evidenceDeadline(raw);
    const current = currentReport(raw, now, start, deadline);
    if ("issuerFor" in raw && raw.issuerFor && raw.documentId && (raw.status === "ban" || raw.status === "none")) {
      (issuers ??= []).push(raw);
      if (raw.status === "none") {
        fallback = preferred(fallback, current.status === "none" ? { ...current, status: "unknown" } : current);
        continue;
      }
    }
    if (scoped) {
      const fresh = deadline > now;
      if (!fresh && saveDecision) visibleOrders ??= orders.slice();
      const entry = (fresh || saveDecision) && order(raw);
      if (entry) orders.push(entry);
      if (entry && fresh) visibleOrders?.push(entry);
    }
    if (scoped && activeStatus(current.status)) {
      local = preferred(local, current);
      if (isScopedBan(current)) localBan = preferred(localBan, current);
    } else if (!scoped && start <= now && now < deadline) {
      broad = preferred(broad, current);
      if (current.status === "ban" && current.sourceCheckFailed) failedBan = current;
      if (current.status === "none") confirmedClear = current;
    }
    fallback = preferred(fallback, current);
  }
  const choice = localBan ?? local;
  const selected = broad && broad.status !== "unknown" ? broad : choice ?? broad ?? fallback ?? toCountyReport(base);
  const promoted = choice && selected.status !== "ban" && (selected.status !== "restricted" || localBan) ? choice : selected;
  const issuerConflict = issuers && issuerDisagreement(issuers, reports, now);
  const degraded = failedBan && confirmedClear && failedBan.scope === confirmedClear.scope
    && failedBan.sourceId !== confirmedClear.sourceId ? [describeConflict(failedBan), describeConflict(confirmedClear)] as const : undefined;
  const conflict = issuerConflict
    ? { kind: "issuer" as const, reports: issuerConflict }
    : degraded ? { kind: "degraded" as const, reports: [...degraded] as [ConflictReport, ConflictReport] } : undefined;
  const result = (report: Report, publishing: boolean, orders: ScopedOrder[]): CountyStatus => {
    if (conflict) report = conflict.reports[0];
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
      const other: string[] = [];
      for (const item of orders) {
        if (item.status === "unknown") continue;
        const upcoming = item.validFrom && Date.parse(item.validFrom) > now ? "Upcoming " : "";
        const text = `${upcoming}${item.label} (${item.scopeNote})`;
        if (text !== label && !other.includes(text)) other.push(text);
      }
      if (other.length) note = `${note ? `${note} ` : ""}Local reports include ${other.join(". ")}.`;
    }
    const countywide = broad && broad !== report ? {
      status: broad.status, label: broad.label, checked: broad.checked, sourceId: broad.sourceId, sourceName: broad.sourceName,
      sourceUpdated: broad.sourceUpdated, officialUrl: broad.officialUrl,
    } : undefined;
    const { fips, state, county, alerts, firstSeenAt, statusChangedAt } = base;
    return { fips, state, county, alerts, firstSeenAt, statusChangedAt, ...report,
      status: conflict ? "unknown" : status, label: conflict ? "Conflicting reports" : label, note,
      sourceUrl: report.sourceUrl ?? report.officialUrl,
      scopedBan: selectedLocal && selectedActive && isScopedBan(report) ? true : undefined,
      countywide: conflict ? undefined : countywide, orders: orders.length ? orders : undefined, conflict };
  };
  const answer = result(promoted, false, visibleOrders ?? orders);
  if (!saveDecision) return answer;
  saveDecision(answer);
  return result(selected, true, orders);
}

/** Keep the publisher's evidence so starts, expirations and changes in source health can be evaluated at read time. */
export function storeCountyReports(rows: CountyStatus | CountyStatus[], now: number) {
  if (!Array.isArray(rows) && rows.scope !== "part" && !rows.standing && !rows.issuerFor && currentReport(rows, now) === rows) return { row: rows, answer: rows };
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
  if (current.status === "ban" || current.conflict) return withOrders;
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
  return { ...withOrders, sourceCheckFailed: undefined, sourceFailedSince: undefined, lastAttemptedAt: undefined, staleMs: undefined, ruleReview: undefined,
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
    const end = fireWeatherDeadline(alert);
    if (end > now) next = Math.min(next, end);
  }
  return next;
}
