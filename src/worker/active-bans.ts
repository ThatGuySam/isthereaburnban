import { checkDeadline, evidenceInEffect, nextEvidenceBoundary } from "../shared/evidence";
import type { CountyStatus, SnapshotData } from "../shared/types";
import { countyBoundary, countyDecision } from "./county-decision";
import { COUNTY_BY_FIPS } from "./counties";
import { weatherBoundary, withFireWeather } from "./fire-weather";
import { DISCLAIMER } from "./lookup";
import type { ActiveProjection, SnapshotIndex } from "./snapshot-v2";
import { withReportDates } from "./report-dates";
import { withCurrentLinks } from "./source-links";
import { applyChecks, applyCountyEvidence, reportChecks, type SourceHead } from "./sources/state";

/** Pretty rows are escaped for the one JSON string value in an MCP text block. */
export type BanFormat = "compact" | "pretty";
type OrderStamp = [sourceId: string, checked: string, offset: number];
type EncodedBody = [checkedOffset: number, length: number, orders?: OrderStamp[]];
type EncodedBan = [fips: string, sourceId: string | null, checked: string, expires: number | null,
  ordersExpire: number | null, body: EncodedBody, afterOrders?: [at: number, body: EncodedBody]];
type ReportStamp = [sourceId: string, checked: string, offset: number];
type Variant = [length: number, stamps: ReportStamp[]];
type PreparedBan = [fips: string, rawLength: number, generation: number, stableUntil: number | null,
  sourceIds: string[], first: Variant, after?: [until: number | null, prefixLength: number]];
// Weather entries use the sparse county map. Other time-sensitive counties keep their raw evidence in the body.
export type BanEntry = EncodedBan | PreparedBan | [fips: string] | [fips: string, rawLength: number];
const isPrepared = (entry: EncodedBan | PreparedBan): entry is PreparedBan => typeof entry[1] === "number";
// Prepare the common scopes ahead of time while bounding the work of a single state publication.
const MAX_PREPARED_PER_STATE = 24;

function encodeCounty(row: CountyStatus, format: BanFormat) {
  return format === "pretty" ? escapeText(JSON.stringify(row, null, 2).replaceAll("\n", "\n    ")) : JSON.stringify(row);
}

const escapeText = (text: string) => JSON.stringify(text).slice(1, -1);

function prepareCounty(row: CountyStatus, format: BanFormat, bodies: string[]): EncodedBody {
  const body = encodeCounty(row, format);
  const field = format === "pretty" ? String.raw`\"checked\": \"` : '"checked":"';
  bodies.push(body);
  return [body.indexOf(field) + field.length, body.length];
}

const active = (row: Pick<CountyStatus, "status"> | undefined) => row?.status === "ban" || row?.status === "restricted";

function prepareVariant(row: CountyStatus, format: BanFormat, body: string): Variant {
  if (!active(row)) return [0, []];
  const field = format === "pretty" ? String.raw`\"checked\": \"` : '"checked":"';
  const stamps: ReportStamp[] = [];
  let cursor = 0;
  for (const report of [row, row.countywide, ...(row.orders ?? [])]) {
    if (!report?.checked) continue;
    const fieldAt = body.indexOf(field, cursor);
    if (fieldAt < 0) break;
    const offset = fieldAt + field.length;
    cursor = offset + report.checked.length;
    if (report.sourceId) stamps.push([report.sourceId, report.checked, offset]);
  }
  return [body.length, stamps];
}

