// @ts-nocheck -- matches the existing Bun tests, which run without Bun types in the Worker tsconfig.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { confirmEmail, subscribeEmail, unsubscribeEmail } from "./email";
import { SNAPSHOT_KEY } from "./env";
import { ALERTS_PAUSED_KEY, setAlertsPaused } from "./notification-controls";
import { testNotice, transitionNotice } from "./notification-message";
import { drainOutbox, enqueueNotices } from "./notification-outbox";
import { notify, runCanary } from "./notify";
import { handleOps, validToken } from "./ops";
import { sendPush, subscribePush, unsubscribePush } from "./push";
import { refresh } from "./snapshot";

const FIPS = "40143";
const OTHER = "40001";
const SECRET = "synthetic_test_only_ops_key_0123456789";
const ORIGIN = "https://example.test";
const TEST_PUSH_ID = crypto.randomUUID();
const PUBLIC_PUSH_ID = crypto.randomUUID();
const at = new Date().toISOString();
const testMessage = testNotice(FIPS, "test");
const county = {
  fips: FIPS, county: "Tulsa County", state: "OK", status: "ban", label: "County Burn Ban", checked: at,
  since: null, expires: null, sourceUpdated: null, sourceName: "OFS", sourceUrl: ORIGIN, officialUrl: ORIGIN,
};
const liveMessage = transitionNotice({ fips: FIPS, oldStatus: "none", newStatus: "ban", at }, county);
const confirmed = "2026-11-23T00:00:00.000Z";
const initialFetch = globalThis.fetch;

const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const receiver = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const publicKey = async (key) => Buffer.from(await crypto.subtle.exportKey("raw", key)).toString("base64url");
const receiverKey = await publicKey(receiver.publicKey);
const authSecret = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");

const migrations = ["0001_init.sql", "0002_notification_ops.sql", "0003_source_refresh.sql", "0004_state_snapshots.sql", "0005_notification_outbox.sql", "0006_pipeline_monitor.sql", "0007_email_confirmation.sql"].map((file) =>
  readFileSync(new URL("../../migrations/" + file, import.meta.url), "utf8"));
let sqlite: Database;
let kv: Map<string, string>;
let env;
let requests;
let pushResponse: number;

function d1(db: Database) {
  function statement(query: string, bindings = []) {
    const sql = db.query(query);
    return {
      bind: (...values) => statement(query, values),
      all: async () => ({ results: sql.all(...bindings) }),
      first: async (column) => {
        const row = sql.get(...bindings);
        return column ? row?.[column] ?? null : row;
      },
      execute: () => /RETURNING/i.test(query) ? { results: sql.all(...bindings) } : { meta: { changes: sql.run(...bindings).changes }, results: [] },
      run: async () => ({ meta: { changes: sql.run(...bindings).changes } }),
    };
  }
  return {
    prepare: statement,
    batch: async (statements) => db.transaction(() => statements.map((stmt) => stmt.execute()))(),
  };
}

function addPush(label, { fips = [FIPS], test = false, canary = false, id = crypto.randomUUID() } = {}) {
  const endpoint = `https://fcm.googleapis.com/fcm/send/${label}`;
  sqlite.query(`INSERT INTO push_subscriptions (endpoint, p256dh, auth, fips_json, created, is_test, is_canary, ops_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(endpoint, receiverKey, authSecret, JSON.stringify(fips), at, +test, +canary, id);
  return endpoint;
}

function addEmail(label, { fips = [FIPS], test = false, pending = false, unsubscribed = false } = {}) {
  const email = `${label}@example.test`;
  sqlite.query(`INSERT INTO email_subscriptions (id, email, fips_json, token, confirmed_at, created, unsubscribed_at, is_test)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(), email, JSON.stringify(fips), crypto.randomUUID(),
    pending ? null : confirmed, at, unsubscribed ? confirmed : null, +test,
  );
  return email;
}

function ops(action, body, headers = { Origin: ORIGIN }, token = SECRET) {
  const url = new URL(`/ops/${token}/${action}`, ORIGIN);
  const request = new Request(url, body === undefined ? { headers } : {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers },
  });
  return handleOps(request, env, url);
}

