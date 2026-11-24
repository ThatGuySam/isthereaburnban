import type { CountyStatus, MapStatus, Snapshot, SnapshotData } from "../shared/types";
import type { Adapter } from "./adapters";
import { formatNationalBans, projectWeather, type BanFormat } from "./active-bans";
import { countyDecision } from "./county-decision";
import { activeBans } from "./api";
import { SNAPSHOT_KEY, type Env } from "./env";
import { withFireWeather } from "./fire-weather";
import { projectMapStatus } from "./map-status";
import { countyState } from "./lookup";
import { CHANNELS } from "./notification-audience";
import { transitionNotice, type Transition } from "./notification-message";
import { notify } from "./notify";
import { withReportDates } from "./report-dates";
import { withPublishedChecks } from "./published-checks";
import { loadActive, loadIndex, loadMapStates, loadState } from "./snapshot-store";
import { lastChangedByState, type ActiveProjection, type SnapshotIndex, type StateSnapshot } from "./snapshot-v2";
import { withCurrentLinks } from "./source-links";
import { mergeSources } from "./sources/merge";
import { SOURCES } from "./sources/registry";
import { applyChecks, applySourceChecks, readHeads, sourceInputs, type SourceHead } from "./sources/state";
import { isActive } from "./sources/types";

export type { Transition } from "./notification-message";
export { STALE_MS } from "./sources/merge";
export { withCurrentLinks } from "./source-links";

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
    return { source, rows: rows.map(withReportDates), checked: now.toISOString(), error: errorText(result.reason) };
  }), now);
}

// Parsing the core snapshot costs a few ms of CPU. Reuse it within an isolate for a minute.
const memo = new WeakMap<KVNamespace, { at: number; snapshot: Snapshot }>();
const MEMO_MS = 60_000;

export async function readSnapshot(env: Env, fresh = false): Promise<Snapshot | null> {
  const cached = memo.get(env.KV);
  if (!fresh && cached && Date.now() - cached.at < MEMO_MS) return cached.snapshot;
  const snapshot = await env.KV.get<Snapshot>(SNAPSHOT_KEY, { type: "json" });
  if (!snapshot) return null;
  withCurrentLinks(snapshot);
  if (env.SOURCE_QUEUE) {
    const heads = await publicHeads(env);
    applyChecks(snapshot, heads, new Date());
  }
  memo.set(env.KV, { at: Date.now(), snapshot });
  return snapshot;
}

export function transitionInsert(db: D1Database, transitions: Transition[]) {
  return db.prepare(`INSERT INTO transitions (fips, old_status, new_status, at)
    SELECT value ->> 'fips', value ->> 'oldStatus', value ->> 'newStatus', value ->> 'at' FROM json_each(?)`)
    .bind(JSON.stringify(transitions));
}

