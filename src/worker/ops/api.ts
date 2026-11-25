import { z } from "zod";
import { COUNTY_BY_FIPS } from "../counties";
import type { Env } from "../env";
import { CHANNELS, maskPush, RESEND_TEST_ADDRESSES, type Channel } from "../notification-audience";
import { alertsPaused, MANUAL_LIMIT, setAlertsPaused } from "../notification-controls";
import { countyBulletin, testNotice } from "../notification-message";
import { outboxStatus } from "../notification-outbox";
import { NotificationError, notify, providerStatus } from "../notify";
import { readJsonBody, RequestBodyError } from "../request-body";
import { subscribePush } from "../push";
import { statusFor } from "../lookup";
import { snapshotReader } from "../snapshot";
import { replayDeadLetter } from "../sources/dead-letter";
import { pipelineStatus } from "../sources/monitor";
import { SOURCES } from "../sources/registry";
import { evidenceInEffect } from "../../shared/evidence";

const fips = z.string().regex(/^\d{5}$/).refine((value) => COUNTY_BY_FIPS.has(value));
const channelSelection = z.enum(["push", "email", "both"]);
const statuses = z.enum(["none", "ban", "restricted", "unknown"]);
const sendInput = { fips, runId: z.uuid() };
const notices = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test-push"), ...sendInput, device: z.uuid().optional() }),
  z.object({ action: z.literal("test-email"), ...sendInput, sandbox: z.enum(RESEND_TEST_ADDRESSES).optional() }),
  z.object({ action: z.literal("simulate"), ...sendInput, from: statuses, to: statuses }),
  z.object({ action: z.literal("preview"), fips, channels: channelSelection, offset: z.int().min(0).max(1_000_000) }),
  z.object({
    action: z.literal("broadcast"), ...sendInput, channels: channelSelection, confirmation: z.string().max(100),
    preview: z.object({ at: z.int().positive(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }),
  }),
]);

const browser = z.object({
  fips,
  canary: z.boolean(),
  subscription: z.object({
    endpoint: z.string().startsWith("https://").max(1000),
    keys: z.object({ p256dh: z.string().regex(/^[\w-]{87}=?$/), auth: z.string().regex(/^[\w-]{22}(==)?$/) }),
  }),
});
const emailTest = z.object({ email: z.email().max(254), enabled: z.boolean() });
const pause = z.object({ paused: z.boolean() });

async function status(env: Env) {
  type Counts = { total: number; test: number; confirmed?: number; canary?: number };
  const [push, email, paused, outbox] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_test = 1) AS test,
      COUNT(*) FILTER (WHERE is_canary = 1) AS canary FROM push_subscriptions`).first<Counts>(),
    env.DB.prepare(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_test = 1) AS test,
      COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL) AS confirmed FROM email_subscriptions
      WHERE unsubscribed_at IS NULL`).first<Counts>(),
    alertsPaused(env),
    outboxStatus(env.DB),
  ]);
  const providers = providerStatus(env);
  return {
    providers, counts: { push, email }, outbox: outbox.results, paused, limit: MANUAL_LIMIT,
    vapidPublicKey: providers.push ? env.VAPID_PUBLIC_KEY : null,
    canary: { enabled: env.PUSH_CANARY_ENABLED === "true", fips: env.PUSH_CANARY_FIPS ?? null },
  };
}

async function devices(env: Env, url: URL) {
  const county = fips.parse(url.searchParams.get("fips"));
  const offset = z.coerce.number().int().min(0).max(1_000_000).parse(url.searchParams.get("offset") ?? 0);
  const { results } = await env.DB.prepare(
    `SELECT ops_id, endpoint, is_canary FROM push_subscriptions
     WHERE is_test = 1 AND ops_id IS NOT NULL AND ? IN (SELECT value FROM json_each(fips_json))
     ORDER BY created, ops_id LIMIT 51 OFFSET ?`,
  ).bind(county, offset).all<{ ops_id: string; endpoint: string; is_canary: number }>();
  return {
    devices: results.slice(0, 50).map((row) => ({
      id: row.ops_id, label: maskPush(row.endpoint), canary: Boolean(row.is_canary),
    })),
    nextOffset: results.length > 50 ? offset + 50 : null,
  };
}

async function deliveryLog(env: Env, url: URL) {
  const before = z.coerce.number().int().positive().parse(url.searchParams.get("before") ?? Number.MAX_SAFE_INTEGER);
  const [rows, recentRuns] = await env.DB.batch<{ id: number | string }>(
    [
      env.DB.prepare(`SELECT l.id, l.run_id, l.at, l.channel, l.audience, l.mode, l.fips,
        l.target_masked, l.result, l.provider_id, l.error, r.origin
        FROM notification_delivery_log l LEFT JOIN notification_runs r ON r.id = l.run_id
        WHERE l.id < ? ORDER BY l.id DESC LIMIT 51`).bind(before),
      env.DB.prepare(`SELECT id, origin, audience, fips FROM notification_runs
        WHERE completed_at IS NULL AND at > ? ORDER BY at DESC LIMIT 10`).bind(Date.now() - 24 * 60 * 60_000),
    ],
  );
  return {
    rows: rows.results.slice(0, 50),
    nextBefore: rows.results.length > 50 ? rows.results[49].id : null,
    openRuns: recentRuns.results,
  };
}

