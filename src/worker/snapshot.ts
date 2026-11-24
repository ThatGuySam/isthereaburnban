import type { CountyStatus, Snapshot, SourceHealth } from "../shared/types";
import { ADAPTERS, type Adapter } from "./adapters";
import { countyPath } from "./counties";
import { notifyEmail } from "./email";
import { SNAPSHOT_KEY, type Env } from "./env";
import { notifyPush } from "./push";

export const STALE_MS = 48 * 60 * 60 * 1000;

export type Transition = { fips: string; oldStatus: CountyStatus["status"]; newStatus: CountyStatus["status"]; at: string };

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

export async function readSnapshot(env: Env): Promise<Snapshot | null> {
  return env.KV.get<Snapshot>(SNAPSHOT_KEY, "json");
}

export async function refresh(env: Env, adapters: Adapter[] = ADAPTERS): Promise<Snapshot> {
  const prev = await readSnapshot(env);
  const results = await Promise.allSettled(adapters.map((a) => a.fetch()));
  const { snapshot, transitions } = buildSnapshot(prev, adapters, results, new Date());
  await env.KV.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
  for (const s of snapshot.sources) if (!s.ok) console.warn(`source ${s.id} failed: ${s.error}`);

  if (transitions.length) {
    try {
      const stmt = env.DB.prepare("INSERT INTO transitions (fips, old_status, new_status, at) VALUES (?, ?, ?, ?)");
      await env.DB.batch(transitions.map((t) => stmt.bind(t.fips, t.oldStatus, t.newStatus, t.at)));
      const alerts = transitions.filter((t) => t.oldStatus === "ban" || t.newStatus === "ban" || t.oldStatus === "restricted" || t.newStatus === "restricted");
      if (alerts.length) await Promise.allSettled([notifyPush(env, alerts, snapshot), notifyEmail(env, alerts, snapshot)]);
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

/** One-line human message for a county's change, shared by push and email. */
export function transitionMessage(t: Transition, snapshot: Snapshot): { title: string; body: string; url: string; county: CountyStatus | undefined } {
  const c = snapshot.counties[t.fips];
  const where = c ? `${c.county}, ${c.state}` : t.fips;
  const title =
    t.newStatus === "ban" ? `Burn ban: ${where}` : t.newStatus === "restricted" ? `Burning restricted: ${where}` : t.oldStatus === "ban" ? `Burn ban lifted: ${where}` : `Burn status changed: ${where}`;
  const body = c ? `${c.label}. Source: ${c.sourceName}. Check the official page before burning.` : "Check the official source before burning.";
  return { title, body, url: countyPath(t.fips), county: c };
}
