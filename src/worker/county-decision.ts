import type { CountyStatus, ScopedOrder } from "../shared/types";

export const STALE_MS = 48 * 60 * 60 * 1000;

export function activeStatus(status: CountyStatus["status"]): boolean {
  return status === "ban" || status === "restricted";
}

export function isScopedBan(row: Pick<CountyStatus, "status" | "scope" | "scopedBan">): boolean {
  return row.scope === "part" && (row.status === "ban" || (row.status === "restricted" && row.scopedBan === true));
}

function currentOrder(order: ScopedOrder, now: number): boolean {
  return activeStatus(order.status) &&
    (!order.validFrom || Date.parse(order.validFrom) <= now) &&
    (!order.validUntil || now < Date.parse(order.validUntil)) &&
    now < Date.parse(order.checked) + STALE_MS;
}

/** County coverage and narrower orders are independent evidence. */
export function countyDecision(row: CountyStatus, now: number): CountyStatus {
  if (!row.orders?.length || row.status === "ban") return row;
  let selected: ScopedOrder | undefined;
  for (const order of row.orders) {
    if (!currentOrder(order, now)) continue;
    if (isScopedBan(order)) {
      selected = order;
      break;
    }
    selected ??= order;
  }
  if (!selected || (row.status === "restricted" && row.scope !== "part" && !isScopedBan(selected))) return row;

  const { status, scopeNote, label, sourceUrl, ...order } = selected;
  const scopedBan = isScopedBan(selected);
  const scopedLabel = status === "ban" ? `Burn ban in ${scopeNote.replace(/^within /i, "")}` : label;
  if (row.scope === "part" && row.status === "restricted" && row.sourceId === order.sourceId &&
    row.scopeNote === scopeNote && status !== "ban") return row;
  const countywide = row.countywide ?? (row.scope !== "part" && !row.standing && row.sourceUrl ? {
    status: row.status, label: row.label, checked: row.checked, sourceId: row.sourceId, sourceName: row.sourceName,
    sourceUpdated: row.sourceUpdated, officialUrl: row.officialUrl,
  } : undefined);
  return { ...row, ...order, scopeNote, label: scopedLabel, status: "restricted", scopedBan: scopedBan ? true : undefined,
    sourceUrl: sourceUrl || order.officialUrl, note: order.note, standing: order.standing, validFrom: order.validFrom, validUntil: order.validUntil, countywide };
}
