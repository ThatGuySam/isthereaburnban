import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { cleanFipsList } from "./counties";
import type { DeliveryOutcome } from "./delivery";
import type { Env } from "./env";
import type { Notice } from "./notification-message";

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export function pushVapid(env: Env) {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = env;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export async function subscribePush(
  env: Env, body: unknown, testDevice?: { canary: boolean },
): Promise<{ ok: boolean; error?: string; fips?: string[] }> {
  const b = (body ?? {}) as { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; fips?: unknown };
  const sub = b.subscription;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (!endpoint.startsWith("https://") || endpoint.length > 1000 || !p256dh || !auth) return { ok: false, error: "subscription must include an https endpoint and keys.p256dh / keys.auth" };
  const fips = cleanFipsList(b.fips);
  if (!fips.length) return { ok: false, error: "fips must be a non-empty array of 5-digit county FIPS codes" };
  if (testDevice) {
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, fips_json, created, is_test, is_canary, ops_id)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
         is_test = 1, is_canary = excluded.is_canary, ops_id = COALESCE(push_subscriptions.ops_id, excluded.ops_id),
         fips_json = CASE WHEN EXISTS (SELECT 1 FROM json_each(push_subscriptions.fips_json) WHERE value = ?)
           THEN push_subscriptions.fips_json ELSE json_insert(push_subscriptions.fips_json, '$[#]', ?) END`,
    ).bind(endpoint, p256dh, auth, JSON.stringify(fips), new Date().toISOString(),
      Number(testDevice.canary), crypto.randomUUID(), fips[0], fips[0]).run();
    return { ok: true, fips };
  }

  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, fips_json, created) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, fips_json = excluded.fips_json`,
  )
    .bind(endpoint, p256dh, auth, JSON.stringify(fips), new Date().toISOString())
    .run();
  return { ok: true, fips };
}

export async function unsubscribePush(env: Env, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const endpoint = (body as { endpoint?: unknown } | null)?.endpoint;
  if (typeof endpoint !== "string" || !endpoint) return { ok: false, error: "endpoint is required" };
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
  return { ok: true };
}

export async function sendPush(env: Env, target: PushTarget, notice: Notice, eventTag?: string): Promise<DeliveryOutcome> {
  const vapid = pushVapid(env);
  if (!vapid) return { result: "error", error: "VAPID is unavailable" };
  const { kind, fips, title, body, url } = notice;
  const tag = eventTag ?? (kind === "live" ? undefined : `${kind}-${fips}`);
  const subscription: PushSubscription = {
    endpoint: target.endpoint, expirationTime: null, keys: { p256dh: target.p256dh, auth: target.auth },
  };

  let payload;
  try {
    const data = JSON.stringify({ title, body, url, fips, tag });
    payload = await buildPushPayload({
      data, options: { ttl: 6 * 3600, urgency: "high", topic: tag ?? `f${fips}` },
    }, subscription, vapid);
  } catch {
    return { result: "error", error: "Push encryption or VAPID signing failed", permanent: true };
  }

  try {
    const res = await fetch(target.endpoint, { ...payload, redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (res.ok) return { result: "accepted" };
    const error = `Push HTTP ${res.status}`;
    return { result: res.status === 404 || res.status === 410 ? "gone" : "error", error,
      permanent: [400, 413, 422].includes(res.status) };
  } catch {
    return { result: "error", error: "Push request failed" };
  }
}
