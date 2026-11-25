import { createHash } from "node:crypto";
import { STATES } from "../../shared/states-fips";
import type { SnapshotData, SourceHealth } from "../../shared/types";
import type { Env } from "../env";
import type { Notice } from "../notification-message";
import { alertNotices, transitionInsert } from "../snapshot";
import { readActiveFragments, readPublication } from "../snapshot-store";
import { ACTIVE_KEY, encodeActive, encodeState, INDEX_KEY, PRETTY_ACTIVE_KEY, stateKey,
  type SnapshotIndex, type StateSnapshot, type StateSummary } from "../snapshot-v2";
import { readLegacyState, resumeLegacyPublication } from "./legacy-publication";
import { mergeSources, type SourceInput } from "./merge";
import { importLegacyWeather, materialRevisions, readHeads, readSourceInputs, type SourceHead } from "./state";
import type { Source } from "./types";

// Leave room for retries, a refresh straddling midnight, and operational writes.
export const MAX_CACHED_STATES = 32;
// Bump when the same material revisions need a different state projection.
const MERGE_VERSION = 5;

type StateJob = { state: string; signature: string; cache: boolean };
type RunRow = { id: string; slot: number; generated: string; plan: string; cursor: number };
type Run = Omit<RunRow, "plan"> & { plan: StateJob[] };
type SendNotices = (env: Env, runId: string, notices: Notice[]) => Promise<unknown>;
type PublishedState = { state: string; revision: string; cached: number; summary: string };

export function buildStatePublication(prev: SnapshotData | null, inputs: SourceInput[], now: Date, state: string, revision: string, signature: string) {
  const { snapshot, transitions, answers } = mergeSources(prev, inputs, now);
  return { ...encodeState({ ...snapshot, version: 2, state, revision }, signature, answers), transitions, notices: alertNotices(transitions, snapshot) };
}

export async function currentRun(db: D1Database): Promise<Run | null> {
  const run = await db.prepare("SELECT id, slot, generated, plan, cursor FROM snapshot_run WHERE singleton = 1").first<RunRow>();
  return run ? { ...run, plan: JSON.parse(run.plan) } : null;
}

function stateSources(sources: readonly Source[], state: string) {
  return sources.filter((source) => source.state === state || source.product === "fire-weather");
}

