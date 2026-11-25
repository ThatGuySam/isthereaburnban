import { createHmac } from "node:crypto";
import { COUNTY_BY_FIPS } from "./counties";
import { emailConfigured, type Env } from "./env";
import { maskTarget, planAudience, type Audience, type AudienceWindow, type Channel, type Delivery } from "./notification-audience";
import { alertsPaused, MANUAL_LIMIT } from "./notification-controls";
import { drainOperatorRun, stageOperatorRun } from "./notification-outbox";
import { testNotice, type Notice } from "./notification-message";
import { pushVapid } from "./push";

const PAGE_SIZE = 20;
const PREVIEW_MS = 5 * 60_000;

type Dispatch = {
  audience: Audience;
  channels: ReadonlyArray<Channel>;
  notices: Notice[];
};

type Send = Dispatch & {
  mode: "send";
  runId: string;
} & (
  | { origin: "test" | "canary" }
  | { origin: "broadcast"; preview: { at: number; fingerprint: string } }
);

type DryRun = Dispatch & { mode: "dry-run"; offset: number };
type LogRow = {
  channel: Channel; fips: string; result: string; error?: string;
};

export class NotificationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function providerStatus(env: Env): Record<Channel, boolean> {
  return { push: Boolean(pushVapid(env)), email: emailConfigured(env) };
}

async function plan(env: Env, req: Dispatch, window?: AudienceWindow) {
  const configured = providerStatus(env);
  return Promise.all(req.channels.map(async (channel) => {
    const audience = await planAudience(env, channel, req.audience, req.notices, window);
    return { channel, configured: configured[channel], ...audience };
  }));
}

function fingerprint(env: Env, deliveries: Delivery[], dispatch: Dispatch, at: number): string {
  const targets = deliveries.map((delivery) => delivery.channel === "push"
    ? ["push", delivery.target.endpoint, delivery.target.auth, delivery.target.p256dh]
    : ["email", delivery.target.id, delivery.target.email, delivery.target.token]);
  return createHmac("sha256", env.DASH_TOKEN ?? "").update(JSON.stringify({
    at, targets, channels: dispatch.channels, notices: dispatch.notices, site: env.SITE_URL, from: env.EMAIL_FROM, pushPublicKey: env.VAPID_PUBLIC_KEY,
  })).digest("hex");
}