beforeEach(async () => {
  sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(migrations.join("\n"));
  kv = new Map();
  env = {
    DB: d1(sqlite),
    KV: {
      get: async (key, options) => {
        const value = kv.get(key) ?? null;
        return value && options?.type === "json" ? JSON.parse(value) : value;
      },
      put: async (key, value) => { kv.set(key, value); },
    },
    SITE_URL: ORIGIN,
    DASH_TOKEN: SECRET,
    VAPID_PUBLIC_KEY: await publicKey(vapid.publicKey),
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey("jwk", vapid.privateKey)).d,
    VAPID_SUBJECT: "mailto:ops@example.test",
    RESEND_API_KEY: "fixture",
    PUSH_CANARY_FIPS: FIPS,
  };
  pushResponse = 201;
  requests = [];
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init.headers);
    requests.push({ url, headers, body: typeof init.body === "string" ? JSON.parse(init.body) : init.body });
    return url === "https://api.resend.com/emails" ? Response.json({ id: "resend-id-123" })
      : new Response(null, { status: pushResponse });
  };
});

afterEach(() => {
  sqlite.close();
  globalThis.fetch = initialFetch;
});

describe("shared notifier", () => {
  test("preview reads the exact real audience and produces no provider calls", async () => {
    addPush("regular-push", { id: PUBLIC_PUSH_ID });
    addPush("testing-push", { test: true, id: TEST_PUSH_ID });
    addPush("other-push", { test: true, fips: [OTHER] });
    addEmail("regular");
    addEmail("tester", { test: true });
    addEmail("wrong-county", { fips: [OTHER] });
    addEmail("unconfirmed", { test: true, pending: true });
    addEmail("unsubscribed", { test: true, unsubscribed: true });

    const preview = await notify(env, {
      mode: "dry-run", audience: { kind: "all" }, channels: ["push", "email"], notices: [liveMessage], offset: 0,
    });
    expect(preview.sends).toBe(4);
    expect(preview.channels.map((c) => c.eligible)).toEqual([2, 2]);
    expect(preview.channels.flatMap((c) => c.targets)).toHaveLength(4);
    expect(JSON.stringify(preview)).not.toContain("tester@example.test");
    expect(JSON.stringify(preview)).not.toContain("/topic/");
    expect(requests).toEqual([]);
    expect(sqlite.query("SELECT result FROM notification_delivery_log").all()).toEqual([
      { result: "preview" }, { result: "preview" },
    ]);
    expect(sqlite.query("SELECT COUNT(*) AS n FROM notification_runs").get().n).toBe(0);
  });

  test("pages through a large county while keeping an exact eligible total", async () => {
    for (let index = 0; index < 23; index++) addEmail("recipient" + index);
    const draft = { mode: "dry-run", audience: { kind: "all" }, channels: ["email"], notices: [liveMessage] };
    const first = await notify(env, { ...draft, offset: 0 });
    const next = await notify(env, { ...draft, offset: first.nextOffset });
    expect(first.channels[0].eligible).toBe(23);
    expect(first.channels[0].targets).toHaveLength(20);
    expect(first.preview).toBeNull();
    expect(next.channels[0].eligible).toBe(23);
    expect(next.channels[0].targets).toHaveLength(3);
    expect(next.nextOffset).toBeNull();
  });

  test("test and explicit audiences enforce flags, county, channel, and confirmation", async () => {
    const regular = addPush("regular", { id: PUBLIC_PUSH_ID });
    const tester = addPush("tester", { id: TEST_PUSH_ID, test: true });
    addPush("wrong-fips", { test: true, fips: [OTHER] });
    const email = addEmail("tester", { test: true });
    addEmail("regular");
    addEmail("pending", { test: true, pending: true });
    addEmail("unsubscribed", { test: true, unsubscribed: true });
    const result = await notify(env, {
      mode: "send", origin: "test", runId: crypto.randomUUID(), audience: { kind: "test" },
      channels: ["push", "email"], notices: [testMessage],
    });
    expect(result).toMatchObject({ accepted: 2, error: 0 });
    expect(requests).toHaveLength(2);
    const pushRequest = requests.find((r) => r.url === tester);
    const emailRequest = requests.find((r) => r.url === "https://api.resend.com/emails");
    expect(pushRequest.headers.get("ttl")).toBe("21600");
    expect(pushRequest.headers.get("urgency")).toBe("high");
    expect(pushRequest.headers.get("topic")).toBe("test-40143");
    expect(emailRequest.body).toMatchObject({ to: [email], subject: "Test burn ban notification" });
    expect(emailRequest.body.text).toContain("/api/v1/email/unsubscribe?token=");
    expect(emailRequest.headers.get("idempotency-key")).toMatch(/^alerts\//);
    const addressed = await notify(env, {
      mode: "send", origin: "test", runId: crypto.randomUUID(),
      audience: { kind: "push-devices", ids: [TEST_PUSH_ID, PUBLIC_PUSH_ID] }, channels: ["push"], notices: [testMessage],
    });
    expect(addressed.accepted).toBe(1);
    expect(requests[2].url).toBe(tester);
    expect(requests.map((r) => r.url)).not.toContain(regular);
    expect(sqlite.query("SELECT provider_id FROM notification_delivery_log WHERE channel = 'email'").get().provider_id)
      .toBe("resend-id-123");
  });

  test("simulation cannot escape the test allowlist", async () => {
    await expect(notify(env, {
      mode: "send", origin: "test", runId: crypto.randomUUID(), audience: { kind: "all" }, channels: ["email"], notices: [testMessage],
    })).rejects.toThrow("cannot be sent together");
    expect(requests).toEqual([]);
  });

  test("the D1 stop blocks outbound sends even before KV has propagated", async () => {
    addEmail("fixture");
    await setAlertsPaused(env, true);
    expect(kv.get(ALERTS_PAUSED_KEY)).toBe("1");
    kv.delete(ALERTS_PAUSED_KEY);
    await enqueueNotices(env, "paused-cron", [liveMessage], ["email"]);
    expect(await drainOutbox(env)).toBe(false);
    expect(sqlite.query("SELECT status FROM notification_outbox").get().status).toBe("pending");
    expect(requests).toEqual([]);
    await setAlertsPaused(env, false);
    kv.set(ALERTS_PAUSED_KEY, "1");
    expect(await drainOutbox(env)).toBe(false);
    expect(requests).toEqual([]);
  });

  test("cron writes actual status changes while the global stop suppresses delivery", async () => {
    addEmail("fixture");
    await setAlertsPaused(env, true);
    kv.set(SNAPSHOT_KEY, JSON.stringify({
      counties: { [FIPS]: { ...county, status: "none" } }, sources: [], changed: {},
    }));
    const snapshot = await refresh(env, [{
      id: "ok", state: "OK", mode: "full", sourceName: "OFS", sourceUrl: ORIGIN, officialUrl: ORIGIN,
      fetch: async () => [{ ...county }],
    }], 123);
    expect(snapshot.counties[FIPS].status).toBe("ban");
    expect(sqlite.query("SELECT old_status, new_status FROM transitions").get()).toEqual({ old_status: "none", new_status: "ban" });
    expect(sqlite.query("SELECT DISTINCT status FROM notification_outbox").all()).toEqual([{ status: "pending" }]);
    expect(requests).toEqual([]);
  });

  test("the hourly delivery sends normal pushes per county and combines email for multiple counties", async () => {
    const other = { ...county, fips: OTHER, county: "Adair County", status: "restricted", label: "Restricted burns" };
    kv.set(SNAPSHOT_KEY, JSON.stringify({
      counties: { [FIPS]: { ...county, status: "none" }, [OTHER]: { ...other, status: "none" } },
      sources: [], changed: {},
    }));
    const endpoint = addPush("ordinary", { fips: [FIPS, OTHER] });
    const email = addEmail("ordinary", { fips: [FIPS, OTHER] });
    addEmail("pending", { pending: true });
    await refresh(env, [{
      id: "ok", state: "OK", mode: "full", sourceName: "OFS", sourceUrl: ORIGIN, officialUrl: ORIGIN,
      fetch: async () => [{ ...county }, { ...other }],
    }], 456);
    const topics = requests.filter((r) => r.url === endpoint).map((r) => r.headers.get("topic"));
    expect(new Set(topics).size).toBe(2);
    expect(topics.every((topic) => /^alert-\d+$/.test(topic))).toBe(true);
    const messages = requests.filter((r) => r.url === "https://api.resend.com/emails");
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toMatchObject({ to: [email], subject: "Burn ban changes in 2 counties" });
    expect(messages[0].body.text).toContain("Burning restricted: Adair County");
    expect(sqlite.query("SELECT channel, count(*) AS n FROM notification_delivery_log GROUP BY channel ORDER BY channel").all())
      .toEqual([{ channel: "email", n: 1 }, { channel: "push", n: 2 }]);
  });

  test.each([404, 410])("a %i is logged and the gone subscription is deleted", async (status) => {
    const endpoint = addPush("old-endpoint", { test: true });
    pushResponse = status;
    const result = await notify(env, {
      mode: "send", origin: "test", runId: crypto.randomUUID(), audience: { kind: "test" }, channels: ["push"], notices: [testMessage],
    });
    expect(result.gone).toBe(1);
    expect(sqlite.query("SELECT endpoint FROM push_subscriptions").all()).toEqual([]);
    expect(sqlite.query("SELECT error, target_masked FROM notification_delivery_log").get()).toEqual({
      error: `Push HTTP ${status}`, target_masked: "fcm.googleapis.com · …oint",
    });
    expect(requests[0].url).toBe(endpoint);
  });

  test("a pause that lands during a send stops the next group", async () => {
    for (let index = 0; index < 5; index++) addEmail("batch" + index, { test: true });
    const provider = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (!requests.length) await setAlertsPaused(env, true);
      return provider(url, init);
    };
    const result = await notify(env, {
      mode: "send", origin: "test", runId: crypto.randomUUID(), audience: { kind: "test" }, channels: ["email"], notices: [testMessage],
    });
    expect(result).toMatchObject({ accepted: 4, skipped: 1 });
    expect(requests).toHaveLength(4);
  });

  test("a pending resume cannot reverse a newer pause", async () => {
    await setAlertsPaused(env, true);
    let finishResume;
    let resumeStarted;
    const started = new Promise((resolve) => { resumeStarted = resolve; });
    const put = env.KV.put;
    env.KV.put = async (key, value) => {
      if (key === ALERTS_PAUSED_KEY && value === "0") {
        await new Promise((resolve) => {
          finishResume = resolve;
          resumeStarted();
        });
      }
      await put(key, value);
    };
    const resuming = setAlertsPaused(env, false);
    await started;
    await setAlertsPaused(env, true);
    finishResume();
    await resuming;

    expect(sqlite.query("SELECT paused FROM notification_settings").get().paused).toBe(1);
  });

  test("canary is off by default, targets opt-in devices, and submits once per UTC day", async () => {
    addPush("normal-test", { test: true });
    const canary = addPush("canary-test", { test: true, canary: true });
    addPush("other-county", { fips: [OTHER], test: true, canary: true });
    const scheduled = Date.parse("2026-11-23T17:17:00Z");
    await runCanary(env, scheduled);
    expect(requests).toEqual([]);
    env.PUSH_CANARY_ENABLED = "true";
    await runCanary(env, scheduled);
    await runCanary(env, scheduled);
    expect(requests.map((r) => r.url)).toEqual([canary]);
    expect(requests[0].headers.get("topic")).toBe("canary-40143");
  });
});

