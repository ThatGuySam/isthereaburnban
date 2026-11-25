import type { DeliveryOutcome } from "./delivery";
import { sendAlertEmail } from "./email";
import type { Env } from "./env";
import { maskTarget, type Channel, type Delivery } from "./notification-audience";
import { alertsPaused } from "./notification-controls";
import type { Notice } from "./notification-message";
import { pushVapid, sendPush } from "./push";

const BATCH_SIZE = 4;
const HOUR = 3_600_000;
// Keep retries inside Resend's 24-hour idempotency window.
const MAX_AGE = 12 * HOUR;
const LEASE_MS = 120_000;

export async function enqueueNotices(env: Env, runId: string, notices: Notice[], channels: readonly Channel[], now = Date.now()) {
  if (!notices.length) return;
  const { DB: db } = env;
  const serialized = JSON.stringify(notices);
  const unclaimed = "NOT EXISTS (SELECT 1 FROM notification_runs WHERE id = ?)";
  const matching = "n.value ->> 'fips' IN (SELECT value FROM json_each(s.fips_json))";

  // Stage the audience in D1 without loading it into the Worker. The run receipt and all
  // recipients commit together, so publication can safely retry without resnapshotting the audience.
  const statements = channels.map((channel) => channel === "push"
    ? db.prepare(`INSERT INTO notification_outbox (run_id, channel, recipient, notices, due_at)
        SELECT ?, 'push', s.endpoint, json_array(json(n.value)), ?
        FROM push_subscriptions s JOIN json_each(?) n ON ${matching}
        WHERE ${unclaimed}`).bind(runId, now, serialized, runId)
    : db.prepare(`INSERT INTO notification_outbox (run_id, channel, recipient, notices, due_at)
        SELECT ?, 'email', s.id, (SELECT json_group_array(json(n.value)) FROM json_each(?) n WHERE ${matching}), ?
        FROM email_subscriptions s WHERE s.confirmed_at IS NOT NULL AND s.unsubscribed_at IS NULL
        AND EXISTS (SELECT 1 FROM json_each(?) n WHERE ${matching}) AND ${unclaimed}`)
        .bind(runId, serialized, now, serialized, runId));
  await db.batch([...statements, db.prepare(`INSERT OR IGNORE INTO notification_runs (id, at, origin, audience, fips, completed_at)
    VALUES (?, ?, 'cron', 'all', ?, CASE WHEN EXISTS (SELECT 1 FROM notification_outbox WHERE run_id = ?) THEN NULL ELSE ? END)`)
    .bind(runId, now, [...new Set(notices.map(({ fips }) => fips))].join(","), runId, now)]);
}

type Pending = {
  id: number; run_id: string; channel: Channel; recipient: string; notices: string; attempts: number;
};

