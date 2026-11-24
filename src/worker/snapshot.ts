import type { CountyStatus, Snapshot, SourceHealth } from "../shared/types";
import { ADAPTERS, type Adapter } from "./adapters";
import { SNAPSHOT_KEY, type Env } from "./env";
import { CHANNELS } from "./notification-audience";
import { transitionNotice, type Transition } from "./notification-message";
import { notify } from "./notify";

export type { Transition } from "./notification-message";

export const STALE_MS = 48 * 60 * 60 * 1000;

/**
 * Pure: merge this run's adapter results into the previous snapshot.
 * - A failed source keeps its previous rows (health ok:false); rows older than 48h turn "unknown".
 * - `changed` records when each county's status last changed.
 * - Transitions only come from sources that succeeded this run, and never on first import.
 */
export function buildSnapshot(
  prev: Snapshot | null,
  adapters: Adapter[],
  results: PromiseSettledResult<CountyStatus[]>[],
  now: Date,
): { snapshot: Snapshot; transitions: Transition[] } {
  const at = now.toISOString();
  const counties: Record<string, CountyStatus> = {};
  const changed: Record<string, string> = { ...(prev?.changed ?? {}) };
  const sources: SourceHealth[] = [];
  const transitions: Transition[] = [];

  adapters.forEach((a, i) => {
    const r = results[i];
    let rows: CountyStatus[];
    let health: Pick<SourceHealth, "ok" | "error">;

    if (r.status === "fulfilled") {
      rows = r.value;
      health = { ok: true };
      for (const row of rows) {
        const old = prev?.counties[row.fips];
        if (!old) {
          changed[row.fips] ??= row.since ?? row.sourceUpdated ?? at;
        } else if (old.status !== row.status) {
          changed[row.fips] = at;
          transitions.push({ fips: row.fips, oldStatus: old.status, newStatus: row.status, at });
        }
        // Keep "since" stable: source date if given, else when we first saw this status.
        if (!row.since) row.since = old && old.status === row.status && old.since ? old.since : changed[row.fips];
      }
    } else {
      const error = r.reason instanceof Error ? r.reason.message : String(r.reason);
      health = { ok: false, error: error.slice(0, 300) };
      rows = Object.values(prev?.counties ?? {})
        .filter((c) => c.state === a.state)
        .map((c) => {
          if (now.getTime() - Date.parse(c.checked) <= STALE_MS || c.status === "unknown") return c;
          changed[c.fips] = at;
          return { ...c, status: "unknown" as const, label: "Source unavailable; our last good data is over 48 hours old" };
        });
    }

    for (const row of rows) counties[row.fips] = row;
    sources.push({
      id: a.id,
      state: a.state,
      mode: a.mode,
      checked: at,
      counties: rows.length,
      bans: rows.filter((c) => c.status === "ban").length,
      ...health,
    });
  });

  return { snapshot: { version: 1, generated: at, counties, sources, changed }, transitions };
}

// Parsing the ~450 KB snapshot costs a few ms of CPU, so reuse it within an isolate for a minute.
let memo: { at: number; snapshot: Snapshot } | undefined;
const MEMO_MS = 60_000;

export async function readSnapshot(env: Env, fresh = false): Promise<Snapshot | null> {
  if (!fresh && memo && Date.now() - memo.at < MEMO_MS) return memo.snapshot;
  const snapshot = await env.KV.get<Snapshot>(SNAPSHOT_KEY, { type: "json", cacheTtl: 60 });
  if (snapshot) {
    withCurrentLinks(snapshot);
    memo = { at: Date.now(), snapshot };
  }
  return snapshot;
}

/**
 * Official links come from the deployed adapter code, not from the stored snapshot,
 * so a link fix takes effect on deploy instead of waiting for the next cron run.
 * Adapters that link per-county documents (keepRowLinks) keep their row links.
 */
export function withCurrentLinks(snapshot: Snapshot, adapters: Adapter[] = ADAPTERS): Snapshot {
  const byState = new Map(adapters.map((a) => [a.state, a]));
  for (const row of Object.values(snapshot.counties)) {
    const a = byState.get(row.state);
    if (!a) continue;
    row.sourceName = a.sourceName;
    row.sourceUrl = a.sourceUrl;
    if (!a.keepRowLinks || !row.officialUrl) row.officialUrl = a.officialUrl;
  }
  return snapshot;
}

export async function refresh(env: Env, adapters: Adapter[] = ADAPTERS, scheduledTime?: number): Promise<Snapshot> {
  const prev = await readSnapshot(env, true);
  const results = await Promise.allSettled(adapters.map((a) => a.fetch()));
  const { snapshot, transitions } = buildSnapshot(prev, adapters, results, new Date());
  await env.KV.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
  memo = { at: Date.now(), snapshot };
  for (const s of snapshot.sources) if (!s.ok) console.warn(`source ${s.id} failed: ${s.error}`);

  if (transitions.length) {
    try {
      const stmt = env.DB.prepare("INSERT INTO transitions (fips, old_status, new_status, at) VALUES (?, ?, ?, ?)");
      await env.DB.batch(transitions.map((t) => stmt.bind(t.fips, t.oldStatus, t.newStatus, t.at)));
      const alerts = transitions.filter((t) => t.oldStatus === "ban" || t.newStatus === "ban" || t.oldStatus === "restricted" || t.newStatus === "restricted");
      if (alerts.length) {
        await notify(env, {
          mode: "send",
          origin: "cron",
          runId: `cron-${scheduledTime ?? snapshot.generated}`,
          audience: { kind: "all" },
          channels: CHANNELS,
          notices: alerts.map((transition) => transitionNotice(transition, snapshot.counties[transition.fips])),
        });
      }
    } catch (err) {
      console.error("transition handling failed", err);
    }
  }
  return snapshot;
}

/** Snapshot for a request; on a fresh deployment with an empty KV, build one inline. */
export async function getSnapshot(env: Env): Promise<Snapshot> {
  return (await readSnapshot(env)) ?? refresh(env);
}