test("the cron outbox resumes an interrupted batch without resending completed recipients", async () => {
  for (let index = 0; index < 6; index++) addEmail("outbox" + index);
  await enqueueNotices(env, "durable-run", [liveMessage], ["email"], 1_000);
  await enqueueNotices(env, "durable-run", [liveMessage], ["email"], 1_000);
  expect(sqlite.query("SELECT count(*) AS n FROM notification_outbox").get().n).toBe(6);
  expect(requests).toHaveLength(0);

  await drainOutbox(env, 1_000);
  expect(requests).toHaveLength(4);
  await drainOutbox(env, 1_001);
  expect(requests).toHaveLength(6);
  expect(new Set(requests.map((r) => r.headers.get("idempotency-key"))).size).toBe(6);
  expect(sqlite.query("SELECT completed_at FROM notification_runs WHERE id = 'durable-run'").get().completed_at).not.toBeNull();
});

test("transient failures keep their idempotency key and opted-out recipients are skipped", async () => {
  const email = addEmail("retry");
  const provider = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    await provider(url, init);
    return new Response(null, { status: 503 });
  };
  await enqueueNotices(env, "retry-run", [liveMessage], ["email"], 1_000);
  await drainOutbox(env, 1_000);
  expect(requests).toHaveLength(1);
  expect(sqlite.query("SELECT status, attempts FROM notification_outbox").get()).toEqual({ status: "pending", attempts: 1 });
  await drainOutbox(env, 1_001);
  expect(requests).toHaveLength(1);
  globalThis.fetch = provider;
  await drainOutbox(env, 3_601_000);
  expect(requests).toHaveLength(2);
  expect(requests[0].headers.get("idempotency-key")).toBe(requests[1].headers.get("idempotency-key"));

  await enqueueNotices(env, "opt-out-run", [liveMessage], ["email"], 3_601_000);
  sqlite.query("UPDATE email_subscriptions SET unsubscribed_at = ? WHERE email = ?").run(at, email);
  await drainOutbox(env, 3_601_000);
  expect(requests).toHaveLength(2);
  expect(sqlite.query("SELECT status FROM notification_outbox WHERE run_id = 'opt-out-run'").get().status).toBe("skipped");
});