async function currentDelivery(db: D1Database, item: Pending): Promise<Delivery | null> {
  const notices: Notice[] = JSON.parse(item.notices);
  const fips = JSON.stringify(notices.map((notice) => notice.fips));
  const follows = `NOT EXISTS (SELECT value FROM json_each(?) EXCEPT SELECT value FROM json_each(fips_json))`;
  if (item.channel === "push") {
    const target = await db.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = ? AND ${follows}`)
      .bind(item.recipient, fips).first<Extract<Delivery, { channel: "push" }>["target"]>();
    return target && { channel: "push", target, notices: [notices[0]] };
  }
  const target = await db.prepare(`SELECT id, email, token FROM email_subscriptions
    WHERE id = ? AND confirmed_at IS NOT NULL AND unsubscribed_at IS NULL AND ${follows}`)
    .bind(item.recipient, fips).first<Extract<Delivery, { channel: "email" }>["target"]>();
  return target && { channel: "email", target, notices };
}

async function deliver(env: Env, item: Pending, d: Delivery): Promise<DeliveryOutcome> {
  return d.channel === "push"
    ? sendPush(env, d.target, d.notices[0], `alert-${item.id}`)
    : sendAlertEmail(env, d.target, d.notices, `alerts/${item.run_id}/${item.id}`);
}

export async function drainOutbox(env: Env, now = Date.now()): Promise<boolean> {
  if (await alertsPaused(env)) return false;
  const { DB: db } = env;
  const lease = crypto.randomUUID();
  const channels = JSON.stringify([...(pushVapid(env) ? ["push"] : []), ...(env.RESEND_API_KEY ? ["email"] : [])]);
  // Expire old alerts even when the corresponding provider is unavailable.
  const ready = "status = 'pending' AND due_at <= ? AND (channel IN (SELECT value FROM json_each(?)) OR run_id IN (SELECT id FROM notification_runs WHERE at <= ?))";
  const bindings = [now, channels, now - MAX_AGE] as const;
  const { results } = await db.prepare(`UPDATE notification_outbox SET lease = ?, due_at = ?
    WHERE id IN (SELECT id FROM notification_outbox WHERE ${ready} ORDER BY due_at, id LIMIT ?)
    RETURNING id, run_id, channel, recipient, notices, attempts`).bind(lease, now + LEASE_MS, ...bindings, BATCH_SIZE).all<Pending>();
  if (!results.length) return false;

  const changes = await Promise.all(results.map(async (item) => {
    const created = await db.prepare("SELECT at FROM notification_runs WHERE id = ?").bind(item.run_id).first<number>("at");
    const expired = created === null || now - created >= MAX_AGE;
    const delivery = expired ? null : await currentDelivery(db, item);
    const outcome = delivery ? await deliver(env, item, delivery)
      : expired ? { result: "error", error: "Delivery expired", permanent: true } as const
      : { result: "skipped", error: "Recipient no longer eligible" } as const;
    const attempts = item.attempts + 1;
    const retryAt = now + HOUR * 2 ** (attempts - 1);
    const retry = outcome.result === "error" && !outcome.permanent && created !== null && retryAt < created + MAX_AGE;
    const status = retry ? "pending" : outcome.result;
    const statements = [db.prepare(`INSERT INTO notification_delivery_log
      (run_id, at, channel, audience, mode, fips, target_masked, result, provider_id, error)
      SELECT run_id, ?, channel, 'all', 'send', ?, ?, ?, ?, ? FROM notification_outbox WHERE id = ? AND lease = ?`)
      .bind(new Date(now).toISOString(), (JSON.parse(item.notices) as Notice[]).map(({ fips }) => fips).join(","),
        delivery ? maskTarget(delivery) : null, retry ? "retry" : status,
        outcome.result === "accepted" ? outcome.providerId ?? null : null,
        outcome.result === "accepted" ? null : outcome.error, item.id, lease)];
    if (outcome.result === "gone" && delivery?.channel === "push") {
      statements.push(db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ? AND p256dh = ? AND auth = ?
        AND EXISTS (SELECT 1 FROM notification_outbox WHERE id = ? AND lease = ?)`)
        .bind(delivery.target.endpoint, delivery.target.p256dh, delivery.target.auth, item.id, lease));
    }
    statements.push(db.prepare(`UPDATE notification_outbox SET status = ?, attempts = ?, due_at = ?, lease = NULL,
      recipient = CASE WHEN ? THEN recipient END, notices = CASE WHEN ? THEN notices END WHERE id = ? AND lease = ?`)
      .bind(status, attempts, retry ? retryAt : now, Number(retry), Number(retry), item.id, lease));
    return statements;
  }));
  await db.batch([...changes.flat(), db.prepare(`UPDATE notification_runs SET completed_at = ?
    WHERE id IN (SELECT value FROM json_each(?)) AND completed_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM notification_outbox WHERE run_id = notification_runs.id AND status = 'pending')`)
    .bind(now, JSON.stringify([...new Set(results.map((item) => item.run_id))]))]);
  return results.length === BATCH_SIZE && !!await db.prepare(`SELECT 1 FROM notification_outbox WHERE ${ready} LIMIT 1`)
    .bind(...bindings).first();
}

export function outboxStatus(db: D1Database) {
  return db.prepare(`SELECT channel, count(*) FILTER (WHERE status = 'pending') AS pending,
    count(*) FILTER (WHERE status = 'pending' AND attempts > 0) AS retrying,
    count(*) FILTER (WHERE status IN ('error', 'gone')) AS failed,
    min(r.at) FILTER (WHERE status = 'pending') AS oldest
    FROM notification_outbox o JOIN notification_runs r ON o.run_id = r.id GROUP BY channel`)
    .all<{ channel: Channel; pending: number; retrying: number; failed: number; oldest: number | null }>();
}
