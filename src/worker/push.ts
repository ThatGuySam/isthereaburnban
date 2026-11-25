import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { cleanFipsList } from "./counties";
import type { DeliveryOutcome } from "./delivery";
import type { Env } from "./env";
import type { Notice } from "./notification-message";

const PUSH_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);

function pushEndpoint(value: string): string | null {
  if (!value.startsWith("https://") || value.length > 1000 || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    const hosted = PUSH_HOSTS.has(url.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
    if (!hosted || url.username || url.password || url.port || url.hash || url.pathname === "/") return null;
    return url.href;
  } catch {
    return null;
  }
}

function pushKey(value: unknown, size: number) {
  if (typeof value !== "string" || value.length > 88 || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  const unpadded = decoded.toString("base64url");
  const padded = unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, "=");
  return decoded.length === size && (value === unpadded || value === padded) ? { decoded, unpadded, padded } : null;
}

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
  const endpoint = typeof sub?.endpoint === "string" ? pushEndpoint(sub.endpoint) : null;
  const publicKey = pushKey(sub?.keys?.p256dh, 65);
  const secret = pushKey(sub?.keys?.auth, 16);
  if (!endpoint || !publicKey || publicKey.decoded[0] !== 4 || !secret) {
    return { ok: false, error: "subscription must use a supported push service and valid keys" };
  }
  try {
    await crypto.subtle.importKey("raw", Uint8Array.from(publicKey.decoded), { name: "ECDH", namedCurve: "P-256" }, false, []);
  } catch {
    return { ok: false, error: "subscription public key is invalid" };
  }
  const { unpadded: p256dh } = publicKey;
  const { unpadded: auth, padded } = secret;
  const fips = cleanFipsList(b.fips);
  if (!fips.length) return { ok: false, error: "fips must be a non-empty array of 5-digit county FIPS codes" };
  if (testDevice) {
    const result = await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, fips_json, created, is_test, is_canary, ops_id)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
         is_test = 1, is_canary = excluded.is_canary, ops_id = COALESCE(push_subscriptions.ops_id, excluded.ops_id),
         fips_json = CASE WHEN EXISTS (SELECT 1 FROM json_each(push_subscriptions.fips_json) WHERE value = ?)
           THEN push_subscriptions.fips_json ELSE json_insert(push_subscriptions.fips_json, '$[#]', ?) END
       WHERE push_subscriptions.auth IN (?, ?)`,
    ).bind(endpoint, p256dh, auth, JSON.stringify(fips), new Date().toISOString(),
      Number(testDevice.canary), crypto.randomUUID(), fips[0], fips[0], auth, padded).run();
    return result.meta.changes ? { ok: true, fips } : { ok: false, error: "subscription credentials do not match" };
  }

  const result = await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, fips_json, created) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, fips_json = excluded.fips_json
     WHERE push_subscriptions.auth IN (?, ?)`,
  )
    .bind(endpoint, p256dh, auth, JSON.stringify(fips), new Date().toISOString(), auth, padded)
    .run();
  return result.meta.changes ? { ok: true, fips } : { ok: false, error: "subscription credentials do not match" };
}

export async function unsubscribePush(env: Env, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const input = body as { endpoint?: unknown; auth?: unknown } | null;
  const endpoint = typeof input?.endpoint === "string" ? pushEndpoint(input.endpoint) : null;
  const secret = pushKey(input?.auth, 16);
  if (!endpoint || !secret) return { ok: false, error: "endpoint and subscription auth key are required" };
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND auth IN (?, ?)")
    .bind(endpoint, secret.unpadded, secret.padded).run();
  return { ok: true };
}

export async function sendPush(env: Env, target: PushTarget, notice: Notice, eventTag?: string): Promise<DeliveryOutcome> {
  if (!pushEndpoint(target.endpoint)) return { result: "gone", error: "Unsupported push endpoint" };
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
