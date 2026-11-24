import type { CountyStatus, SnapshotData } from "../shared/types";
import { countyDecision } from "./county-decision";
import { COUNTY_BY_FIPS } from "./counties";
import { withFireWeather } from "./fire-weather";
import { DISCLAIMER } from "./lookup";
import { publishedOrders, withPublishedChecks } from "./published-checks";
import type { ActiveProjection, SnapshotIndex } from "./snapshot-v2";
import { withReportDates } from "./report-dates";
import { withCurrentLinks } from "./source-links";
import { STALE_MS } from "./sources/merge";
import { applyChecks, applyCountyCheck, type SourceHead } from "./sources/state";

/** Pretty rows are escaped for the one JSON string value in an MCP text block. */
export type BanFormat = "compact" | "pretty";
type OrderStamp = [sourceId: string, checked: string, offset: number];
type EncodedBody = [checkedOffset: number, length: number, orders?: OrderStamp[]];
type EncodedBan = [fips: string, sourceId: string | null, checked: string, expires: number | null,
  ordersExpire: number | null, body: EncodedBody, afterOrders?: [at: number, body: EncodedBody]];
// Weather entries use the projection's sparse county map and retain their place in county-name order.
export type BanEntry = EncodedBan | [fips: string];

function encodeCounty(row: CountyStatus, format: BanFormat) {
  return format === "pretty" ? escapeText(JSON.stringify(row, null, 2).replaceAll("\n", "\n    ")) : JSON.stringify(row);
}

const escapeText = (text: string) => JSON.stringify(text).slice(1, -1);

function prepareCounty(row: CountyStatus, format: BanFormat, bodies: string[]): EncodedBody {
  const body = encodeCounty(row, format);
  const field = format === "pretty" ? String.raw`\"checked\": \"` : '"checked":"';
  const checkedOffset = body.indexOf(field) + field.length;
  const entry: EncodedBody = [checkedOffset, body.length];
  let cursor = checkedOffset;
  for (const { sourceId, checked } of row.orders ?? []) {
    cursor = body.indexOf(field, cursor) + field.length;
    if (sourceId) (entry[2] ??= []).push([sourceId, checked, cursor]);
  }
  bodies.push(body);
  return entry;
}

const active = (row: Pick<CountyStatus, "status"> | undefined) => row?.status === "ban" || row?.status === "restricted";

/** Serialize each state's county bodies once. Requests still evaluate freshness and weather against their own clock. */
export function prepareBanEntries(snapshot: SnapshotData) {
  const selected: SnapshotData["counties"] = {};
  const names = new Map<string, string>();
  for (const row of Object.values(snapshot.counties)) {
    if (active(row) || row.orders?.some(active) || snapshot.fireWeather?.[row.fips]) {
      selected[row.fips] = { ...withReportDates(row) };
      names.set(row.fips, row.county);
    }
  }
  for (const fips of Object.keys(snapshot.fireWeather ?? {})) {
    if (!names.has(fips)) names.set(fips, COUNTY_BY_FIPS.get(fips)?.name ?? fips);
  }
  withCurrentLinks({ counties: selected });
  const compact: BanEntry[] = [];
  const pretty: BanEntry[] = [];
  const compactBodies: string[] = [];
  const prettyBodies: string[] = [];
  const weatherCounties: SnapshotData["counties"] = {};
  const ordered = [...names].sort((a, b) => a[1].localeCompare(b[1]));
  for (const [fips] of ordered) {
    const row = selected[fips];
    if (!row?.checked || snapshot.fireWeather?.[fips] || (row.status !== "ban" && row.orders?.some((order) =>
      order.status === "ban" || (!active(row) && active(order))))) {
      compact.push([fips]);
      pretty.push([fips]);
      if (row) weatherCounties[fips] = row;
      continue;
    }
    const expires = row.validUntil ? Date.parse(row.validUntil) : null;
    let firstExpiry = Infinity;
    let lastExpiry = -Infinity;
    for (const { validUntil } of row.orders ?? []) {
      if (!validUntil) continue;
      const at = Date.parse(validUntil);
      firstExpiry = Math.min(firstExpiry, at);
      lastExpiry = Math.max(lastExpiry, at);
    }
    const firstOrderExpiry = Number.isFinite(firstExpiry) ? firstExpiry : null;
    const after = firstOrderExpiry !== null && row.orders
      ? { ...row, note: undefined, orders: row.orders.filter(({ validUntil }) => !validUntil) } : null;
    const compactEntry: EncodedBan = [fips, row.sourceId ?? null, row.checked, expires, firstOrderExpiry, prepareCounty(row, "compact", compactBodies)];
    const prettyEntry: EncodedBan = [fips, row.sourceId ?? null, row.checked, expires, firstOrderExpiry, prepareCounty(row, "pretty", prettyBodies)];
    if (after) {
      compactEntry.push([lastExpiry, prepareCounty(after, "compact", compactBodies)]);
      prettyEntry.push([lastExpiry, prepareCounty(after, "pretty", prettyBodies)]);
    }
    compact.push(compactEntry);
    pretty.push(prettyEntry);
  }
  const pack = (entries: BanEntry[], bodies: string[]) => `${JSON.stringify(entries).slice(1, -1)}\n${bodies.join("")}`;
  return { compact: pack(compact, compactBodies), pretty: pack(pretty, prettyBodies), weatherCounties };
}

