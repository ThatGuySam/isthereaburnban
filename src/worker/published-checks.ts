import type { SnapshotData } from "../shared/types";
import type { SnapshotIndex } from "./snapshot-v2";

/** v1 stamped all orders at each national publication, including orders whose raw revision stayed the same. */
export function publishedOrders(orders: NonNullable<SnapshotData["counties"][string]["orders"]>, checks: SnapshotIndex["orderChecks"]) {
  if (!orders.some(({ sourceId, checked }) => sourceId && checks[sourceId] && checks[sourceId] !== checked)) return orders;
  return orders.map((order) => {
    const checked = order.sourceId && checks[order.sourceId];
    return checked && checked !== order.checked ? { ...order, checked } : order;
  });
}

export function withPublishedChecks<T extends Pick<SnapshotData, "counties">>(snapshot: T, checks: SnapshotIndex["orderChecks"]): T {
  let counties: SnapshotData["counties"] | undefined;
  for (const row of Object.values(snapshot.counties)) {
    if (!row.orders) continue;
    const orders = publishedOrders(row.orders, checks);
    if (orders !== row.orders) (counties ??= { ...snapshot.counties })[row.fips] = { ...row, orders };
  }
  return counties ? { ...snapshot, counties } : snapshot;
}