export async function planPublication(env: Env, slot: number, now: Date, sources: readonly Source[],
  heads: Map<string, SourceHead>, sendNotices: SendNotices): Promise<string | null> {
  const published = await readPublication(env.DB);
  // At most one publication per hourly slot. A poll finishing after the readiness timeout is picked up next hour.
  if (published && Math.floor(published.slot / 3_600_000) >= Math.floor(slot / 3_600_000)) return null;
  const previous = published?.catalog;
  if (!previous) await resumeLegacyPublication(env, sendNotices);
  const national = sources.filter((source) => source.product === "fire-weather");
  for (const source of national) {
    const head = heads.get(source.id);
    if (head) await importLegacyWeather(env, head);
  }
  const { results } = await env.DB.prepare(`SELECT id, state, hash FROM source_payload
    WHERE id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(national.map(({ id }) => id)))
    .all<{ id: string; state: string; hash: string }>();
  const weather = new Map<string, Map<string, string>>();
  for (const { id, state, hash } of results) {
    let hashes = weather.get(state);
    if (!hashes) weather.set(state, hashes = new Map());
    hashes.set(id, hash);
  }
  const plan: StateJob[] = [];
  // Rotate which states are cached if a busy hour needs the D1 overflow path.
  const offset = Math.floor(slot / 3_600_000) % STATES.length;
  for (let i = 0; i < STATES.length; i++) {
    const state = STATES[(offset + i + STATES.length) % STATES.length].abbr;
    const material = materialRevisions(stateSources(sources, state), heads, now, weather.get(state) ?? new Map());
    const signature = createHash("sha256").update(JSON.stringify([MERGE_VERSION, material])).digest("hex");
    if (signature !== previous?.states[state]?.signature) {
      plan.push({ state, signature, cache: !previous || plan.length < MAX_CACHED_STATES });
    }
  }
  // Refresh a global health-only change (for example a failing NWS poll with an empty feed).
  const healthChanged = national.some(({ id }) => {
    const before = previous?.sources.find((source) => source.id === id);
    const head = heads.get(id);
    return Boolean(before) && before?.ok !== Boolean(head && !head.error);
  });
  if (!plan.length && !healthChanged) return null;
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO snapshot_run (singleton, id, slot, generated, plan) VALUES (1, ?, ?, ?, ?)")
    .bind(id, slot, now.toISOString(), JSON.stringify(plan)).run();
  return id;
}

async function mergeState(env: Env, run: Run, job: StateJob, sources: readonly Source[]) {
  const { state, signature, cache } = job;
  const staged = await env.DB.prepare("SELECT cached FROM snapshot_state WHERE state = ? AND revision = ?")
    .bind(state, run.id).first<{ cached: number }>();
  let serialized: string | null = null;
  if (!staged) {
    const local = stateSources(sources, state);
    const prevText = await env.DB.prepare("SELECT snapshot FROM snapshot_state WHERE state = ? ORDER BY rowid DESC LIMIT 1")
      .bind(state).first<string>("snapshot");
    const prev: SnapshotData | null = prevText ? JSON.parse(prevText) : await readLegacyState(env.DB, state);
    const now = new Date(run.generated);
    const heads = await readHeads(env.DB, local.map(({ id }) => id));
    const inputs = await readSourceInputs(env, state, local, heads, prev, now);
    const encoded = buildStatePublication(prev, inputs, now, state, run.id, signature);
    serialized = encoded.snapshot;
    const prune = env.DB.prepare(`DELETE FROM snapshot_state WHERE state = ? AND revision NOT IN
      (SELECT revision FROM snapshot_state WHERE state = ? ORDER BY rowid DESC LIMIT 2)`);
    const insert = env.DB.prepare(`INSERT INTO snapshot_state
      (state, revision, snapshot, summary, active, active_pretty, weather_counties, weather, notices) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const statements = [prune.bind(state, state), insert.bind(state, run.id, serialized, encoded.summary,
      encoded.active, encoded.pretty, encoded.weatherCounties, encoded.weather, JSON.stringify(encoded.notices))];
    if (encoded.transitions.length) statements.push(transitionInsert(env.DB, encoded.transitions));
    await env.DB.batch(statements);
  }
  if (cache && !staged?.cached) {
    const key = stateKey(state);
    const metadata = staged ? (await env.KV.getWithMetadata<{ revision: string }>(key, "text")).metadata : null;
    if (metadata?.revision !== run.id) {
      serialized ??= await env.DB.prepare("SELECT snapshot FROM snapshot_state WHERE state = ? AND revision = ?")
        .bind(state, run.id).first<string>("snapshot");
      if (!serialized) throw new Error(`Staged snapshot missing: ${state}`);
      await env.KV.put(key, serialized, { metadata: { revision: run.id } });
    }
    await env.DB.prepare("UPDATE snapshot_state SET cached = 1 WHERE state = ? AND revision = ?").bind(state, run.id).run();
  }
}

// All shards are staged before this runs. Previous rows remain available for cached indexes.
const CURRENT_STATES = "rowid IN (SELECT MAX(rowid) FROM snapshot_state GROUP BY state)";

