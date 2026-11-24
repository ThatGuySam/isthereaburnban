import type { CountyStatus, FireWeatherReport, SnapshotData } from "../../shared/types";
import { COUNTY_BY_FIPS } from "../counties";
import type { Env } from "../env";
import { sha256 } from "./lib/hash";
import { BlockedError, type Validators } from "./lib/http";
import { STALE_MS, type SourceInput } from "./merge";
import { isActive, type ActiveSource, type Source, type SourceResult } from "./types";

type Health = {
  checked: string;
  lastGood?: string;
  error?: string;
  blocked?: boolean;
  validators?: Validators;
  boundaries?: string[];
};

export type SourceHead = Health & { id: string; slot: number; hash: string | null; stored: number };
type StoredHead = Pick<SourceHead, "id" | "slot" | "hash" | "stored"> & { health: string };

const loadHead = ({ health, ...row }: StoredHead): SourceHead => ({ ...row, ...JSON.parse(health) as Health });
const sourceKey = (id: string) => `source:${id}`;
type SourcePayload = { rows: Omit<CountyStatus, "checked">[] } | { fireWeather: FireWeatherReport[] };
type SourceData = { hash: string } & SourcePayload;
const errorText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)).slice(0, 300);
const BY_VALIDITY = new Set(["ban", "restricted", "none", "unknown"]);

const headColumns = "id, slot, hash, health, stored";

export async function readHeads(db: D1Database, ids?: string[]): Promise<Map<string, SourceHead>> {
  if (ids?.length === 0) return new Map();
  const query = db.prepare(`SELECT ${headColumns} FROM source_refresh${ids ? " WHERE id IN (SELECT value FROM json_each(?))" : ""}`);
  const { results } = await (ids ? query.bind(JSON.stringify(ids)) : query).all<StoredHead>();
  return new Map(results.map((row) => [row.id, loadHead(row)]));
}

type NormalizedSource = { serialized: string; boundaries: string[] } &
  ({ field: "fireWeather"; weather: FireWeatherReport[] } | { field: "rows" });

function normalize(source: ActiveSource, result: Exclude<SourceResult, { notModified: true }>): NormalizedSource {
  if ("fireWeather" in result) {
    if (source.product !== "fire-weather" || result.fireWeather.some(({ fips, alerts }) =>
      !COUNTY_BY_FIPS.has(fips) || !alerts.length)) throw new Error(`${source.id}: invalid fire-weather report`);
    return { field: "fireWeather", serialized: serialize(result.fireWeather), boundaries: [], weather: result.fireWeather };
  }
  if (source.product === "fire-weather") throw new Error(`${source.id}: expected fire-weather reports`);
  const { rows } = result;
  if (!rows.length && source.mode === "full") throw new Error("Full source returned no rows");
  const ordered = rows.map((row) => {
    const { fips, state, county, label, since, expires, sourceUpdated, sourceName, sourceUrl, officialUrl, note,
      scopeNote, validFrom, validUntil } = row;
    const scope = source.scope === "part" ? source.scope : row.scope ?? source.scope;
    if (state !== source.state || COUNTY_BY_FIPS.get(fips)?.state !== source.state || !BY_VALIDITY.has(row.status) ||
      (validFrom && !Number.isFinite(Date.parse(validFrom))) || (validUntil && !Number.isFinite(Date.parse(validUntil))) ||
      (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) || (scope === "part" && !scopeNote)) {
      throw new Error(`${source.id}: invalid status row for ${fips}`);
    }
    const status = row.status === "none" && source.mode === "positive-only" && scope !== "part" ? "unknown" : row.status;
    return { fips, state, county, status, label: status === row.status ? label : "Countywide status unconfirmed",
      since, expires, sourceUpdated, sourceName, sourceUrl, officialUrl, note,
      scope, scopeNote, sourceId: source.id, validFrom, validUntil };
  });
  const boundaries = [...new Set(ordered.flatMap(({ validFrom, validUntil }) =>
    [validFrom, validUntil].filter((value): value is string => Boolean(value))))].sort();
  return { field: "rows", serialized: serialize(ordered), boundaries };
}

// Sort complete normalized rows so publisher ordering alone does not cause a write.
function serialize(rows: unknown[]) {
  return [...new Set(rows.map((row) => JSON.stringify(row)))].sort().join(",");
}

async function legacyPayload(env: Env, id: string, hash: string) {
  const data = await env.KV.get<SourceData>(sourceKey(id), "json");
  if (data?.hash !== hash) throw new Error(`KV source revision is not visible yet: ${id}`);
  return data;
}