export function alertNotices(transitions: Transition[], snapshot: SnapshotData) {
  return transitions
    .filter((t) => t.oldStatus === "ban" || t.newStatus === "ban" || t.oldStatus === "restricted" || t.newStatus === "restricted")
    .map((transition) => {
      const row = snapshot.counties[transition.fips];
      return transitionNotice(transition, row && countyDecision(row, Date.parse(snapshot.generated)));
    });
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

async function legacyOrInitial(env: Env, fresh: boolean, initialize: boolean): Promise<Snapshot> {
  const snapshot = await readSnapshot(env, fresh);
  if (snapshot) return snapshot;
  if (!env.SOURCE_QUEUE && initialize) return refresh(env);
  // A fresh deployment starts serving coverage immediately. The hourly queue fills in status.
  const now = new Date();
  return mergeSources(null, SOURCES.map((source) => ({
    source, rows: [], checked: now.toISOString(), error: isActive(source) ? "Awaiting first source refresh" : source.error,
  })), now).snapshot;
}

type Memo<T> = { until: number; value: T };
type ReadCache = {
  index?: Memo<SnapshotIndex>;
  heads?: Memo<Map<string, SourceHead>>;
  active: Partial<Record<BanFormat, Memo<ActiveProjection>>>;
  map?: MapStatus;
  states: Map<string, Memo<StateSnapshot> & { heads?: Map<string, SourceHead> }>;
};
const readCache = new WeakMap<KVNamespace, ReadCache>();
const keep = <T>(value: T): Memo<T> => ({ value, until: Date.now() + MEMO_MS });

function publicHeads(env: Env, ids?: string[]) {
  return readHeads(env.DB, ids).catch((error) => {
    console.warn("Source check times unavailable", errorText(error));
    return new Map<string, SourceHead>();
  });
}

/** A request pins one catalog, so even border lookups follow the same publication. */
export function snapshotReader(env: Env, { fresh = false, initialize = true } = {}) {
  let cache = readCache.get(env.KV);
  if (!cache) readCache.set(env.KV, cache = { active: {}, states: new Map() });
  const memo = cache;
  const reusable = (entry: Memo<unknown> | undefined) => !fresh && entry && Date.now() < entry.until;
  let index: Promise<SnapshotIndex | null> | undefined;
  let legacy: Promise<Snapshot> | undefined;
  const old = () => (legacy ??= legacyOrInitial(env, fresh, initialize));
  const catalog = () => (index ??= (async () => {
    if (memo.index && reusable(memo.index)) return memo.index.value;
    const value = await loadIndex(env);
    if (value) memo.index = keep(value);
    return value;
  })());
  const allHeads = async () => {
    if (memo.heads && reusable(memo.heads)) return memo.heads.value;
    const heads = await publicHeads(env);
    memo.heads = keep(heads);
    return heads;
  };
  const active = async (idx: SnapshotIndex, format: BanFormat) => {
    const cached = memo.active[format];
    if (cached && reusable(cached) && cached.value.revision === idx.revision) return cached.value;
    const projection = await loadActive(env, idx, format);
    memo.active[format] = keep(projection);
    return projection;
  };

  function countyView<T extends SnapshotData>(snapshot: T, heads: Map<string, SourceHead>, now: Date): T {
    const counties: SnapshotData["counties"] = {};
    for (const row of Object.values(snapshot.counties)) counties[row.fips] = { ...row };
    const view = { ...snapshot, counties, sources: snapshot.sources.map((source) => ({ ...source })) };
    withCurrentLinks(view);
    applyChecks(view, heads, now);
    return view;
  }

  function stateView(shard: StateSnapshot, idx: SnapshotIndex, heads: Map<string, SourceHead> | undefined, now: Date, weather: boolean): SnapshotData {
    const view = { ...shard, generated: idx.generated };
    const published = heads ? withPublishedChecks(countyView(view, heads, now), idx.orderChecks) : view;
    return weather ? withFireWeather(published, now.getTime(), idx.weatherChecked) : published;
  }

  async function state(st: string, { checks = true, weather = true } = {}): Promise<SnapshotData> {
    const idx = await catalog();
    if (!idx) {
      const snapshot = await old();
      const view = checks ? countyView(snapshot, new Map(), new Date()) : snapshot;
      return weather ? withFireWeather(view) : view;
    }
    let entry = memo.states.get(st);
    if (!entry || !reusable(entry) || entry.value.revision !== idx.states[st]?.revision) {
      const shard = await loadState(env, idx, st);
      if (!shard) return { generated: idx.generated, counties: {}, changed: {}, sources: [] };
      entry = keep(shard);
      memo.states.set(st, entry);
    }
    const shard = entry.value;
    let heads: Map<string, SourceHead> | undefined;
    if (checks) {
      if (memo.heads && reusable(memo.heads)) heads = memo.heads.value;
      else {
        heads = entry.heads ??= await publicHeads(env,
          shard.sources.filter((source) => source.mode !== "manual").map(({ id }) => id));
      }
    }
    return stateView(shard, idx, heads, new Date(), weather);
  }

  return {
    state,
    async county(fips: string, options?: Parameters<typeof state>[1]) {
      return state(countyState(fips), options);
    },
    async forCounties(fips: string[]) {
      const states = [...new Set(fips.map(countyState))];
      return new Map(await Promise.all(states.map(async (st) => [st, await state(st)] as const)));
    },
    async mapStatus() {
      const idx = await catalog();
      if (!idx) {
        const snapshot = await state("");
        return projectMapStatus(snapshot.generated, [snapshot], Date.now());
      }
      if (!fresh && memo.map?.revision === idx.revision && Date.now() < memo.map.expiresAt) return memo.map;
      const headsPromise = allHeads();
      const states = Object.keys(idx.states);
      const shards: StateSnapshot[] = [];
      const missing: string[] = [];
      for (const st of states) {
        const hit = memo.states.get(st);
        if (hit && reusable(hit) && hit.value.revision === idx.states[st]?.revision) shards.push(hit.value);
        else missing.push(st);
      }
      // D1 rows each fit under 2 MB; the KV bulk response cap is 25 MB.
      for (let start = 0; start < missing.length; start += 10) {
        for (const shard of await loadMapStates(env, idx, missing.slice(start, start + 10))) {
          memo.states.set(shard.state, keep(shard));
          shards.push(shard);
        }
      }
      const heads = await headsPromise;
      const now = new Date();
      const map = projectMapStatus(idx.revision, shards.map((shard) => stateView(shard, idx, heads, now, true)), now.getTime());
      map.expiresAt = Math.min(map.expiresAt, memo.heads?.until ?? Infinity);
      if (shards.length === states.length) memo.map = map;
      return map;
    },
    async coverage() {
      const idx = await catalog();
      if (!idx) return old();
      const sources = idx.sources.map((source) => ({ ...source }));
      applySourceChecks(sources, await allHeads());
      return { generated: idx.generated, sources };
    },
    async bans(stateQuery?: string, format: BanFormat = "compact") {
      const idx = await catalog();
      const st = stateQuery?.trim().toUpperCase();
      if (!idx || st) {
        const snapshot = await state(st ?? "");
        if (idx && st) {
          const sources = idx.sources.filter((source) => source.state === st).map((source) => ({ ...source }));
          applySourceChecks(sources, await publicHeads(env, sources.filter((s) => s.mode !== "manual").map(({ id }) => id)));
          snapshot.sources = sources;
        }
        const data = activeBans(snapshot, st);
        const body = format === "pretty" ? JSON.stringify(JSON.stringify(data, null, 2)) : JSON.stringify(data);
        return { body: [body], generated: data.generated, count: data.counties.length };
      }
      const [projection, heads] = await Promise.all([active(idx, format), allHeads()]);
      return formatNationalBans(projection, idx, heads, new Date(), format);
    },
    async weather() {
      const idx = await catalog();
      if (!idx) return withFireWeather(await old());
      const [projection, heads] = await Promise.all([active(idx, "compact"), allHeads()]);
      return projectWeather(projection, idx, heads, new Date());
    },
    async lastChanged() {
      const idx = await catalog();
      if (!idx) return lastChangedByState((await old()).changed ?? {});
      return Object.fromEntries(Object.entries(idx.states).map(([st, ref]) => [st, ref?.lastChanged]));
    },
  };
}

export type SnapshotReader = ReturnType<typeof snapshotReader>;
