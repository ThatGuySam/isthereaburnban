import type { CountyStatus, Snapshot } from "../shared/types";
import { ADAPTERS, type Adapter } from "./adapters";
import { SNAPSHOT_KEY, type Env } from "./env";
import { withFireWeather } from "./fire-weather";
import { CHANNELS } from "./notification-audience";
import { transitionNotice, type Transition } from "./notification-message";
import { notify } from "./notify";
import { mergeSources } from "./sources/merge";
import { SOURCES } from "./sources/registry";
import { applyChecks, readHeads, sourceInputs } from "./sources/state";
import { isActive } from "./sources/types";

export type { Transition } from "./notification-message";
export { STALE_MS } from "./sources/merge";

function errorText(reason: unknown): string {
  return (reason instanceof Error ? reason.message : String(reason)).slice(0, 300);
}

export function buildSnapshot(
  prev: Snapshot | null,
  adapters: Adapter[],
  results: PromiseSettledResult<CountyStatus[]>[],
  now: Date,
): { snapshot: Snapshot; transitions: Transition[] } {
  return mergeSources(prev, adapters.map((source, i) => {
    const result = results[i];
    if (result.status === "fulfilled") return { source, rows: result.value, checked: now.toISOString() };
    const rows = Object.values(prev?.counties ?? {}).filter((row) =>
      row.sourceId ? row.sourceId === source.id : row.state === source.state);
    return { source, rows, checked: now.toISOString(), error: errorText(result.reason) };
  }), now);
}

// Parsing the core snapshot costs a few ms of CPU. Reuse it within an isolate for a minute.
const memo = new WeakMap<KVNamespace, { at: number; snapshot: Snapshot }>();
const MEMO_MS = 60_000;
const BY_ID = new Map(SOURCES.map((source) => [source.id, source]));
const LEGACY_BY_STATE = new Map(ADAPTERS.map((source) => [source.state, source]));

export async function readSnapshot(env: Env, fresh = false): Promise<Snapshot | null> {
  const cached = memo.get(env.KV);
  if (!fresh && cached && Date.now() - cached.at < MEMO_MS) return cached.snapshot;
  const snapshot = await env.KV.get<Snapshot>(SNAPSHOT_KEY, { type: "json" });
  if (!snapshot) return null;
  withCurrentLinks(snapshot);
  if (env.SOURCE_QUEUE) {
    const heads = await readHeads(env.DB).catch((error) => {
      console.warn("Source check times unavailable", errorText(error));
      return new Map();
    });
    applyChecks(snapshot, heads, new Date());
  }
  memo.set(env.KV, { at: Date.now(), snapshot });
  return snapshot;
}

/** Apply current links without replacing a scoped or per-order link with a state directory link. */
export function withCurrentLinks(snapshot: Snapshot, adapters?: Adapter[]): Snapshot {
  const legacy = adapters ? new Map(adapters.map((a) => [a.state, a])) : LEGACY_BY_STATE;
  for (const row of Object.values(snapshot.counties)) {
    const a = row.sourceId && !adapters ? BY_ID.get(row.sourceId) : legacy.get(row.state);
    if (!a) continue;
    row.sourceName = a.sourceName;
    row.sourceUrl = a.sourceUrl;
    if (!a.keepRowLinks || !row.officialUrl) row.officialUrl = a.officialUrl;
  }
  return snapshot;
}

export function transitionInsert(db: D1Database, transitions: Transition[]) {
  return db.prepare(`INSERT INTO transitions (fips, old_status, new_status, at)
    SELECT value ->> 'fips', value ->> 'oldStatus', value ->> 'newStatus', value ->> 'at' FROM json_each(?)`)
    .bind(JSON.stringify(transitions));
}

export function alertNotices(transitions: Transition[], snapshot: Snapshot) {
  return transitions
    .filter((t) => t.oldStatus === "ban" || t.newStatus === "ban" || t.oldStatus === "restricted" || t.newStatus === "restricted")
    .map((transition) => transitionNotice(transition, snapshot.counties[transition.fips]));
}

export async function refresh(env: Env, adapters?: Adapter[], scheduledTime?: number): Promise<Snapshot> {
  const prev = await readSnapshot(env, true);
  const now = new Date();
  let result: ReturnType<typeof mergeSources>;
  if (adapters) {
    const results: PromiseSettledResult<CountyStatus[]>[] = [];
    for (const adapter of adapters) {
      try { results.push({ status: "fulfilled", value: await adapter.fetch() }); }
      catch (reason) { results.push({ status: "rejected", reason }); }
    }
    result = buildSnapshot(prev, adapters, results, now);
  } else {
    result = mergeSources(prev, await sourceInputs(SOURCES, prev, now), now);
  }
  const { snapshot, transitions } = result;
  await env.KV.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
  memo.set(env.KV, { at: Date.now(), snapshot });
  for (const s of snapshot.sources) if (!s.ok && s.mode !== "manual") console.warn(`source ${s.id} failed: ${s.error}`);

  if (transitions.length) {
    try {
      await transitionInsert(env.DB, transitions).run();
      const notices = alertNotices(transitions, snapshot);
      if (notices.length) {
        await notify(env, {
          mode: "send", origin: "cron", runId: `cron-${scheduledTime ?? snapshot.generated}`,
          audience: { kind: "all" }, channels: CHANNELS, notices,
        });
      }
    } catch (err) {
      console.error("transition handling failed", err);
    }
  }
  return snapshot;
}

export async function getSnapshot(env: Env): Promise<Snapshot> {
  const snapshot = await readSnapshot(env);
  if (snapshot) return withFireWeather(snapshot);
  if (!env.SOURCE_QUEUE) return withFireWeather(await refresh(env));
  // A fresh deployment starts serving coverage immediately. The hourly queue fills in status.
  const now = new Date();
  return mergeSources(null, SOURCES.map((source) => ({
    source, rows: [], checked: now.toISOString(), error: isActive(source) ? "Awaiting first source refresh" : source.error,
  })), now).snapshot;
}