/** Serialize each state's county bodies once. Requests still evaluate freshness and weather against their own clock. */
export function prepareBanEntries(snapshot: SnapshotData, answers?: Record<string, CountyStatus>) {
  const selected: SnapshotData["counties"] = {};
  const names = new Map<string, string>();
  for (const row of Object.values(snapshot.counties)) {
    if (active(row) || row.orders?.some(active) || row.candidates?.some(active) || snapshot.fireWeather?.[row.fips]) {
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
  const generation = Date.parse(snapshot.generated);
  let prepared = 0;
  const ordered = [...names].sort((a, b) => a[1].localeCompare(b[1]));
  for (const [fips] of ordered) {
    const row = selected[fips];
    if (!row || snapshot.fireWeather?.[fips]) {
      compact.push([fips]);
      pretty.push([fips]);
      if (row) weatherCounties[fips] = row;
      continue;
    }
    if (!row.checked || row.orders?.length || row.candidates || row.validFrom || row.validUntil || row.sourceCheckFailed) {
      const raw = JSON.stringify(row);
      if (prepared >= MAX_PREPARED_PER_STATE) {
        compact.push([fips, raw.length]);
        pretty.push([fips, raw.length]);
        compactBodies.push(raw);
        prettyBodies.push(raw);
        continue;
      }
      prepared++;
      const reports = [...(row.candidates ?? [row]), ...(row.orders ?? [])];
      const ids = [...new Set(reports.flatMap(({ sourceId }) => sourceId ? [sourceId] : []))];
      const canPrepare = reports.every((item) => !item.sourceCheckFailed && checkDeadline(item.checked, item.staleMs) > generation);
      const next = canPrepare ? countyBoundary(row, generation) : generation;
      const first = answers?.[fips] ?? countyDecision(row, generation);
      // When every scoped order has the same end, the base report can be encoded once for that second window.
      const orderEnd = row.orders?.[0]?.validUntil;
      const afterTime = orderEnd ? Date.parse(orderEnd) : NaN;
      const broad = row.candidates?.[0];
      const endsTogether = canPrepare && afterTime === next && row.candidates && row.candidates.length <= 1 &&
        row.orders?.every((item) => item.validUntil === orderEnd);
      const afterEmpty = endsTogether && (!broad || !active(broad) || (broad.validUntil && Date.parse(broad.validUntil) <= afterTime));
      const keepBroad = endsTogether && broad && evidenceInEffect(broad, afterTime) && first.sourceId === broad.sourceId
        && first.status === broad.status && active(first) && !first.countywide;
      const afterUntil = broad ? nextEvidenceBoundary(broad, afterTime) : Infinity;
      const add = (format: BanFormat, entries: BanEntry[], bodies: string[]) => {
        const body = active(first) ? encodeCounty(first, format) : "";
        const entry: PreparedBan = [fips, raw.length, generation, Number.isFinite(next) ? next : null, ids, prepareVariant(first, format, body)];
        if (afterEmpty) entry.push([Number.isFinite(afterUntil) ? afterUntil : null, 0]);
        else if (keepBroad) {
          const cutoff = body.indexOf(format === "pretty" ? String.raw`,\n      \"orders\": [` : ',"orders":[');
          if (cutoff > 0) entry.push([Number.isFinite(afterUntil) ? afterUntil : null, cutoff]);
        }
        entries.push(entry);
        bodies.push(body, raw);
      };
      add("compact", compact, compactBodies);
      add("pretty", pretty, prettyBodies);
      continue;
    }
    compact.push([fips, row.sourceId ?? null, row.checked, null, null, prepareCounty(row, "compact", compactBodies)]);
    pretty.push([fips, row.sourceId ?? null, row.checked, null, null, prepareCounty(row, "pretty", prettyBodies)]);
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
  applyChecks(view, heads, now, index.orderChecks);
  return withFireWeather(view, now.getTime(), index.weatherChecked);
}

function patchChecked(raw: string, start: number, end: number, checked: string, stamp: string, offset: number) {
  return stamp === checked ? raw.slice(start, end) : raw.slice(start, start + offset) + stamp + raw.slice(start + offset + checked.length, end);
}

function patchVariant(raw: string, start: number, variant: Variant, checks: ReturnType<typeof reportChecks>, length = variant[0]) {
  const [, stamps] = variant;
  let cursor = start;
  let result = "";
  for (const [sourceId, old, offset] of stamps) {
    if (offset >= length) break;
    const checked = checks(sourceId)?.checked;
    if (!checked || checked === old) continue;
    result += raw.slice(cursor, start + offset) + checked;
    cursor = start + offset + old.length;
  }
  return result + raw.slice(cursor, start + length);
}

export function formatNationalBans(projection: ActiveProjection, index: SnapshotIndex, heads: Map<string, SourceHead>, now: Date, format: BanFormat) {
  const weather = projectWeather(projection, index, heads, now);
  const clock = now.getTime();
  const deadlineBySource = new Map<string | null, { stamp: string; deadline: number }>();
  const allRows: string[] = [];
  const checks = reportChecks(index, heads, index.orderChecks);
  let nextBoundary = weatherBoundary(weather, clock, index.weatherChecked);
  let cursor = projection.bodyStart;
  const appendDynamic = (start: number, end: number) => {
    const row: CountyStatus = JSON.parse(projection.raw.slice(start, end));
    applyCountyEvidence(row, checks);
    nextBoundary = Math.min(nextBoundary, countyBoundary(row, clock));
    const decision = countyDecision(row, clock);
    if (active(decision)) allRows.push(encodeCounty(decision, format));
  };
  for (const entry of projection.bans) {
    if (entry.length === 1) {
      const raw = weather.counties[entry[0]];
      if (!raw) continue;
      nextBoundary = Math.min(nextBoundary, countyBoundary(raw, clock));
      const row = countyDecision(withReportDates(raw), clock);
      if (active(row)) allRows.push(encodeCounty(row, format));
      continue;
    }
    if (entry.length === 2) {
      const end = cursor + entry[1];
      appendDynamic(cursor, end);
      cursor = end;
      continue;
    }
    if (isPrepared(entry)) {
      const [, rawLength, at, stableUntil, ids, first, after] = entry;
      const firstStart = cursor;
      const rawStart = firstStart + first[0];
      cursor = rawStart + rawLength;
      const healthy = ids.every((id) => !checks(id)?.sourceCheckFailed);
      const firstEnd = stableUntil ?? Infinity;
      const afterEnd = after?.[0] ?? Infinity;
      if (healthy && clock >= at && clock < firstEnd) {
        nextBoundary = Math.min(nextBoundary, firstEnd);
        if (first[0]) allRows.push(patchVariant(projection.raw, firstStart, first, checks));
      } else if (healthy && after && clock >= firstEnd && clock < afterEnd) {
        nextBoundary = Math.min(nextBoundary, afterEnd);
        if (after[1]) allRows.push(patchVariant(projection.raw, firstStart, first, checks, after[1]) +
          (format === "pretty" ? String.raw`\n    }` : "}"));
      } else appendDynamic(rawStart, cursor);
      continue;
    }
    const [, id, checked, expires, ordersExpire, body, after] = entry;
    const beforeStart = cursor;
    const beforeEnd = beforeStart + body[1];
    cursor = beforeEnd + (after?.[1][1] ?? 0);
    const policy = checks(id ?? undefined);
    const stamp = policy?.checked ?? checked;
    let timing = deadlineBySource.get(id);
    if (timing?.stamp !== stamp) {
      timing = { stamp, deadline: checkDeadline(stamp, policy?.staleMs) };
      deadlineBySource.set(id, timing);
    }
    const deadline = Math.min(timing.deadline, expires ?? Infinity);
    if (deadline <= clock) continue;
    nextBoundary = Math.min(nextBoundary, deadline);
    if (!index.reportDates || ordersExpire !== null || body[2] || policy?.sourceCheckFailed) {
      // These entries include v2 bodies published before per-report evidence was retained.
      const encoded = projection.raw.slice(beforeStart, beforeEnd);
      const row: CountyStatus = JSON.parse(format === "pretty" ? JSON.parse(`"${encoded}"`) : encoded);
      applyCountyEvidence(row, checks);
      nextBoundary = Math.min(nextBoundary, countyBoundary(row, clock));
      const decision = countyDecision(withReportDates(row), clock);
      if (active(decision)) allRows.push(encodeCounty(decision, format));
    } else allRows.push(patchChecked(projection.raw, beforeStart, beforeEnd, checked, stamp, body[0]));
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
  return { body, generated, count: allRows.length, nextBoundary };
}