export function projectWeather(projection: ActiveProjection, index: SnapshotIndex, heads: Map<string, SourceHead>, now: Date) {
  const counties: SnapshotData["counties"] = {};
  for (const row of Object.values(projection.counties)) counties[row.fips] = { ...row };
  const view: SnapshotData = { ...index, counties, fireWeather: projection.fireWeather,
    sources: index.sources.map((source) => ({ ...source })), changed: {} };
  withCurrentLinks(view);
  applyChecks(view, heads, now);
  return withFireWeather(withPublishedChecks(view, index.orderChecks), now.getTime(), index.weatherChecked);
}

function patchChecks(raw: string, start: number, end: number, checked: string, stamp: string, offset: number,
  orders: OrderStamp[] | undefined, published: SnapshotIndex["orderChecks"]) {
  let cursor = start;
  let updated = "";
  if (stamp !== checked) {
    updated = raw.slice(cursor, start + offset) + stamp;
    cursor = start + offset + checked.length;
  }
  for (const [sourceId, before, at] of orders ?? []) {
    const fresh = published[sourceId];
    if (fresh && fresh !== before) {
      updated += raw.slice(cursor, start + at) + fresh;
      cursor = start + at + before.length;
    }
  }
  return updated + raw.slice(cursor, end);
}

export function formatNationalBans(projection: ActiveProjection, index: SnapshotIndex, heads: Map<string, SourceHead>, now: Date, format: BanFormat) {
  const weather = projectWeather(projection, index, heads, now);
  const clock = now.getTime();
  const parsedDates = new Map<string, number>();
  const allRows: string[] = [];
  let cursor = projection.bodyStart;
  const good = new Map<string, SourceHead>();
  for (const [id, head] of heads) if (head.lastGood && head.hash === index.sourceVersions?.[id]) good.set(id, head);
  for (const entry of projection.bans) {
    if (entry.length === 1) {
      const raw = weather.counties[entry[0]];
      const row = raw && countyDecision(withReportDates(raw), clock);
      if (row && active(row)) allRows.push(encodeCounty(row, format));
      continue;
    }
    const [, id, checked, expires, ordersExpire, body, after] = entry;
    const beforeStart = cursor;
    const beforeEnd = beforeStart + body[1];
    cursor = beforeEnd + (after?.[1][1] ?? 0);
    if (expires !== null && expires <= clock) continue;
    const head = id ? good.get(id) : undefined;
    const stamp = head?.lastGood ?? checked;
    let checkedAt = parsedDates.get(stamp);
    if (checkedAt === undefined) parsedDates.set(stamp, checkedAt = Date.parse(stamp));
    if (clock - checkedAt >= STALE_MS) continue;
    if (index.reportDates && after && clock >= after[0]) {
      const [offset, , orders] = after[1];
      allRows.push(patchChecks(projection.raw, beforeEnd, cursor, checked, stamp, offset, orders, index.orderChecks));
    } else if (!index.reportDates || (ordersExpire !== null && ordersExpire <= clock)) {
      const encoded = projection.raw.slice(beforeStart, beforeEnd);
      const row: CountyStatus = JSON.parse(format === "pretty" ? JSON.parse(`"${encoded}"`) : encoded);
      applyCountyCheck(row, head, id ? index.sourceVersions?.[id] : undefined, clock);
      if (row.orders) row.orders = publishedOrders(row.orders, index.orderChecks);
      if (active(row)) allRows.push(encodeCounty(withReportDates(row), format));
    } else allRows.push(patchChecks(projection.raw, beforeStart, beforeEnd, checked, stamp, body[0], body[2], index.orderChecks));
  }
  const { generated, sources } = weather;
  const time = JSON.stringify(generated);
  const disclaimer = JSON.stringify(DISCLAIMER);
  let body: string[];
  if (format === "pretty") {
    const prefix = escapeText(`{\n  "generated": ${time},\n  "counties": [${allRows.length ? "\n    " : ""}`);
    const suffix = escapeText(`${allRows.length ? "\n  " : ""}],\n  "sources": ${JSON.stringify(sources, null, 2).replaceAll("\n", "\n  ")},\n  "disclaimer": ${disclaimer}\n}`);
    body = [`"${prefix}`];
    const separator = String.raw`,\n    `;
    // Keep response parts small so Blob can encode them without flattening a second national-sized string.
    for (let i = 0; i < allRows.length; i += 128) {
      body.push((i ? separator : "") + allRows.slice(i, i + 128).join(separator));
    }
    body.push(`${suffix}"`);
  } else body = [`{"generated":${time},"counties":[${allRows.join(",")}],"sources":${JSON.stringify(sources)},"disclaimer":${disclaimer}}`];
  return { body, generated, count: allRows.length };
}