test("a worker interrupted after provider acceptance retries with the same email key and push topic", async () => {
  const endpoint = addPush("lost-receipt");
  addEmail("lost-receipt");
  await enqueueNotices(env, "lost-receipt", [liveMessage], ["email", "push"], 1_000);
  const batch = env.DB.batch;
  env.DB.batch = async () => { throw new Error("write interrupted"); };
  await expect(drainOutbox(env, 1_000)).rejects.toThrow("write interrupted");
  expect(requests).toHaveLength(2);

  env.DB.batch = batch;
  expect(await drainOutbox(env, 2_000)).toBe(false);
  await drainOutbox(env, 121_000);
  const keys = requests.filter((r) => r.url !== endpoint).map((r) => r.headers.get("idempotency-key"));
  const topics = requests.filter((r) => r.url === endpoint).map((r) => r.headers.get("topic"));
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(1);
  expect(topics).toHaveLength(2);
  expect(new Set(topics).size).toBe(1);
});

test("concurrent equivalent email signups coalesce, throttle other selections and rotate expired tokens", async () => {
  const signup = { email: " Resident@Example.test ", fips: [FIPS, OTHER] };
  const now = Date.parse(at);
  await Promise.all([
    subscribeEmail(env, signup, now),
    subscribeEmail(env, { email: "resident@example.test", fips: [OTHER, FIPS] }, now),
  ]);
  await subscribeEmail(env, { ...signup, fips: [FIPS] }, now + 1000);
  expect(requests).toHaveLength(1);
  const first = sqlite.query("SELECT * FROM email_subscriptions").all();
  expect(first).toHaveLength(1);
  expect(first[0].email).toBe("resident@example.test");
  expect(first[0].confirmed_at).toBeNull();
  expect(await confirmEmail(env, first[0].token, now + 24 * 3_600_000)).toBe(false);
  await subscribeEmail(env, signup, now + 24 * 3_600_000);
  expect(requests).toHaveLength(2);
  const renewed = sqlite.query("SELECT * FROM email_subscriptions").get();
  expect(renewed.id).toBe(first[0].id);
  expect(renewed.token).not.toBe(first[0].token);
  expect(await confirmEmail(env, renewed.token, now + 24 * 3_600_000 + 1)).toBe(true);
  await subscribeEmail(env, signup, now + 25 * 3_600_000);
  expect(requests).toHaveLength(2);
  expect(await unsubscribeEmail(env, renewed.token)).toBe(true);
});