async function weatherWrites(db: D1Database, id: string, weather: FireWeatherReport[]) {
  const groups = new Map<string, FireWeatherReport[]>();
  for (const report of weather) {
    const state = COUNTY_BY_FIPS.get(report.fips)?.state;
    if (!state) continue;
    const group = groups.get(state);
    if (group) group.push(report);
    else groups.set(state, [report]);
  }
  const { results } = await db.prepare("SELECT state, hash FROM source_payload WHERE id = ?").bind(id)
    .all<{ state: string; hash: string }>();
  const previous = new Map(results.map(({ state, hash }) => [state, hash]));
  const insert = payloadUpsert(db);
  const remove = db.prepare("DELETE FROM source_payload WHERE id = ? AND state = ?");
  const writes = results.filter(({ state }) => !groups.has(state)).map(({ state }) => remove.bind(id, state));
  for (const [state, group] of groups) {
    const serialized = serialize(group);
    const hash = await sha256(serialized);
    if (previous.get(state) !== hash) writes.push(insert.bind(id, state, hash, `{"fireWeather":[${serialized}]}`));
  }
  return writes;
}

const payloadUpsert = (db: D1Database) => db.prepare(`INSERT INTO source_payload (id, state, hash, payload) VALUES (?, ?, ?, ?)
  ON CONFLICT(id, state) DO UPDATE SET hash = excluded.hash, payload = excluded.payload`);

/** Finish importing a national legacy head before any state uses its partitioned reports. */
export async function importLegacyWeather(env: Env, head: SourceHead) {
  if (head.stored || !head.hash) return;
  const data = await legacyPayload(env, head.id, head.hash);
  if (!("fireWeather" in data)) throw new Error(`Expected fire-weather revision: ${head.id}`);
  const writes = await weatherWrites(env.DB, head.id, data.fireWeather);
  await env.DB.batch([...writes, env.DB.prepare("UPDATE source_refresh SET stored = 1 WHERE id = ?").bind(head.id)]);
}

export async function pollSource(env: Env, source: ActiveSource, slot: number, now: Date): Promise<void> {
  const current = await env.DB.prepare(`SELECT ${headColumns} FROM source_refresh WHERE id = ?`)
    .bind(source.id).first<StoredHead>();
  if (current && current.slot >= slot) return;
  const previous = current ? loadHead(current) : undefined;
  const checked = now.toISOString();
  let hash = previous?.hash ?? null;
  let health: Health = { checked, lastGood: previous?.lastGood, validators: previous?.validators, boundaries: previous?.boundaries };
  let incoming: ReturnType<typeof normalize> | undefined;

  try {
    const result = await source.fetch({ now, validators: hash ? health.validators : undefined });
    if ("notModified" in result) {
      if (!hash) throw new Error("Source returned 304 before its first successful fetch");
    } else incoming = normalize(source, result);
    health = { ...health, lastGood: checked, validators: result.validators };
  } catch (reason) {
    health.error = errorText(reason);
    health.blocked = reason instanceof BlockedError;
    console.warn(`source ${source.id} failed: ${health.error}`);
  }

  const writes: D1PreparedStatement[] = [];
  const id = source.id;
  if (incoming) {
    const next = await sha256(incoming.serialized);
    if (next !== hash || !previous?.stored) {
      if (incoming.field === "fireWeather") writes.push(...await weatherWrites(env.DB, id, incoming.weather));
      else writes.push(payloadUpsert(env.DB).bind(id, source.state, next, `{"rows":[${incoming.serialized}]}`));
    }
    hash = next;
    health.boundaries = incoming.boundaries;
  } else if (hash && !previous?.stored) {
    const data = await legacyPayload(env, id, hash);
    if ("fireWeather" in data) writes.push(...await weatherWrites(env.DB, id, data.fireWeather));
    else writes.push(payloadUpsert(env.DB).bind(id, source.state, hash, JSON.stringify({ rows: data.rows })));
  }
  const update = env.DB.prepare(`INSERT INTO source_refresh (id, slot, hash, health, stored) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET slot = excluded.slot, hash = excluded.hash, health = excluded.health, stored = 1
    WHERE source_refresh.slot < excluded.slot`).bind(id, slot, hash, JSON.stringify(health));
  if (writes.length) await env.DB.batch([...writes, update]);
  else await update.run();
}

export function materialRevisions(sources: readonly Source[], heads: Map<string, SourceHead>, now: Date, weatherHashes?: Map<string, string>) {
  const time = now.getTime();
  return sources.map((source) => {
    const identity = [source.id, source.scope, source.mode, source.officialUrl, source.sourceUrl, source.sourceName, source.keepRowLinks, source.recurring,
      isActive(source) ? source.staleMs : null];
    const head = heads.get(source.id);
    if (!isActive(source)) return [...identity, source.error];
    if (source.product === "fire-weather" && weatherHashes && !weatherHashes.has(source.id)) return identity;
    if (!head) return [...identity, "pending"];
    const stale = head.lastGood ? time - Date.parse(head.lastGood) > (source.staleMs ?? STALE_MS) : false;
    const reached = head.boundaries?.filter((boundary) => Date.parse(boundary) <= time).length ?? 0;
    return [...identity, weatherHashes?.get(source.id) ?? head.hash, head.error ? head.blocked ? "blocked" : "failed" : "ok", stale, reached];
  });
}

