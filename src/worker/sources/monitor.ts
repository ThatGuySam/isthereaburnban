import { countiesInState } from "../counties";
import type { Env } from "../env";
import type { Notice } from "../notification-message";
import { enqueueOpsNotice } from "../notification-outbox";
import { readPublication } from "../snapshot-store";
import { cachedLocalClock, pollingSlots } from "./schedule";
import { readHeads, type SourceHead } from "./state";
import { isActive, type Source } from "./types";

const expectedCount = (source: Source) => isActive(source)
  ? source.expectedFips?.length ?? (source.mode === "full" ? countiesInState(source.state).length : source.reportingFips?.length ?? null)
  : null;

export async function pipelineStatus(env: Env, sources: readonly Source[], now = Date.now()) {
  const [heads, published, pending, dead, issues] = await Promise.all([
    readHeads(env.DB), readPublication(env.DB),
    env.DB.prepare(`SELECT min(slot) AS oldest FROM (SELECT slot FROM source_jobs UNION ALL SELECT slot FROM snapshot_run)`).first<number>("oldest"),
    env.DB.prepare(`SELECT message_id AS id, received_at AS receivedAt, body ->> 'kind' AS kind,
      body ->> 'slot' AS slot, body ->> 'id' AS subject FROM source_dead_letters
      WHERE replayed_at IS NULL ORDER BY received_at, message_id LIMIT 50`).all(),
    env.DB.prepare("SELECT id, opened_at AS openedAt, detail FROM source_issues ORDER BY opened_at, id").all(),
  ]);
  const roster = new Map(published?.catalog.sources.map((source) => [source.id, source.counties]));
  const clock = cachedLocalClock();
  return {
    oldestPendingSlot: pending,
    deadLetters: dead.results,
    issues: issues.results,
    sources: sources.map((source) => {
      const head = heads.get(source.id);
      const { next: nextDue } = isActive(source) ? pollingSlots(source, now, clock) : { next: null };
      return {
        id: source.id, state: source.state, mode: source.mode, lastAttempt: head?.checked ?? null,
        lastSuccess: head?.lastGood ?? null, nextDue, consecutiveFailures: failures(head),
        mapped: head?.mappedCount ?? (head?.error ? null : roster.get(source.id) ?? null),
        expected: expectedCount(source), publishedMapped: roster.get(source.id) ?? null,
        error: head?.error ?? (!isActive(source) ? source.error : null),
      };
    }),
  };
}

const failures = (head: SourceHead | undefined) => head?.consecutiveFailures ?? (head?.error ? 1 : 0);

export async function runSourceMonitor(env: Env, sources: readonly Source[], now: number) {
  const { DB: db } = env;
  await db.prepare("INSERT OR IGNORE INTO source_monitor VALUES (1, ?)").bind(now).run();
  const [startedAt, heads, published] = await Promise.all([
    db.prepare("SELECT started_at FROM source_monitor WHERE singleton = 1").first<number>("started_at"),
    readHeads(db),
    readPublication(db),
  ]);
  type Issue = Omit<NonNullable<Notice["incident"]>, "openedAt"> & { detail: string };
  const issues = new Map<string, Issue>();
  const clock = cachedLocalClock();
  const roster = new Map(published?.catalog.sources.map((source) => [source.id, source.counties]));
  for (const source of sources) {
    if (!isActive(source) || source.mode !== "full") continue;
    const head = heads.get(source.id);
    const { overdue } = pollingSlots(source, now, clock);
    const pastDue = overdue[1] !== undefined && (
      head?.lastGood ? Date.parse(head.lastGood) < overdue[1]
        : failures(head) >= 2 || (startedAt !== null && startedAt <= overdue[1])
    );
    if (pastDue) issues.set(`overdue/${source.id}`, {
      state: source.state, sourceIds: [source.id], detail: `${source.id} missed two scheduled source checks.`,
      nextStep: "Open your private dashboard bookmark. In Source pipeline, check the last attempt, last success, and dead letters for this source.",
    });
    const expected = expectedCount(source) ?? 0;
    const mapped = Math.min(head?.mappedCount ?? Infinity, roster.get(source.id) ?? Infinity);
    if (head?.lastGood && mapped < expected) {
      const id = `roster/${source.state}`;
      const detail = `${source.state} roster coverage dropped. ${source.id} mapped ${mapped} of ${expected} expected counties.`;
      const previous = issues.get(id);
      issues.set(id, {
        state: source.state, sourceIds: [...(previous?.sourceIds ?? []), source.id],
        detail: previous ? `${previous.detail} ${detail}` : detail,
        nextStep: "Open your private dashboard bookmark. In Source pipeline, compare mapped and expected county counts, then inspect the source feed for missing counties.",
      });
    }
  }
  const update = db.prepare(`INSERT INTO source_issues (id, opened_at, detail) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET detail = excluded.detail WHERE source_issues.detail <> excluded.detail`);
  await db.batch([
    db.prepare("DELETE FROM source_issues WHERE id NOT IN (SELECT value FROM json_each(?))").bind(JSON.stringify([...issues.keys()])),
    ...[...issues].map(([id, issue]) => update.bind(id, now, issue.detail)),
  ]);

  if (!env.OPS_ALERT_EMAIL && !await db.prepare("SELECT 1 FROM push_subscriptions WHERE is_canary = 1 LIMIT 1").first()) return false;
  const { results } = await db.prepare(`SELECT i.id, i.opened_at, i.detail FROM source_issues i
    WHERE NOT EXISTS (SELECT 1 FROM notification_runs r WHERE r.id = 'pipeline-' || i.id || '-' || i.opened_at)
    ORDER BY i.opened_at, i.id LIMIT 8`).all<{ id: string; opened_at: number; detail: string }>();
  let notified = false;
  for (const issue of results) {
    const current = issues.get(issue.id);
    if (!current || current.detail !== issue.detail) continue;
    const { detail, ...incident } = current;
    await enqueueOpsNotice(env, `pipeline-${issue.id}-${issue.opened_at}`, {
      kind: "ops", fips: "", title: "Burn ban pipeline alert", body: detail, url: "/api/v1/coverage",
      incident: { ...incident, openedAt: issue.opened_at },
    }, now);
    notified = true;
  }
  return notified;
}