test("legacy duplicate email rows keep a working opt-out link", async () => {
  const legacy = new Database(":memory:");
  try {
    legacy.exec(migrations.slice(0, -1).join("\n"));
    const insert = legacy.query(`INSERT INTO email_subscriptions (id, email, fips_json, token, confirmed_at, created)
      VALUES (?, ?, ?, ?, ?, ?)`);
    insert.run("first", "sam@example.test", JSON.stringify([OTHER, FIPS]), "first-token", at, "2026-11-24T00:00:00Z");
    insert.run("duplicate", "Sam@example.test", JSON.stringify([FIPS, OTHER]), "old-token", at, "2026-11-23T00:00:00Z");
    legacy.exec(migrations.at(-1));
    expect(legacy.query("SELECT id FROM email_subscriptions WHERE unsubscribed_at IS NULL").all()).toEqual([{ id: "first" }]);
    expect(await unsubscribeEmail({ DB: d1(legacy) }, "old-token")).toBe(true);
    expect(legacy.query("SELECT id FROM email_subscriptions WHERE unsubscribed_at IS NULL").all()).toEqual([]);
  } finally {
    legacy.close();
  }
});

test("push enrollment and delivery enforce the provider boundary and subscription credentials", async () => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/managed";
  const subscription = { endpoint, keys: { p256dh: receiverKey, auth: authSecret } };
  const input = { subscription, fips: [FIPS] };
  expect((await subscribePush(env, { ...input, subscription: { ...subscription, endpoint: "https://unrelated.example/managed" } })).ok).toBe(false);
  expect((await subscribePush(env, { ...input, subscription: { ...subscription, keys: { ...subscription.keys, p256dh: "invalid" } } })).ok).toBe(false);
  expect((await subscribePush(env, input)).ok).toBe(true);
  const wrongSecret = Buffer.alloc(16).toString("base64url");
  expect((await subscribePush(env, { ...input, fips: [OTHER], subscription: { ...subscription, keys: { ...subscription.keys, auth: wrongSecret } } })).ok).toBe(false);
  await unsubscribePush(env, { endpoint, auth: wrongSecret });
  expect(sqlite.query("SELECT fips_json FROM push_subscriptions").get().fips_json).toBe(JSON.stringify([FIPS]));
  await unsubscribePush(env, { endpoint, auth: authSecret });
  expect(sqlite.query("SELECT endpoint FROM push_subscriptions").all()).toEqual([]);

  expect((await sendPush(env, { ...subscription.keys, endpoint: "https://unrelated.example/managed" }, liveMessage)).result).toBe("gone");
  expect(requests).toHaveLength(0);
});