function fallback(source: Source, prev: SnapshotData | null): CountyStatus[] {
  if (source.product === "fire-weather") return [];
  const rows: CountyStatus[] = [];
  for (const county of Object.values(prev?.counties ?? {})) {
    if (county.state !== source.state) continue;
    const ownOrders = county.orders?.filter((order) => order.sourceId === source.id) ?? [];
    const selected = county.sourceId ? county.sourceId === source.id : source.id === source.state.toLowerCase();
    if (selected && (county.scope !== "part" || !ownOrders.length)) {
      rows.push({ ...county, orders: undefined });
    }
    for (const order of ownOrders) {
      rows.push({ ...county, ...order, sourceUrl: source.sourceUrl, orders: undefined });
    }
  }
  return rows;
}

export async function readSourceInputs(
  env: Env, state: string, sources: readonly Source[], heads: Map<string, SourceHead>, prev: SnapshotData | null, now: Date,
): Promise<SourceInput[]> {
  const inputs: SourceInput[] = [];
  const checked = now.toISOString();
  const ids = sources.filter((source) => heads.get(source.id)?.stored).map(({ id }) => id);
  const { results } = await env.DB.prepare(`SELECT id, hash, payload FROM source_payload
    WHERE state = ? AND id IN (SELECT value FROM json_each(?))`).bind(state, JSON.stringify(ids))
    .all<{ id: string; hash: string; payload: string }>();
  const revisions = new Map(results.map((row) => [row.id, row]));
  for (const source of sources) {
    if (!isActive(source)) {
      inputs.push({ source, rows: [], checked, error: source.error });
      continue;
    }
    const head = heads.get(source.id);
    if (!head?.hash) {
      inputs.push({ source, rows: fallback(source, prev), checked: head?.checked ?? checked, error: head?.error ?? "Awaiting first source refresh" });
      continue;
    }
    const stored = revisions.get(source.id);
    const data: SourcePayload = head.stored
      ? stored ? JSON.parse(stored.payload) : { fireWeather: [] }
      : await legacyPayload(env, source.id, head.hash);
    if (head.stored && source.product !== "fire-weather" && stored?.hash !== head.hash) {
      throw new Error(`D1 source revision missing: ${source.id}`);
    }
    const lastGood = head.lastGood ?? head.checked;
    inputs.push({ source, version: head.hash, checked: head.checked, lastGood, error: head.error,
      staleMs: source.staleMs, ...("fireWeather" in data ? { rows: [], fireWeather: data.fireWeather } : { rows: data.rows }) });
  }
  return inputs;
}

export async function sourceInputs(sources: readonly Source[], prev: SnapshotData | null, now: Date): Promise<SourceInput[]> {
  const inputs: SourceInput[] = [];
  for (const source of sources) {
    const checked = now.toISOString();
    if (!isActive(source)) {
      inputs.push({ source, rows: [], checked, error: source.error });
      continue;
    }
    try {
      const result = await source.fetch({ now });
      if ("notModified" in result) throw new Error("Unexpected 304 without stored validators");
      const { field, serialized } = normalize(source, result);
      const data = JSON.parse(`{"${field}":[${serialized}]}`) as SourcePayload;
      inputs.push({ source, checked, lastGood: checked, staleMs: source.staleMs,
        ...("fireWeather" in data ? { rows: [], fireWeather: data.fireWeather } : { rows: data.rows }) });
    } catch (reason) {
      inputs.push({ source, rows: fallback(source, prev), checked, error: errorText(reason), staleMs: source.staleMs });
    }
  }
  return inputs;
}

export function applySourceChecks(sources: SnapshotData["sources"], heads: Map<string, SourceHead>) {
  for (const source of sources) {
    const head = heads.get(source.id);
    if (!head) continue;
    source.checked = head.checked;
    source.ok = !head.error;
    source.error = head.error;
  }
}

export function applyChecks(snapshot: SnapshotData, heads: Map<string, SourceHead>, now: Date) {
  applySourceChecks(snapshot.sources, heads);
  const clock = now.getTime();
  for (const row of Object.values(snapshot.counties)) {
    if (!row.sourceId) continue;
    applyCountyCheck(row, heads.get(row.sourceId), snapshot.sourceVersions?.[row.sourceId], clock);
  }
}

export function applyCountyCheck(row: CountyStatus, head: SourceHead | undefined, version: string | undefined, clock: number) {
  if (head?.lastGood && head.hash === version) row.checked = head.lastGood;
  if (row.validUntil && Date.parse(row.validUntil) <= clock) {
    row.status = "unknown";
    row.label = "Source decision expired";
    row.note = undefined;
    row.since = row.expires = null;
  } else if (clock - Date.parse(row.checked) > STALE_MS && row.status !== "unknown") {
    row.status = "unknown";
    row.label = "Source unavailable. Our last good data is over 48 hours old";
    row.note = undefined;
  }
  if (row.orders?.some((order) => order.validUntil && Date.parse(order.validUntil) <= clock)) {
    row.orders = row.orders.filter((order) => !order.validUntil || Date.parse(order.validUntil) > clock);
    // The merge rebuilds the human-readable summary of remaining orders.
    row.note = undefined;
  }
}
