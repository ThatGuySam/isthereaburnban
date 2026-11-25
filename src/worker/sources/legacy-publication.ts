import type { Snapshot, SnapshotData } from "../../shared/types";
import { STATE_BY_ABBR } from "../../shared/states-fips";
import { SNAPSHOT_KEY, type Env } from "../env";
import type { Notice } from "../notification-message";

export async function resumeLegacyPublication(env: Env, sendNotices: (env: Env, runId: string, notices: Notice[]) => Promise<unknown>) {
  const checkpoint = await env.DB.prepare("SELECT id, published FROM source_snapshot WHERE singleton = 1")
    .first<{ id: string; published: number }>();
  if (!checkpoint) {
    const snapshot = await env.KV.get(SNAPSHOT_KEY, "text");
    if (snapshot) await env.DB.prepare(`INSERT INTO source_snapshot (singleton, id, signature, published, snapshot, notices)
      VALUES (1, 'legacy-kv', '', 1, ?, '[]')`).bind(snapshot).run();
    return;
  }
  if (checkpoint.published) return;
  const pending = await env.DB.prepare("SELECT snapshot, notices FROM source_snapshot WHERE id = ?")
    .bind(checkpoint.id).first<{ snapshot: string; notices: string }>();
  if (!pending) throw new Error("Pending legacy snapshot missing");
  await env.KV.put(SNAPSHOT_KEY, pending.snapshot);
  const notices: Notice[] = JSON.parse(pending.notices);
  if (notices.length) await sendNotices(env, `sources-${checkpoint.id}`, notices);
  await env.DB.prepare("UPDATE source_snapshot SET published = 1, notices = '[]' WHERE id = ?").bind(checkpoint.id).run();
}

/** SQLite extracts one previous area without parsing the nationwide v1 value in each Worker. */
export async function readLegacyState(db: D1Database, state: string): Promise<Snapshot | null> {
  const prefix = STATE_BY_ABBR[state].fips;
  const row = await db.prepare(`SELECT
    snapshot ->> '$.generated' AS generated,
    (SELECT json_group_object(key, json(value)) FROM json_each(snapshot, '$.counties') WHERE substr(key, 1, 2) = ?1) AS counties,
    (SELECT json_group_array(json(value)) FROM json_each(snapshot, '$.sources') WHERE value ->> 'state' = ?2) AS sources,
    (SELECT json_group_object(key, json(value)) FROM json_each(snapshot, '$.verifiedOrders') WHERE substr(key, 1, 2) = ?1) AS verified,
    snapshot ->> '$.verifiedOrders' IS NOT NULL AS tracked,
    (SELECT json_group_object(key, value) FROM json_each(snapshot, '$.changed') WHERE substr(key, 1, 2) = ?1) AS changed,
    (SELECT json_group_object(key, json(value)) FROM json_each(snapshot, '$.fireWeather') WHERE substr(key, 1, 2) = ?1) AS weather
    FROM source_snapshot WHERE singleton = 1`).bind(prefix, state).first<{ generated: string; counties: string; changed: string; weather: string; sources: string; verified: string; tracked: number }>();
  if (!row) return null;
  const counties: SnapshotData["counties"] = JSON.parse(row.counties);
  return { version: 1, generated: row.generated, counties, sources: JSON.parse(row.sources), changed: JSON.parse(row.changed),
    fireWeather: JSON.parse(row.weather), verifiedOrders: row.tracked ? JSON.parse(row.verified) : undefined };
}
