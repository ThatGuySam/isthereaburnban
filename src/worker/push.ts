import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import type { Snapshot } from "../shared/types";
import { cleanFipsList } from "./counties";
import type { Env } from "./env";
import { transitionMessage, type Transition } from "./snapshot";

type SubRow = { endpoint: string; p256dh: string; auth: string; fips_json: string };

export async function subscribePush(env: Env, body: unknown): Promise<{ ok: boolean; error?: string; fips?: string[] }> {
  const b = (body ?? {}) as { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; fips?: unknown };
  const sub = b.subscription;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (!endpoint.startsWith("https://") || endpoint.length > 1000 || !p256dh || !auth) return { ok: false, error: "subscription must include an https endpoint and keys.p256dh / keys.auth" };
  const fips = cleanFipsList(b.fips);
  if (!fips.length) return { ok: false, error: "fips must be a non-empty array of 5-digit county FIPS codes" };
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

/** Send one notification per subscriber per changed county they follow. Gone subscriptions are deleted. */
export async function notifyPush(env: Env, transitions: Transition[], snapshot: Snapshot): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !transitions.length) return;
  const byFips = new Map(transitions.map((t) => [t.fips, t]));
  const marks = transitions.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT s.endpoint, s.p256dh, s.auth, s.fips_json FROM push_subscriptions s, json_each(s.fips_json) j WHERE j.value IN (${marks})`,
  )
    .bind(...byFips.keys())
    .all<SubRow>();

  const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const gone: string[] = [];
  await Promise.allSettled(
    results.flatMap((row) => {
      const subscription: PushSubscription = { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } };
      const followed = (JSON.parse(row.fips_json) as string[]).filter((f) => byFips.has(f));
      return followed.map(async (f) => {
        const m = transitionMessage(byFips.get(f)!, snapshot);
        const data = JSON.stringify({ title: m.title, body: m.body, url: m.url, fips: f });
        const payload = await buildPushPayload({ data, options: { ttl: 6 * 3600, urgency: "high", topic: `f${f}` } }, subscription, vapid);
        const res = await fetch(row.endpoint, payload);
        if (res.status === 404 || res.status === 410) gone.push(row.endpoint);
      });
    }),
  );
  if (gone.length) {
    const stmt = env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
    await env.DB.batch([...new Set(gone)].map((e) => stmt.bind(e)));
  }
}