async function writeLog(
  env: Env, runId: string, req: Dispatch, mode: "dry-run" | "send", rows: LogRow[],
) {
  if (!rows.length) return;
  const stmt = env.DB.prepare(
    `INSERT INTO notification_delivery_log
       (run_id, at, channel, audience, mode, fips, result, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const at = new Date().toISOString();
  await env.DB.batch(rows.map((row) => stmt.bind(
    runId, at, row.channel, req.audience.kind, mode, row.fips, row.result, row.error ?? null,
  )));
}

function fipsList(notices: Notice[]): string {
  return notices.map((n) => n.fips).join(",");
}

async function preview(env: Env, req: DryRun) {
  const [plans, paused] = await Promise.all([
    plan(env, req, { limit: PAGE_SIZE, offset: req.offset }), alertsPaused(env),
  ]);
  const available = plans.filter((p) => p.configured);
  const sends = available.reduce((sum, p) => sum + p.subscriptions, 0);
  const at = Date.now();
  const confirmedPreview = req.offset === 0 && sends > 0 && sends <= MANUAL_LIMIT && !paused &&
    req.audience.kind === "all" && req.notices.every((n) => n.kind === "live")
    ? { at, fingerprint: fingerprint(env, available.flatMap((p) => p.deliveries), req, at) }
    : null;
  if (!req.offset) {
    await writeLog(env, crypto.randomUUID(), req, "dry-run", plans.map((p) => ({
      channel: p.channel, fips: fipsList(req.notices), result: "preview",
      error: `${p.subscriptions} eligible; ${p.configured && !paused ? p.subscriptions : 0} sendable`,
    })));
  }
  return {
    paused, sends: paused ? 0 : sends, limit: MANUAL_LIMIT,
    channels: plans.map((p) => ({
      channel: p.channel, configured: p.configured, eligible: p.subscriptions,
      targets: p.deliveries.map(maskTarget),
    })),
    nextOffset: plans.some((p) => p.subscriptions > req.offset + PAGE_SIZE) ? req.offset + PAGE_SIZE : null,
    preview: confirmedPreview,
  };
}

function validateSend(req: Send) {
  const live = req.origin === "broadcast";
  const isValid = live ? req.audience.kind === "all" && req.notices.every((n) => n.kind === "live")
    : req.origin === "canary" ? req.audience.kind === "canary" && req.notices.every((n) => n.kind === "canary")
    : ["test", "push-devices", "sandbox"].includes(req.audience.kind) && req.notices.every((n) => n.kind === "test");
  if (!isValid) throw new NotificationError("This notice and audience cannot be sent together.", 400);
}

async function send(env: Env, req: Send) {
  validateSend(req);
  const counts = { accepted: 0, gone: 0, error: 0, skipped: 0, pending: 0 };
  const configured = providerStatus(env);
  const channels = req.channels.filter((channel) => configured[channel]);
  if (!channels.length) {
    if (req.origin !== "canary") throw new NotificationError("No selected provider is configured.", 503);
  }
  if (!req.notices.length) return { ...counts, status: "empty" };

  const describe = (result: string, error?: string): LogRow[] => req.channels.map((channel) => ({
    channel, fips: fipsList(req.notices), result, error,
  }));
  if (await alertsPaused(env)) {
    await writeLog(env, req.runId, req, "send", describe("paused"));
    return { ...counts, status: "paused" };
  }

  const plans = await plan(env, { ...req, channels }, { limit: MANUAL_LIMIT + 1, offset: 0 });
  const total = plans.reduce((sum, p) => sum + p.subscriptions, 0);
  const deliveries = plans.flatMap((p) => p.deliveries);
  if (total > MANUAL_LIMIT || deliveries.length > MANUAL_LIMIT) {
    const message = `This send exceeds the ${MANUAL_LIMIT}-delivery limit.`;
    if (req.origin !== "canary") throw new NotificationError(message, 409);
    await writeLog(env, req.runId, req, "send", describe("blocked", message));
    return { ...counts, status: "blocked" };
  }
  if (req.origin === "broadcast") {
    const { preview: expected } = req;
    const age = Date.now() - expected.at;
    if (age < 0 || age > PREVIEW_MS || fingerprint(env, deliveries, { ...req, channels: req.channels }, expected.at) !== expected.fingerprint) {
      throw new NotificationError("The preview expired or its audience or notice changed. Preview again.", 409);
    }
  }
  if (!deliveries.length && req.origin !== "canary") return { ...counts, status: "empty" };

  const claimed = await stageOperatorRun(env.DB, {
    runId: req.runId, origin: req.origin, audience: req.audience.kind, fips: fipsList(req.notices),
  }, deliveries, Date.now());
  if (claimed !== "claimed") return { ...counts, status: claimed };
  if (!deliveries.length) {
    await writeLog(env, req.runId, req, "send", describe(channels.length ? "no audience" : "unconfigured"));
    return { ...counts, status: "empty" };
  }

  const result = await drainOperatorRun(env, req.runId) ?? counts;
  return { ...result, status: result.pending ? "queued" : "finished" };
}

export function notify(env: Env, req: DryRun): ReturnType<typeof preview>;
export function notify(env: Env, req: Send): ReturnType<typeof send>;
export function notify(env: Env, req: DryRun | Send) {
  return req.mode === "dry-run" ? preview(env, req) : send(env, req);
}

export const CANARY_CRON = "17 17 * * *";

export async function runCanary(env: Env, scheduledTime: number): Promise<void> {
  if (env.PUSH_CANARY_ENABLED !== "true") return;
  const fips = env.PUSH_CANARY_FIPS;
  if (!fips || !COUNTY_BY_FIPS.has(fips)) {
    console.error("Push canary has an invalid county FIPS");
    return;
  }
  await notify(env, {
    mode: "send", origin: "canary", runId: `canary-${new Date(scheduledTime).toISOString().slice(0, 10)}`,
    channels: ["push"], audience: { kind: "canary" }, notices: [testNotice(fips, "canary")],
  });
}
