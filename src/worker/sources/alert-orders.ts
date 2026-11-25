import { evidenceInEffect } from "../../shared/evidence";
import { shortDate } from "../../shared/render";
import type { CountyReport, CountyStatus, SnapshotData, StoredCountyStatus, VerifiedOrder } from "../../shared/types";
import { activeStatus, isScopedBan } from "../county-decision";
import { transitionNotice, type Transition } from "../notification-message";

type Evidence = CountyReport | NonNullable<StoredCountyStatus["orders"]>[number];

function orderState(report: Evidence): VerifiedOrder {
  return {
    source: ("issuerFor" in report ? report.issuerFor : undefined) ?? report.sourceId ?? "",
    scope: report.scope === "part" ? `part:${typeof report.scopeNote === "string" ? report.scopeNote.trim().toLowerCase() : ""}` : "countywide",
    document: "documentId" in report ? report.documentId : undefined,
    start: report.since ?? report.validFrom ?? undefined,
    end: report.validUntil ?? report.expires ?? undefined,
    status: report.status === "ban" || isScopedBan(report) ? "ban" : "restricted",
  };
}

function sameScope(a: VerifiedOrder, b: VerifiedOrder) {
  return a.source === b.source && a.scope === b.scope;
}

function sameOrder(a: VerifiedOrder, b: VerifiedOrder) {
  if (!sameScope(a, b)) return false;
  if (a.document && b.document) return a.document === b.document;
  return !a.start || !b.start || Date.parse(a.start) === Date.parse(b.start);
}

function historicalOrders(snapshot: SnapshotData | null, recurring: Set<string>) {
  const tracked: NonNullable<SnapshotData["verifiedOrders"]> = {};
  if (!snapshot) return tracked;
  const clock = Date.parse(snapshot.generated);
  for (const [fips, row] of Object.entries(snapshot.counties)) {
    const reports = row.candidates ? [...row.candidates, ...(row.orders ?? [])] : [...(row.orders ?? []), row];
    for (const report of reports) {
      if (report.standing || recurring.has(report.sourceId ?? "") || !activeStatus(report.status) ||
        (report.validFrom && Date.parse(report.validFrom) > clock)) continue;
      const key = orderState(report);
      const orders = tracked[fips] ??= [];
      if (!orders.some((prior) => sameOrder(prior, key))) orders.push(key);
    }
  }
  return tracked;
}

