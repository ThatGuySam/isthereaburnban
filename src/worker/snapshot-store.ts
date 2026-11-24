import { ACTIVE_KEY, decodeActive, encodeActive, INDEX_KEY, PRETTY_ACTIVE_KEY, stateKey, type ActiveProjection, type SnapshotIndex, type StateSnapshot } from "./snapshot-v2";
import type { BanFormat } from "./active-bans";
import type { Env } from "./env";

export async function readPublication(db: D1Database): Promise<{ slot: number; catalog: SnapshotIndex } | null> {
  const row = await db.prepare("SELECT slot, catalog FROM snapshot_publication WHERE singleton = 1")
    .first<{ slot: number; catalog: string }>();
  return row ? { slot: row.slot, catalog: JSON.parse(row.catalog) } : null;
}

export async function readStateRevision(db: D1Database, state: string, revision: string): Promise<StateSnapshot | null> {
  const text = await db.prepare("SELECT snapshot FROM snapshot_state WHERE state = ? AND revision = ?")
    .bind(state, revision).first<string>("snapshot");
  return text ? JSON.parse(text) : null;
}

export async function readActiveFragments(db: D1Database, format: BanFormat, index?: SnapshotIndex) {
  const fields = `${format === "pretty" ? "active_pretty" : "active"} AS active, weather, weather_counties AS weatherCounties`;
  const query = index
    ? db.prepare(`SELECT ${fields} FROM snapshot_state AS shard
        JOIN json_each(?) AS ref ON shard.state = ref.key AND shard.revision = (ref.value ->> '$.revision')
        ORDER BY shard.state`).bind(JSON.stringify(index.states))
    : db.prepare(`SELECT ${fields} FROM snapshot_state
        WHERE rowid IN (SELECT MAX(rowid) FROM snapshot_state GROUP BY state) ORDER BY state`);
  return (await query.all<{ active: string; weatherCounties: string; weather: string }>()).results;
}

export async function loadIndex(env: Env) {
  const cached = await env.KV.get<SnapshotIndex>(INDEX_KEY, "json");
  if (cached?.version === 2) return cached;
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
    const shard = await env.KV.get<StateSnapshot>(stateKey(state), "json");
    if (shard?.revision === ref.revision) return shard;
  }
  const shard = await readStateRevision(env.DB, state, ref.revision);
  if (!shard) throw new Error(`Snapshot shard unavailable: ${state}/${ref.revision}`);
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
    if (hit?.revision === ref.revision) shards.push(hit);
    else missing[st] = ref.revision;
  }
  if (!Object.keys(missing).length) return shards;
  const { results } = await env.DB.prepare(`SELECT snapshot FROM snapshot_state AS shard
    JOIN json_each(?) AS ref ON shard.state = ref.key AND shard.revision = ref.value`)
    .bind(JSON.stringify(missing)).all<{ snapshot: string }>();
  // During catalog lag a retained state revision can be temporarily unavailable.
  // Leave those counties unknown until the next map refresh.
  return shards.concat(results.map(({ snapshot }) => JSON.parse(snapshot)));
}

export async function loadActive(env: Env, index: SnapshotIndex, format: BanFormat): Promise<ActiveProjection> {
  const raw = await env.KV.get(format === "pretty" ? PRETTY_ACTIVE_KEY : ACTIVE_KEY, "text");
  const projection = raw ? decodeActive(raw) : null;
  if (projection?.revision === index.revision) return projection;
  const fragments = await readActiveFragments(env.DB, format, index);
  if (fragments.length !== Object.keys(index.states).length) throw new Error(`Active snapshot unavailable: ${index.revision}`);
  return decodeActive(encodeActive(index.revision, fragments));
}