describe("dashboard boundary", () => {
  test("the page is hidden, uses private response headers, and rejects cross-origin or missing Origin", async () => {
    expect(validToken(SECRET, SECRET)).toBe(true);
    expect(validToken(SECRET.replace("9", "8"), SECRET)).toBe(false);
    expect(validToken(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(validToken(SECRET, undefined)).toBe(false);
    const unknown = await ops("", undefined, {}, "x".repeat(SECRET.length));
    const valid = await ops("");
    expect(unknown.status).toBe(404);
    expect(valid.status).toBe(200);
    expect(await valid.text()).toContain("Notification operations");
    for (const res of [unknown, valid]) {
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    }
    const crossOrigin = await ops("api/pause", { paused: true }, { Origin: "https://attacker.example" });
    const missingOrigin = await ops("api/pause", { paused: true }, {});
    const sameSiteSibling = await ops("api/pause", { paused: true }, { Origin: ORIGIN, "Sec-Fetch-Site": "same-site" });
    expect([crossOrigin.status, missingOrigin.status, sameSiteSibling.status]).toEqual([404, 404, 404]);
    expect(kv.has(ALERTS_PAUSED_KEY)).toBe(false);
    expect((await ops("api/pause", { paused: true })).status).toBe(200);
    expect(kv.get(ALERTS_PAUSED_KEY)).toBe("1");
  });

  test("only the privileged route can mark a browser as test and it preserves its existing counties", async () => {
    const subscription = {
      endpoint: "https://fcm.googleapis.com/existing-device", keys: { p256dh: receiverKey, auth: authSecret },
    };
    await subscribePush(env, { subscription, fips: [OTHER], is_test: 1, is_canary: 1 });
    expect(sqlite.query("SELECT is_test FROM push_subscriptions").get().is_test).toBe(0);
    const response = await ops("api/test-device", { subscription, fips: FIPS, canary: true });
    expect(response.status).toBe(200);
    const row = sqlite.query("SELECT fips_json, is_test, is_canary FROM push_subscriptions").get();
    expect(row).toEqual({ fips_json: JSON.stringify([OTHER, FIPS]), is_test: 1, is_canary: 1 });
    const registered = await ops("api/devices?fips=" + FIPS);
    expect((await registered.json()).devices).toHaveLength(1);
  });

  test("the dashboard marks only confirmed email and a simulation stays in its test cohort", async () => {
    const confirmedEmail = addEmail("confirmed");
    const publicEmail = addEmail("public");
    const pendingEmail = addEmail("waiting", { pending: true });
    expect((await ops("api/test-email", { enabled: true, email: pendingEmail })).status).toBe(404);
    expect((await ops("api/test-email", { enabled: true, email: confirmedEmail })).status).toBe(200);

    const response = await ops("api/notice", {
      action: "simulate", fips: FIPS, from: "none", to: "ban", runId: crypto.randomUUID(), audience: "all",
    });
    expect((await response.json()).accepted).toBe(1);
    expect(requests.map((r) => r.body.to[0])).toEqual([confirmedEmail]);
    expect(requests[0].body.subject).toContain("Test: Burn ban: Tulsa County");
    expect(sqlite.query("SELECT * FROM transitions").all()).toEqual([]);
    expect(kv.has(SNAPSHOT_KEY)).toBe(false);
    expect(sqlite.query("SELECT is_test FROM email_subscriptions WHERE email = ?").get(publicEmail).is_test).toBe(0);
  });

  test("sandbox choices use the same email transport while arbitrary addresses are rejected", async () => {
    const input = { action: "test-email", fips: FIPS, runId: crypto.randomUUID() };
    expect((await ops("api/notice", { ...input, sandbox: "arbitrary@example.test" })).status).toBe(400);
    const response = await ops("api/notice", { ...input, sandbox: "bounced@resend.dev" });
    expect((await response.json()).accepted).toBe(1);
    expect(requests).toHaveLength(1);
    expect(requests[0].body.to).toEqual(["bounced@resend.dev"]);
    expect(requests[0].body.text).not.toContain("unsubscribe?token=");
  });

  test("real broadcast requires county confirmation and rechecks the preview before a single rate-capped send", async () => {
    kv.set(SNAPSHOT_KEY, JSON.stringify({ counties: { [FIPS]: county }, sources: [], changed: {} }));
    const firstEmail = addEmail("first");
    const fields = { fips: FIPS, channels: "email" };
    const prepare = async () => (await ops("api/notice", { ...fields, action: "preview", offset: 0 })).json();
    const first = await prepare();
    expect(first.sends).toBe(1);
    const secondEmail = addEmail("second");
    const runId = crypto.randomUUID();
    const base = { ...fields, action: "broadcast", preview: first.preview, runId };
    expect((await ops("api/notice", { ...base, confirmation: "Wrong County" })).status).toBe(400);
    expect((await ops("api/notice", { ...base, confirmation: "Tulsa County" })).status).toBe(409);
    expect(requests).toHaveLength(0);
    const next = await prepare();
    const request = { ...base, confirmation: "Tulsa County", preview: next.preview };
    const [one, two] = await Promise.all([ops("api/notice", request), ops("api/notice", request)]);
    const statuses = [(await one.json()).status, (await two.json()).status];
    expect(statuses.sort()).toEqual(["duplicate", "finished"]);
    const limited = await ops("api/notice", { ...request, runId: crypto.randomUUID() });
    expect((await limited.json()).status).toBe("rate-limited");
    expect(requests.map((r) => r.body.to[0]).sort()).toEqual([firstEmail, secondEmail]);
  });
});