export function buildCatalog(run: Pick<Run, "id" | "generated">, states: PublishedState[],
  sources: readonly Pick<Source, "id">[], heads: Map<string, SourceHead>): SnapshotIndex {
  const sourceVersions: Record<string, string> = {};
  const index: SnapshotIndex = { version: 2, revision: run.id, generated: run.generated,
    states: {}, sources: [], sourceVersions, orderChecks: {} };
  const health = new Map<string, SourceHealth>();
  let allDatesTracked = true;
  for (const { state, revision, summary, cached } of states) {
    const { signature, reportDates, lastChanged, sources: local, sourceVersions: versions }: StateSummary = JSON.parse(summary);
    allDatesTracked &&= reportDates === true;
    index.states[state] = { revision, signature, lastChanged, cached: Boolean(cached) };
    Object.assign(sourceVersions, versions);
    for (const item of local) {
      const previous = health.get(item.id);
      if (previous && item.product === "fire-weather") previous.counties += item.counties;
      else health.set(item.id, item);
    }
  }
  if (allDatesTracked) index.reportDates = true;
  index.sources = sources.flatMap(({ id }) => {
    const row = health.get(id);
    if (!row) return [];
    const head = heads.get(id);
    row.checked = head?.checked ?? run.generated;
    row.lastAttemptedAt = head?.checked ?? null;
    row.lastSuccessfulAt = head?.lastGood ?? null;
    if (head) {
      row.ok = !head.error;
      row.error = head.error;
      row.failedSince = head.error ? head.failedSince ?? head.checked : undefined;
      row.ruleReview = head.ruleReview;
      row.ruleChanged = head.ruleChanged;
      if (!head.ruleReview && head.hash && head.hash === sourceVersions[id]) index.orderChecks[id] = head.lastGood ?? head.checked;
      if (row.product === "fire-weather" && head.hash) index.weatherChecked = head.lastGood ?? head.checked;
    }
    return [row];
  });
  return index;
}

async function publishCatalog(env: Env, run: Run, sources: readonly Source[]) {
  const { results } = await env.DB.prepare(`SELECT state, revision, cached, summary FROM snapshot_state WHERE ${CURRENT_STATES}`)
    .all<PublishedState>();
  const heads = await readHeads(env.DB);
  const serialized = JSON.stringify(buildCatalog(run, results, sources, heads));
  const result = await env.DB.prepare(`INSERT INTO snapshot_publication (singleton, slot, catalog)
    SELECT 1, ?, ? WHERE EXISTS (SELECT 1 FROM snapshot_run WHERE id = ? AND cursor = ?)
    ON CONFLICT(singleton) DO UPDATE SET slot = excluded.slot, catalog = excluded.catalog
    WHERE snapshot_publication.slot <= excluded.slot`).bind(run.slot, serialized, run.id, run.cursor).run();
  if (result.meta.changes) await env.KV.put(INDEX_KEY, serialized);
}

/** Advance one durable step per queue invocation, including a fully cold 51-area rebuild. */
export async function advancePublication(env: Env, run: Run, sources: readonly Source[], sendNotices: SendNotices): Promise<boolean> {
  const current = await env.DB.prepare("SELECT cursor FROM snapshot_run WHERE id = ?").bind(run.id).first<number>("cursor");
  if (current !== run.cursor) return current !== null;
  const job = run.plan[run.cursor];
  if (job) await mergeState(env, run, job, sources);
  else if (run.cursor <= run.plan.length + 1) {
    const format = run.cursor === run.plan.length ? "compact" : "pretty";
    const rows = await readActiveFragments(env.DB, format);
    await env.KV.put(format === "pretty" ? PRETTY_ACTIVE_KEY : ACTIVE_KEY, encodeActive(run.id, rows));
  } else if (run.cursor === run.plan.length + 2) await publishCatalog(env, run, sources);
  else {
    const { results } = await env.DB.prepare("SELECT notices FROM snapshot_state WHERE revision = ? AND notices <> '[]'")
      .bind(run.id).all<{ notices: string }>();
    const notices = results.flatMap(({ notices }): Notice[] => JSON.parse(notices));
    if (notices.length) await sendNotices(env, `sources-${run.id}`, notices);
    await env.DB.prepare("DELETE FROM snapshot_run WHERE id = ? AND cursor = ?").bind(run.id, run.cursor).run();
    return false;
  }
  await env.DB.prepare("UPDATE snapshot_run SET cursor = cursor + 1 WHERE id = ? AND cursor = ?").bind(run.id, run.cursor).run();
  return true;
}