export function orderTracker(prev: SnapshotData | null, recurring: Set<string>, full: Set<string>, now: Date) {
  const ledger = { ...(prev?.verifiedOrders ?? historicalOrders(prev, recurring)) };
  const baselines = new Set(prev?.sources.filter((source) => source.lastSuccessfulAt || source.ok).map(({ id }) => id));
  const at = now.toISOString();
  const clock = now.getTime();

  function observe(evidence: CountyStatus | CountyStatus[], decision: CountyStatus, before?: CountyStatus) {
    // Contradictory current evidence cannot support a notification. Preserve history while it is resolved.
    if (decision.conflict) return [];
    const { fips } = decision;
    const prior = ledger[fips];
    const single = !Array.isArray(evidence);
    if (single && !prior && !activeStatus(evidence.status)) return [];
    const reports = (single ? [evidence] : evidence).filter((report) =>
      !report.standing && !report.sourceCheckFailed && !recurring.has(report.sourceId ?? "") &&
      report.status !== "unknown" && evidenceInEffect(report, clock));
    if (!reports.length) return [];
    let orders = prior?.slice() ?? [];
    const events: Transition[] = [];
    const known = (report: CountyStatus) => baselines.has(report.sourceId ?? "") || Boolean(before && !before.sourceId);

    for (const report of reports) {
      if (report.status !== "none") continue;
      const rescission = Boolean(report.issuerFor && report.documentId && report.validFrom);
      if (!rescission && !full.has(report.sourceId ?? "")) continue;
      const key = orderState(report);
      const lifted = orders.filter((order) =>
        (sameScope(order, key) || (!order.source && before?.status === "ban" && order.scope === key.scope)) &&
        (!rescission || !order.start || Date.parse(order.start) <= Date.parse(report.validFrom!)));
      if (!lifted.length) continue;
      orders = orders.filter((order) => !lifted.includes(order));
      if (!known(report) && !rescission) continue;
      const oldStatus = lifted.some((order) => order.status === "ban") ? "ban" : "restricted";
      const scoped = key.scope !== "countywide";
      const event: Transition = { fips, oldStatus: scoped ? "restricted" : oldStatus, newStatus: "none", at };
      if (rescission || scoped || decision.status !== "none" || decision.sourceId !== report.sourceId) {
        const scope = scoped ? report.scopeNote : `${report.county}, ${report.state}`;
        const message = transitionNotice(event, report);
        event.notice = { ...message, emailStatus: "order-lifted", title: `${oldStatus === "ban" ? "Burn ban" : "Burning restrictions"} lifted: ${scope}`,
          body: `${report.sourceName} confirmed the lift. Check the official page for other rules before burning.` };
      }
      events.push(event);
    }

    // Prefer an independently verified issuer record when it duplicates an aggregate listing.
    const active = reports.filter((report) => activeStatus(report.status));
    const issuerOrders = active.filter((report) => report.issuerFor).map(orderState);
    for (const report of active) {
      const key = orderState(report);
      if (!report.issuerFor && issuerOrders.some((issuer) => sameOrder(issuer, key))) continue;
      let index = orders.findIndex((order) => sameOrder(order, key));
      if (index === -1 && !before?.sourceId) index = orders.findIndex((order) => !order.source && sameOrder({ ...order, source: key.source }, key));
      const previous = orders[index];
      const extended = previous?.end && key.end && Date.parse(key.end) > Date.parse(previous.end);
      const newStatus = key.scope === "countywide" ? key.status : "restricted";
      if (previous) {
        const { document = previous.document, start = previous.start, end = previous.end } = key;
        if (key.status !== previous.status || document !== previous.document || start !== previous.start || end !== previous.end) {
          orders[index] = { ...key, document, start, end };
        }
      } else {
        orders.push(key);
      }
      if ((!extended && previous && previous.status === key.status) || !known(report)) continue;
      const event: Transition = { fips, oldStatus: before?.status ?? "unknown", newStatus, at };
      if (extended || decision.sourceId !== report.sourceId || decision.scopeNote !== report.scopeNote || decision.status !== newStatus) {
        const row: CountyStatus = { ...report, status: newStatus };
        if (isScopedBan(report)) {
          row.scopedBan = true;
          row.label = `Burn ban in ${report.scopeNote ?? report.county}`;
        }
        const notice = transitionNotice(event, row);
        const subject = key.status === "ban" ? "Burn ban" : "Burning restrictions";
        event.notice = extended ? { ...notice, emailStatus: "order-extended", title: `${subject} extended: ${report.scopeNote ?? `${report.county}, ${report.state}`}`,
          body: `${subject} extended through ${shortDate(report.expires ?? key.end)}. Source: ${report.sourceName}. Check the official page before burning.` } : notice;
      }
      events.push(event);
    }
    // Keep identities through failed checks or omissions. Retire long-ended identities once
    // the publisher reports a replacement in the same scope.
    const retireBefore = clock - 90 * 86_400_000;
    if (orders.length > 1) {
      orders = orders.filter((order) => !order.end || Date.parse(order.end) >= retireBefore ||
        !orders.some((replacement) => sameScope(order, replacement) && replacement.start && order.start &&
          Date.parse(replacement.start) > Date.parse(order.start)));
    }
    if (orders.length) ledger[fips] = orders;
    else delete ledger[fips];
    return events;
  }

  return { ledger, observe };
}
