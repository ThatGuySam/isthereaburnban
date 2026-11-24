import type { DeliveryOutcome } from "./delivery";
import type { Env } from "./env";
import { maskPush, type Delivery } from "./notification-audience";
import { alertsPaused } from "./notification-controls";
import type { Notice } from "./notification-message";
import { pushVapid, sendPush, type PushTarget } from "./push";

export const PUSH_RETRY_SECONDS = 60;
const LEASE_MS = PUSH_RETRY_SECONDS * 1_000;
const BATCH_SIZE = 4;
type PushDelivery = Extract<Delivery, { channel: "push" }>;

export function seedPushDeliveries(db: D1Database, runId: string, token: string, now: number, deliveries: Delivery[]) {
  const rows = deliveries.flatMap((d) => d.channel === "push" ? [{ endpoint: d.target.endpoint, notice: d.notices[0] }] : []);
  if (!rows.length) return [];
  const insert = db.prepare(`INSERT OR IGNORE INTO notification_push_deliveries
      (run_id, endpoint, fips, notice, pause_generation, available_at)
    SELECT runs.id, subscription.endpoint, payload.value ->> '$.notice.fips', payload.value -> '$.notice',
      settings.generation, ?
    FROM notification_runs AS runs, notification_settings AS settings, json_each(?) AS payload
    JOIN push_subscriptions AS subscription ON subscription.endpoint = (payload.value ->> '$.endpoint')
    WHERE runs.id = ? AND runs.push_seed_token = ? AND settings.id = 1 AND settings.paused = 0`);
  const writes: D1PreparedStatement[] = [];
  for (let offset = 0; offset < rows.length; offset += 24) {
    writes.push(insert.bind(now, JSON.stringify(rows.slice(offset, offset + 24)), runId, token));
  }
  return writes;
}

type Attempt = {
  runId: string;
  target: PushTarget;
  notice: Notice;
};

export async function sendClaimedPush(env: Env, { runId, target, notice }: Attempt, now = Date.now()): Promise<DeliveryOutcome | null> {
  const { endpoint, p256dh, auth } = target;
  const identity = [runId, endpoint, notice.fips];
  const lease = crypto.randomUUID();
  const acquired = await env.DB.prepare(`UPDATE notification_push_deliveries SET available_at = ?, lease = ?
    WHERE run_id = ? AND endpoint = ? AND fips = ? AND available_at <= ?
      AND EXISTS (SELECT 1 FROM notification_settings
        WHERE id = 1 AND paused = 0 AND generation = notification_push_deliveries.pause_generation)
      AND EXISTS (SELECT 1 FROM push_subscriptions AS subscription
        WHERE subscription.endpoint = notification_push_deliveries.endpoint AND subscription.p256dh = ?
          AND subscription.auth = ? AND EXISTS (SELECT 1 FROM json_each(subscription.fips_json) WHERE value = ?))`)
    .bind(now + LEASE_MS, lease, ...identity, now, p256dh, auth, notice.fips).run();
  if (!acquired.meta.changes) return null;

  const outcome = await sendPush(env, target, notice);
  const finished = Date.now();
  const retryAt = outcome.result === "error" && outcome.retry ? finished + LEASE_MS : null;
  const writes = [
    env.DB.prepare(`INSERT INTO notification_delivery_log
      (run_id, at, channel, audience, mode, fips, target_masked, result, error)
      SELECT deliveries.run_id, ?, 'push', runs.audience, 'send', deliveries.fips, ?, ?, ?
      FROM notification_push_deliveries AS deliveries JOIN notification_runs AS runs ON runs.id = deliveries.run_id
      WHERE deliveries.run_id = ? AND deliveries.endpoint = ? AND deliveries.fips = ? AND deliveries.lease = ?`)
      .bind(new Date(finished).toISOString(), maskPush(endpoint), outcome.result,
        outcome.result === "accepted" ? null : outcome.error, ...identity, lease),
    env.DB.prepare(`UPDATE notification_push_deliveries SET available_at = ?, lease = NULL, sent_at = ?
      WHERE run_id = ? AND endpoint = ? AND fips = ? AND lease = ?`)
      .bind(retryAt, outcome.result === "accepted" ? finished : null, ...identity, lease),
  ];
  const [, marked] = await env.DB.batch(writes);
  if (!marked.meta.changes) return null;
  if (outcome.result === "gone") {
    // Match the attempt's credentials in case a device has since updated its subscription.
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND p256dh = ? AND auth = ?")
      .bind(endpoint, p256dh, auth).run();
  }
  return outcome;
}

export async function nudgePushRetries(env: Env, delaySeconds: number) {
  await env.SOURCE_QUEUE?.send({ kind: "push-retry" }, { delaySeconds });
}

/** The hourly cron also runs this sweep if the first continuation was never enqueued. */
export async function retryPendingPush(env: Env, now = Date.now()): Promise<number | null> {
  if (!pushVapid(env) || await alertsPaused(env)) return null;
  const { results } = await env.DB.prepare(`SELECT
      deliveries.run_id AS runId, deliveries.endpoint, subscription.p256dh, subscription.auth, deliveries.notice, deliveries.available_at AS availableAt
    FROM notification_push_deliveries AS deliveries
    JOIN notification_settings AS settings ON settings.id = 1 AND settings.paused = 0
      AND settings.generation = deliveries.pause_generation
    JOIN push_subscriptions AS subscription ON subscription.endpoint = deliveries.endpoint
    WHERE deliveries.available_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM json_each(subscription.fips_json) WHERE value = deliveries.fips)
    ORDER BY deliveries.available_at, deliveries.run_id, deliveries.endpoint, deliveries.fips LIMIT ?`)
    .bind(BATCH_SIZE + 1).all<PushTarget & { runId: string; notice: string; availableAt: number }>();
  const due = results.slice(0, BATCH_SIZE).filter(({ availableAt }) => availableAt <= now);
  const outcomes = await Promise.all(due.map(({ runId, notice, endpoint, p256dh, auth }) =>
    sendClaimedPush(env, { runId, target: { endpoint, p256dh, auth }, notice: JSON.parse(notice) }, now)));
  const next = results[due.length]?.availableAt;
  const retry = outcomes.some((outcome) => outcome?.result === "error" && outcome.retry);
  if (next === undefined) return retry ? PUSH_RETRY_SECONDS : null;
  return Math.max(0, Math.ceil((next - now) / 1_000));
}

export function attemptPushDelivery(env: Env, runId: string, { target, notices: [notice] }: PushDelivery) {
  return sendClaimedPush(env, { runId, target, notice });
}