async function sendNotice(env: Env, action: z.infer<typeof notices>) {
  const { fips } = action;
  if (action.action === "test-push") {
    return notify(env, {
      mode: "send", origin: "test", runId: action.runId, channels: ["push"],
      audience: action.device ? { kind: "push-devices", ids: [action.device] } : { kind: "test" },
      notices: [testNotice(fips, "test")],
    });
  }
  if (action.action === "test-email") {
    return notify(env, {
      mode: "send", origin: "test", runId: action.runId, channels: ["email"],
      audience: action.sandbox ? { kind: "sandbox", address: action.sandbox } : { kind: "test" },
      notices: [testNotice(fips, "test")],
    });
  }
  if (action.action === "simulate") {
    if (action.from === action.to) throw new NotificationError("Choose two different statuses.", 400);
    return notify(env, {
      mode: "send", origin: "test", runId: action.runId, channels: CHANNELS, audience: { kind: "test" },
      notices: [testNotice(fips, "test", {
        fips, oldStatus: action.from, newStatus: action.to, at: new Date().toISOString(),
      })],
    });
  }

  const county = COUNTY_BY_FIPS.get(fips);
  const current = county ? statusFor(await snapshotReader(env, { fresh: true, initialize: false })
    .state(county.state, { weather: false }), fips) : undefined;
  const bulletin = current && current.status !== "unknown" && !current.sourceCheckFailed && evidenceInEffect(current, Date.now())
    ? countyBulletin(current) : null;
  const audience = { kind: "all" } as const;
  const channels: ReadonlyArray<Channel> = action.channels === "both" ? CHANNELS : [action.channels];
  if (action.action === "preview") {
    const result = await notify(env, {
      mode: "dry-run", audience, channels, offset: action.offset, notices: [bulletin ?? testNotice(fips, "test")],
    });
    return { ...result, county: county?.name, notice: bulletin, sends: bulletin ? result.sends : 0 };
  }

  if (!county || action.confirmation.trim() !== county.name) {
    throw new NotificationError("Type the county name shown in the preview.", 400);
  }
  if (!bulletin) throw new NotificationError("A current, known county status is required for a real broadcast.", 409);
  return notify(env, {
    mode: "send", origin: "broadcast", runId: action.runId, preview: action.preview,
    audience, channels, notices: [bulletin],
  });
}

async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new NotificationError("Use application/json.", 415);
  }
  try {
    return await readJsonBody(request, 8192);
  } catch (error) {
    if (error instanceof RequestBodyError) throw new NotificationError(error.message, error.status);
    throw error;
  }
}

export async function opsApi(request: Request, env: Env, url: URL, action: string): Promise<unknown | undefined> {
  if (request.method === "GET") {
    if (action === "status") return status(env);
    if (action === "devices") return devices(env, url);
    if (action === "pipeline") return pipelineStatus(env, SOURCES);
    if (action === "log") return deliveryLog(env, url);
    return;
  }
  if (request.method !== "POST") return;
  if (action === "replay") {
    const { id } = z.object({ id: z.string().min(1).max(128) }).parse(await readBody(request));
    if (!await replayDeadLetter(env, id)) throw new NotificationError("No pending dead letter with that ID.", 404);
    return { replayed: true };
  }
  if (action === "notice") return sendNotice(env, notices.parse(await readBody(request)));
  if (action === "pause") {
    const { paused } = pause.parse(await readBody(request));
    await setAlertsPaused(env, paused);
    return { paused: await alertsPaused(env) };
  }
  if (action === "test-device") {
    const { fips, canary, subscription } = browser.parse(await readBody(request));
    if (canary && fips !== env.PUSH_CANARY_FIPS) {
      throw new NotificationError("Use the configured canary county to opt in.", 400);
    }
    const result = await subscribePush(env, { subscription, fips: [fips] }, { canary });
    if (!result.ok) throw new NotificationError(result.error ?? "Could not register the browser.", 400);
    return { ok: true };
  }
  if (action === "test-email") {
    const { enabled, email } = emailTest.parse(await readBody(request));
    const { meta } = await env.DB.prepare(`UPDATE email_subscriptions SET is_test = ?
      WHERE email = ? AND confirmed_at IS NOT NULL AND unsubscribed_at IS NULL`)
      .bind(Number(enabled), email.toLowerCase()).run();
    if (!meta.changes) throw new NotificationError("No active, confirmed subscription matches this email.", 404);
    return { updated: meta.changes };
  }
}
