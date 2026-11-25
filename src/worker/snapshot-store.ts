import { ACTIVE_KEY, decodeActive, encodeActive, INDEX_KEY, stateKey, type ActiveProjection, type SnapshotIndex, type StateSnapshot } from "./snapshot-v2";
import { readStateParts } from "./snapshot-chunks";
import type { Env } from "./env";

export class SnapshotRevisionUnavailable extends Error {}

async function readCache<T>(read: () => Promise<T | null>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export async function readPublication(db: D1Database): Promise<{ slot: number; catalog: SnapshotIndex } | null> {
  const row = await db.prepare("SELECT slot, catalog FROM snapshot_publication WHERE singleton = 1")
    .first<{ slot: number; catalog: string }>();
  return row ? { slot: row.slot, catalog: JSON.parse(row.catalog) } : null;
}

export async function readStateRevision(db: D1Database, state: string, revision: string): Promise<StateSnapshot | null> {
  const row = await db.prepare("SELECT snapshot, chunked FROM snapshot_state WHERE state = ? AND revision = ?")
    .bind(state, revision).first<{ snapshot: string; chunked: number }>();
  if (!row) return null;
  const serialized = row.chunked ? (await readStateParts(db, [{ state, revision }], ["snapshot"])).get(state)?.snapshot?.join("") : row.snapshot;
  return serialized ? JSON.parse(serialized) : null;
}

export async function readActiveFragments(db: D1Database, index?: SnapshotIndex) {
  const fields = "shard.state, shard.revision, chunked, active, weather, weather_counties AS weatherCounties";
  const query = index
    ? db.prepare(`SELECT ${fields} FROM snapshot_state AS shard
        JOIN json_each(?) AS ref ON shard.state = ref.key AND shard.revision = (ref.value ->> '$.revision')
        ORDER BY shard.state`).bind(JSON.stringify(index.states))
    : db.prepare(`SELECT ${fields} FROM snapshot_state AS shard
        WHERE rowid IN (SELECT MAX(rowid) FROM snapshot_state GROUP BY state) ORDER BY state`);
  const { results } = await query.all<{ state: string; revision: string; chunked: number;
    active: string; weatherCounties: string; weather: string }>();
  const parts = await readStateParts(db, results.filter((row) => row.chunked), ["active", "weather_counties", "weather"]);
  return results.map((row) => {
    const chunk = parts.get(row.state);
    if (!row.chunked) return row;
    if (!chunk?.active?.length) throw new SnapshotRevisionUnavailable(`Active snapshot unavailable: ${row.state}/${row.revision}`);
    return { active: chunk.active.join(""), weatherCounties: chunk.weather_counties?.join("") ?? "",
      weather: chunk.weather?.join("") ?? "" };
  });
}

export async function readStateNotices(db: D1Database, revision: string) {
  const { results } = await db.prepare(`SELECT state, revision, chunked, notices FROM snapshot_state
    WHERE revision = ? AND (chunked = 1 OR notices <> '[]')`).bind(revision)
    .all<{ state: string; revision: string; chunked: number; notices: string }>();
  const parts = await readStateParts(db, results.filter((row) => row.chunked), ["notices"]);
  return results.map((row) => {
    const notices = row.chunked ? parts.get(row.state)?.notices?.join("") : row.notices;
    if (!notices) throw new Error(`Staged notices missing: ${row.state}/${row.revision}`);
    return notices;
  });
}

export async function loadIndex(env: Env) {
  const cached = await readCache(() => env.KV.get<SnapshotIndex>(INDEX_KEY, "json"));
  if (cached?.version === 2 && typeof cached.revision === "string" && cached.states && Array.isArray(cached.sources)) return cached;
  const publication = await readPublication(env.DB).catch((error) => {
    console.warn("Snapshot catalog unavailable", String(error));
    return null;
  });
  return publication?.catalog ?? null;
}

export async function loadState(env: Env, index: SnapshotIndex, state: string): Promise<StateSnapshot | null> {
  const ref = index.states[state];
  if (!ref) return null;
  if (ref.cached) {
    const shard = await readCache(() => env.KV.get<StateSnapshot>(stateKey(state), "json"));
    if (shard?.revision === ref.revision && shard.state === state && shard.counties && Array.isArray(shard.sources)) return shard;
  }
  const shard = await readStateRevision(env.DB, state, ref.revision);
  if (!shard) throw new SnapshotRevisionUnavailable(`Snapshot shard unavailable: ${state}/${ref.revision}`);
  return shard;
}

/** Bulk reads keep the map within the connection limit, including D1-only state revisions. */
export async function loadMapStates(env: Env, index: SnapshotIndex, states: string[]): Promise<StateSnapshot[]> {
  const cachedKeys = states.filter((st) => index.states[st]?.cached).map(stateKey);
  const cached = cachedKeys.length ? await env.KV.get<StateSnapshot>(cachedKeys, "json").catch(() => null) : null;
  const shards: StateSnapshot[] = [];
  const missing: Record<string, string> = {};
  for (const st of states) {
    const ref = index.states[st];
    if (!ref) continue;
    const hit = cached?.get(stateKey(st));
    if (hit?.revision === ref.revision && hit.state === st && hit.counties && Array.isArray(hit.sources)) shards.push(hit);
    else missing[st] = ref.revision;
  }
  if (!Object.keys(missing).length) return shards;
  const { results } = await env.DB.prepare(`SELECT shard.state, shard.revision, shard.chunked, snapshot FROM snapshot_state AS shard
    JOIN json_each(?) AS ref ON shard.state = ref.key AND shard.revision = ref.value`)
    .bind(JSON.stringify(missing)).all<{ state: string; revision: string; chunked: number; snapshot: string }>();
  if (results.length !== Object.keys(missing).length) throw new SnapshotRevisionUnavailable(`Map snapshots unavailable: ${index.revision}`);
  const parts = await readStateParts(env.DB, results.filter((row) => row.chunked), ["snapshot"]);
  for (const row of results) {
    const serialized = row.chunked ? parts.get(row.state)?.snapshot?.join("") : row.snapshot;
    if (!serialized) throw new SnapshotRevisionUnavailable(`Map snapshot unavailable: ${row.state}/${row.revision}`);
    shards.push(JSON.parse(serialized));
  }
  return shards;
}

export async function loadActive(env: Env, index: SnapshotIndex): Promise<ActiveProjection> {
  const projection = await readCache(async () => {
    const raw = await env.KV.get(ACTIVE_KEY, "text");
    return raw ? decodeActive(raw) : null;
  });
  if (projection?.revision === index.revision) return projection;
  const fragments = await readActiveFragments(env.DB, index);
  if (fragments.length !== Object.keys(index.states).length) throw new SnapshotRevisionUnavailable(`Active snapshot unavailable: ${index.revision}`);
  return decodeActive(encodeActive(index.revision, fragments));
}
