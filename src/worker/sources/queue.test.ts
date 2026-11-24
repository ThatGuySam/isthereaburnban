// @ts-nocheck -- bun test and SQLite types are not installed.
import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { COUNTIES, STATES_DIR } from "../counties";
import { SNAPSHOT_KEY } from "../env";
import { withFireWeather } from "../fire-weather";
import { lookup, statusFor } from "../lookup";
import { snapshotReader } from "../snapshot";
import { ACTIVE_KEY, INDEX_KEY, PRETTY_ACTIVE_KEY, stateKey } from "../snapshot-v2";
import { US_ZONES } from "./lib/dates";
import { mergeSources, STALE_MS } from "./merge";
import { nwsFireWeather, parseNwsAlerts } from "./nws/alerts";
import { MAX_CACHED_STATES } from "./publication";
import { consumeSourceMessage, enqueueSources, isDue } from "./queue";
import { SOURCES } from "./registry";
import { applyChecks, readHeads } from "./state";
import { isActive } from "./types";

const stores = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

function sandbox() {
  const sqlite = new Database(":memory:");
  stores.push(sqlite);
  for (const file of ["0001_init.sql", "0003_source_refresh.sql", "0004_state_snapshots.sql"]) {
    sqlite.exec(readFileSync(new URL(`../../../migrations/${file}`, import.meta.url), "utf8"));
  }
  const keys = new Map();
  const metadata = new Map();
  const gets = [];
  const puts = [];
  const messages = [];
  const continuations = [];
  const alerts = [];
  const prepare = (sql, args = []) => {
    const query = sqlite.query(sql);
    return {
      bind: (...args) => prepare(sql, args),
      execute: () => query.run(...args),
      run: async () => query.run(...args),
      first: async (field) => {
        const result = query.get(...args);
        return field ? result?.[field] ?? null : result;
      },
      all: async () => ({ results: query.all(...args) }),
    };
  };
  const failure = { key: null, finalize: false };
  const env = {
    DB: {
      prepare(sql) {
        if (sql.startsWith("DELETE FROM snapshot_run") && failure.finalize) {
          return { bind: () => ({ run: async () => { throw new Error("D1 interrupted after alert"); } }) };
        }
        return prepare(sql);
      },
      batch: async (statements) => sqlite.transaction(() => statements.map((statement) => statement.execute()))(),
    },
    KV: {
      get: async (key, type) => {
        gets.push(key);
        const read = (key) => {
          const value = keys.get(key);
          return !value ? null : type === "json" || type?.type === "json" ? JSON.parse(value) : value;
        };
        return Array.isArray(key) ? new Map(key.map((key) => [key, read(key)])) : read(key);
      },
      getWithMetadata: async (key) => ({ value: keys.get(key), metadata: metadata.get(key) }),
      put: async (key, value, options) => {
        if (key === failure.key) throw new Error("interrupted KV write");
        puts.push(key);
        keys.set(key, value);
        metadata.set(key, options?.metadata);
      },
    },
    SOURCE_QUEUE: {
      sendBatch: async (batch) => messages.push(...batch),
      send: async (body, options) => {
        if (body.kind === "publish") continuations.push(body);
        else messages.push({ body, ...options });
      },
    },
  };
  const sendNotices = async (_, runId, notices) => {
    if (!alerts.some((alert) => alert.runId === runId)) alerts.push({ runId, notices });
  };
  const catalog = () => JSON.parse(keys.get(INDEX_KEY));
  const snapshot = () => {
    const index = catalog();
    const get = sqlite.query("SELECT snapshot FROM snapshot_state WHERE state = ? AND revision = ?");
    const shards = Object.entries(index.states).map(([state, ref]) => JSON.parse(get.get(state, ref.revision).snapshot));
    return { ...index, counties: Object.assign({}, ...shards.map((shard) => shard.counties)),
      changed: Object.assign({}, ...shards.map((shard) => shard.changed)),
      fireWeather: Object.assign({}, ...shards.map((shard) => shard.fireWeather)) };
  };
  return { env, failure, messages, continuations, alerts, gets, puts, keys, sqlite, sendNotices, catalog, snapshot };
}

const initial = Date.parse("2026-11-23T17:07Z");
const nextHour = initial + 3_600_000;
const row = (status, checked, extra = {}) => ({
  fips: "41039", county: "Lane County", state: "OR", status, label: status, checked,
  since: null, expires: null, sourceUpdated: null,
  sourceName: "Fixture issuer", sourceUrl: "https://www.example.gov/feed",
  officialUrl: "https://www.example.gov/status", ...extra,
});
const source = (id, fetch, extra = {}) => ({
  id, state: "OR", coverage: "live", scope: "county", cadence: { kind: "hourly" }, mode: "full",
  expectedFips: ["41039"], stack: "HTML", sourceName: id, sourceUrl: "https://www.example.gov/feed", officialUrl: "https://www.example.gov/status",
  fetch, ...extra,
});
const run = (box, sources, message, clock = message.slot) =>
  consumeSourceMessage(box.env, message, { sources, now: new Date(clock), sendNotices: box.sendNotices });
const poll = (box, src, slot) => run(box, [src], { kind: "source", id: src.id, slot });
async function drain(box, sources, clock) {
  while (box.continuations.length) await run(box, sources, box.continuations.shift(), clock);
}
const merge = async (box, sources, slot, delay = 120_000) => {
  const result = await run(box, sources, { kind: "merge", slot, due: sources.map(({ id }) => id) }, slot + delay);
  await drain(box, sources, slot + delay);
  return result;
};

test("registry and states.json agree in both directions, and source IDs are unique", () => {
  const active = SOURCES.filter(isActive);
  const live = STATES_DIR.filter(({ coverage }) => coverage === "live").map(({ abbr }) => abbr).sort();
  expect([...new Set(active.filter(({ coverage }) => coverage === "live").map(({ state }) => state))].sort()).toEqual(live);
  expect(new Set(SOURCES.map(({ id }) => id)).size).toBe(SOURCES.length);
  const dailyPolls = active.reduce((total, { cadence }) => total + (cadence.kind === "hourly" ? 24 : cadence.hours.length), 0);
  expect(23 * (MAX_CACHED_STATES + 3) + 51 + 3).toBeLessThan(1000); // one full KV bootstrap and 23 capped publications
  expect((dailyPolls + 24 * (1 + 51 + 4)) * 3).toBeLessThanOrEqual(10000); // enqueue, dequeue, delete
  for (const item of active) {
    if (item.product === "fire-weather") {
      expect(item.state).toBe("US");
      expect(item.mode).toBe("positive-only");
      continue;
    }
    const state = STATES_DIR.find(({ abbr }) => abbr === item.state);
    expect(state?.coverage === "live" || state?.coverage === item.coverage).toBe(true);
    if (item.scope === "part") expect(item.coverage).toBe("restrictions");
  }
});

test("cron posts one message per due source and one delayed merge, including local cadence gates", async () => {
  const box = sandbox();
  const county = source("or", async () => ({ rows: [] }));
  const district = source("or-district", async () => ({ rows: [] }), { cadence: { kind: "daily", zone: US_ZONES.Pacific, hours: [9, 15] } });
  const manual = { ...county, id: "or-pdf", mode: "manual", cadence: null, error: "manual PDF" };
  expect(isDue(district, initial - 10 * 60_000)).toBe(false);
  expect(isDue(district, initial)).toBe(true);
  expect(isDue(district, nextHour, initial)).toBe(false);
  expect(isDue(district, initial + 6 * 3_600_000, initial)).toBe(true);
  await enqueueSources(box.env, initial, { sources: [county, district, manual] });
  expect(box.messages).toEqual([
    { body: { kind: "source", id: "or", slot: initial } },
    { body: { kind: "source", id: "or-district", slot: initial } },
    { body: { kind: "merge", slot: initial, due: ["or", "or-district"] }, delaySeconds: 120 },
  ]);
  expect(await merge(box, [county, district], initial)).toBe("waiting");
  expect(box.puts).toEqual([]);
});

test("queued NWS changes leave ban history alone and preserve a verified midnight cutoff", async () => {
  const box = sandbox();
  const { features } = JSON.parse(readFileSync(new URL("./nws/fixtures/archive-2026-11-18-to-19.json", import.meta.url), "utf8"));
  const warning = features.find(({ properties }) => properties.senderName === "NWS Denver CO" &&
    properties.geocode.SAME.includes("008059") && properties.onset === "2026-11-18T08:00:00-07:00");
  expect(warning).toBeDefined();
  const before = Date.parse("2026-11-18T19:07Z");
  const active = before + 3_600_000;
  const after = Date.parse("2026-11-18T23:07Z");
  const county = source("co-example", async () => ({ rows: [row("none", new Date(before).toISOString(),
    { state: "CO", fips: "08059", county: "Jefferson County" })] }), { state: "CO", expectedFips: ["08059"] });
  const weather = { ...nwsFireWeather, fetch: async ({ now }) => ({ fireWeather: parseNwsAlerts({
    type: "FeatureCollection", features: now.getTime() === active ? [warning] : [],
  }, now) }) };
  const sources = [county, weather];

  await poll(box, county, before);
  await poll(box, weather, before);
  await merge(box, sources, before);
  const baseline = box.snapshot();
  box.puts.length = 0;
  await poll(box, county, active);
  await poll(box, weather, active);
  await merge(box, sources, active);
  const during = box.snapshot();
  expect(box.puts).toEqual([stateKey("CO"), ACTIVE_KEY, PRETTY_ACTIVE_KEY, INDEX_KEY]);
  expect(during.counties["08059"].status).toBe("none");
  expect(withFireWeather(during, active).counties["08059"]).toMatchObject({
    status: "restricted", expires: "2026-11-19T07:00:00.000Z", alerts: [expect.objectContaining({ event: "Red Flag Warning" })],
  });

  await poll(box, county, after);
  await poll(box, weather, after);
  await merge(box, sources, after);
  const expiredWarning = box.snapshot();
  const projected = withFireWeather(expiredWarning, after);
  expect(projected.counties["08059"].status).toBe("restricted");
  expect(projected.counties["08059"].alerts).toBeUndefined();
  expect(projected.counties["08059"].orders[0].retainAfter).toBeUndefined();
  expect(withFireWeather(expiredWarning, Date.parse("2026-11-19T07:00Z")).counties["08059"].status).toBe("none");
  expect(expiredWarning.changed).toEqual(baseline.changed);
  expect(box.sqlite.query("SELECT count(*) AS count FROM transitions").get().count).toBe(0);
  expect(box.alerts).toEqual([]);
});

test("queue stores one revision, absorbs duplicate deliveries and skips unchanged content and merges", async () => {
  const box = sandbox();
  let called = 0;
  const stamp = (now, fips, county) => row("none", now.toISOString(), { fips, county });
  const src = source("or", async ({ now, validators }) => {
    called++;
    const a = stamp(now, "41039", "Lane County");
    const b = stamp(now, "41051", "Multnomah County");
    if (called === 3) {
      expect(validators?.etag).toBe('"v1"');
      return { notModified: true, validators };
    }
    return { rows: called === 2 ? [b, a] : [a, b], validators: { etag: '"v1"' } };
  }, { expectedFips: ["41039", "41051"] });
  await poll(box, src, initial);
  await poll(box, src, initial);
  await merge(box, [src], initial);
  expect(called).toBe(1);
  expect(box.puts).toHaveLength(51 + 3);
  expect(box.puts.slice(-3)).toEqual([ACTIVE_KEY, PRETTY_ACTIVE_KEY, INDEX_KEY]);
  expect(box.sqlite.query("SELECT count(*) as count FROM snapshot_state").get().count).toBe(51);
  expect(box.sqlite.query("SELECT count(*) as count FROM source_payload").get().count).toBe(1);
  expect(box.snapshot().sources[0]).toMatchObject({ ok: true, counties: 2 });
  await poll(box, src, nextHour);
  await merge(box, [src], nextHour);
  await poll(box, src, nextHour + 3_600_000);
  await merge(box, [src], nextHour + 3_600_000);
  await poll(box, src, initial - 1);
  expect(called).toBe(3);
  expect(box.puts).toHaveLength(51 + 3);
  const snapshot = box.snapshot();
  applyChecks(snapshot, await readHeads(box.env.DB), new Date(nextHour + 3_600_000));
  expect(snapshot.counties["41039"].checked).toBe(new Date(nextHour + 3_600_000).toISOString());
  expect(box.alerts).toEqual([]);
});

test("a partial full edition records failure and retains the last complete payload", async () => {
  const box = sandbox();
  const src = source("or", async ({ now }) => {
    const checked = now.toISOString();
    const second = row("none", checked, { fips: "41051", county: "Multnomah County" });
    return { rows: now.getTime() === initial ? [row("ban", checked), second] : [row("none", checked)] };
  }, { expectedFips: ["41039", "41051"] });
  await poll(box, src, initial);
  const first = (await readHeads(box.env.DB)).get(src.id);
  await poll(box, src, nextHour);
  expect((await readHeads(box.env.DB)).get(src.id)).toMatchObject({
    hash: first.hash, lastGood: first.lastGood, error: expect.stringContaining("missing 1 counties"),
  });
  await merge(box, [src], nextHour);
  expect(box.snapshot().counties["41039"].status).toBe("ban");
});

test("a positive-only issuer rescission survives normalization and does not send a lift alert", async () => {
  const box = sandbox();
  const aggregator = source("or", async ({ now }) => ({ rows: [row("ban", now.toISOString(), { since: "2026-11-20" })] }));
  const county = source("lane-issuer", async ({ now }) => ({ rows: now.getTime() === initial ? [] : [
    row("none", now.toISOString(), { issuerFor: aggregator.id, documentId: "signed-lift",
      since: "2026-11-23", validFrom: new Date(nextHour - 60_000).toISOString() }),
  ] }), { mode: "positive-only" });
  const sources = [aggregator, county];
  for (const time of [initial, nextHour]) {
    for (const src of sources) await poll(box, src, time);
    await merge(box, sources, time);
  }
  expect(statusFor(box.snapshot(), "41039", nextHour + 120_000)).toMatchObject({
    status: "unknown", conflict: { kind: "issuer", reports: [{ documentId: "signed-lift" }, { sourceId: "or" }] },
  });
  expect(box.alerts).toEqual([]);
});

test("a reviewed calendar fallback publishes evidence without recording a successful live check", async () => {
  const box = sandbox();
  const reviewedAt = new Date(initial - 7 * 86400_000).toISOString();
  const reviewBy = new Date(nextHour + 2 * 3_600_000).toISOString();
  const src = source("or-review", async ({ now }) => now.getTime() === initial
    ? { rows: [row("restricted", now.toISOString())] }
    : { rows: [row("restricted", now.toISOString(), { note: "Reviewed statutory rule" })],
      fallback: { reviewedAt, reviewBy, reason: "Official site HTTP 520" } },
  { mode: "positive-only", recurring: true });
  await poll(box, src, initial);
  await merge(box, [src], initial);
  await poll(box, src, nextHour);
  await merge(box, [src], nextHour);

  const snapshot = box.snapshot();
  const heads = await readHeads(box.env.DB);
  expect(heads.get(src.id)).toMatchObject({ lastGood: new Date(initial).toISOString(), ruleReview: { reviewedAt, reviewBy } });
  expect(snapshot.sources[0]).toMatchObject({ ok: false, error: "Official site HTTP 520", ruleReview: { reviewedAt, reviewBy } });
  applyChecks(snapshot, heads, new Date(nextHour));
  expect(statusFor(snapshot, "41039", nextHour)).toMatchObject({ status: "restricted", checked: reviewedAt, sourceCheckFailed: true });
  expect(statusFor(snapshot, "41039", Date.parse(reviewBy)).status).toBe("unknown");
  expect(box.alerts).toEqual([]);
});

test("journal handles KV and D1 interruption without duplicating a transition or alert run", async () => {
  const box = sandbox();
  let status = "none";
  const src = source("or", async ({ now }) => ({ rows: [row(status, now.toISOString())] }));
  const tx = source("tx-test", async ({ now }) => ({ rows: [row(status, now.toISOString(), { state: "TX", fips: "48001", county: "Anderson County" })] }), { state: "TX", expectedFips: ["48001"] });
  const sources = [src, tx];
  await poll(box, src, initial);
  await poll(box, tx, initial);
  await merge(box, sources, initial);
  status = "ban";
  await poll(box, src, nextHour);
  await poll(box, tx, nextHour);

  box.failure.key = INDEX_KEY;
  await expect(merge(box, sources, nextHour)).rejects.toThrow("interrupted KV write");
  expect(box.snapshot().counties["41039"].status).toBe("none");
  expect(box.snapshot().counties["48001"].status).toBe("none");
  expect(box.sqlite.query("SELECT old_status, new_status FROM transitions").all()).toEqual([
    { old_status: "none", new_status: "ban" }, { old_status: "none", new_status: "ban" },
  ]);
  expect(box.alerts).toHaveLength(0);

  box.failure.key = null;
  box.failure.finalize = true;
  await expect(merge(box, sources, nextHour)).rejects.toThrow("after alert");
  expect(box.snapshot().counties["41039"].status).toBe("ban");
  expect(box.alerts).toHaveLength(1);

  box.failure.finalize = false;
  await merge(box, sources, nextHour);
  await merge(box, sources, nextHour);
  expect(box.sqlite.query("SELECT * FROM transitions").all()).toHaveLength(2);
  expect(box.alerts).toHaveLength(1);
  expect(box.alerts[0].notices.map(({ title }) => title).sort()).toEqual(["Burn ban: Anderson County, TX", "Burn ban: Lane County, OR"]);
});

test("one dirty state rewrites only its shard and readers pin the catalog revision across KV lag", async () => {
  const box = sandbox();
  const start = Date.now() - 2 * 3_600_000;
  const next = start + 3_600_000;
  let status = "none";
  const or = source("or-fixture", async ({ now }) => ({ rows: [row(status, now.toISOString())] }));
  const tx = source("tx-fixture", async ({ now }) => ({ rows: [row("none", now.toISOString(), { state: "TX", fips: "48001", county: "Anderson County" })] }), { state: "TX", expectedFips: ["48001"] });
  await poll(box, or, start);
  await poll(box, tx, start);
  await merge(box, [or, tx], start);
  const old = new Map(box.keys);
  const before = box.catalog();
  box.puts.length = 0;
  status = "ban";
  await poll(box, or, next);
  await poll(box, tx, next);
  await merge(box, [or, tx], next);
  expect(box.puts).toEqual([stateKey("OR"), ACTIVE_KEY, PRETTY_ACTIVE_KEY, INDEX_KEY]);
  expect(box.catalog().states.TX).toEqual(before.states.TX);

  const freshOr = box.keys.get(stateKey("OR"));
  box.keys.delete(stateKey("OR")); // Edge has cached a miss for the new shard.
  box.keys.set(ACTIVE_KEY, old.get(ACTIVE_KEY));
  const current = snapshotReader(box.env, { fresh: true });
  expect((await current.state("OR")).counties["41039"].status).toBe("ban");
  expect(JSON.parse((await current.bans()).body.join("")).counties.map(({ fips }) => fips)).toEqual(["41039"]);

  box.keys.set(INDEX_KEY, old.get(INDEX_KEY)); // Edge sees the previous catalog with a newer shard.
  box.keys.set(stateKey("OR"), freshOr);
  const previous = snapshotReader(box.env, { fresh: true });
  box.env.ASSETS = { fetch: async () => Response.json({ "12345": ["41039", "48001"] }) };
  box.gets.length = 0;
  const border = await lookup(box.env, previous, { zip: "12345" });
  expect(border.results.map(({ state, status }) => [state, status])).toEqual([["OR", "none"], ["TX", "none"]]);
  expect(box.gets.filter((key) => key === INDEX_KEY)).toHaveLength(1);
  expect(box.gets.every((key) => [INDEX_KEY, stateKey("OR"), stateKey("TX")].includes(key))).toBe(true);
});

test("a busy hour limits KV writes and still serves every changed state", async () => {
  const box = sandbox();
  const start = Date.now() - 7_200_000;
  const next = start + 3_600_000;
  const counties = new Map(COUNTIES.map(({ state, fips, name }) => [state, { state, fips, county: name }]));
  let status = "none";
  const sources = [...counties].map(([state, county]) =>
    source(`fixture-${state}`, async ({ now }) => ({ rows: [row(status, now.toISOString(), county)] }), { state, expectedFips: [county.fips] }));
  for (const src of sources) await poll(box, src, start);
  await merge(box, sources, start);
  expect(Object.values(box.catalog().states).every(({ cached }) => cached)).toBe(true);
  box.puts.length = 0;
  status = "ban";
  for (const src of sources) await poll(box, src, next);
  await merge(box, sources, next);
  expect(box.puts).toHaveLength(MAX_CACHED_STATES + 3);
  const overflow = Object.keys(box.catalog().states).filter((state) => !box.catalog().states[state].cached);
  expect(overflow).toHaveLength(51 - MAX_CACHED_STATES);
  const state = overflow[0];
  const result = await snapshotReader(box.env, { fresh: true }).state(state);
  expect(result.counties[counties.get(state).fips].status).toBe("ban");
  expect(box.gets).not.toContain(stateKey(state));
});

test("v1 KV remains readable and the first v2 merge preserves history and resumes pending legacy notices", async () => {
  const box = sandbox();
  const start = Date.now() - 7_200_000;
  const publishedAt = new Date(start).toISOString();
  const or = source("or-fixture", async ({ now }) => ({ rows: [row("ban", now.toISOString())] }));
  const legacy = mergeSources(null, [{ source: or, rows: [row("none", publishedAt)], checked: publishedAt }], new Date(start)).snapshot;
  box.keys.set(SNAPSHOT_KEY, JSON.stringify(legacy));
  expect((await snapshotReader(box.env, { fresh: true }).state("OR")).counties["41039"].status).toBe("none");
  box.sqlite.query("INSERT INTO source_snapshot VALUES (1, 'pending-v1', '', 0, ?, ?)")
    .run(JSON.stringify(legacy), JSON.stringify([{ fips: "41039", title: "Pending v1 notice" }]));
  const next = start + 3_600_000;
  await poll(box, or, next);
  await merge(box, [or], next);
  expect(box.snapshot().counties["41039"].status).toBe("ban");
  expect(box.snapshot().changed["41039"]).toBe(new Date(next + 120_000).toISOString());
  expect(box.alerts.map(({ runId }) => runId)).toEqual(["sources-pending-v1", `sources-${box.catalog().revision}`]);
  expect(box.sqlite.query("SELECT fips, old_status, new_status FROM transitions").all()).toEqual([
    { fips: "41039", old_status: "none", new_status: "ban" },
  ]);
});

test("unchanged scoped orders take the latest matching check without rewriting their shard", async () => {
  const box = sandbox();
  const start = Date.now() - 7_200_000;
  const next = start + 3_600_000;
  let status = "none";
  const or = source("or-district", async ({ now }) => ({ rows: [row("restricted", now.toISOString(), {
    label: 'Fire restrictions in the district — check "today"', scopeNote: "County district", validUntil: new Date(start + 86_400_000).toISOString(),
  })] }), { mode: "positive-only", scope: "part" });
  const tx = source("tx-test", async ({ now }) => ({ rows: [row(status, now.toISOString(), { state: "TX", fips: "48001", county: "Anderson County" })] }), { state: "TX", expectedFips: ["48001"] });
  await poll(box, or, start);
  await poll(box, tx, start);
  await merge(box, [or, tx], start);
  const previous = box.catalog().states.OR;
  await poll(box, or, next);
  const reader = () => snapshotReader(box.env, { fresh: true });
  expect((await reader().state("OR")).counties["41039"].orders[0].checked).toBe(new Date(next).toISOString());
  status = "ban";
  await poll(box, tx, next);
  await merge(box, [or, tx], next);
  expect(box.catalog().states.OR).toEqual(previous);
  const { lastAttemptedAt: _attempt, ...county } = statusFor(await reader().state("OR"), "41039");
  expect(county.orders[0].checked).toBe(new Date(next).toISOString());
  expect(JSON.parse((await reader().bans()).body.join("")).counties[0]).toEqual(JSON.parse(JSON.stringify(county)));
  expect(JSON.parse(JSON.parse((await reader().bans(undefined, "pretty")).body.join(""))).counties[0]).toEqual(JSON.parse(JSON.stringify(county)));
});

test("out-of-order merge replay leaves a newer incomplete hourly refresh unpublished", async () => {
  const box = sandbox();
  let status = "none";
  const a = source("or", async ({ now }) => ({ rows: [row(status, now.toISOString())] }));
  const b = source("or-reports", async () => ({ rows: [] }), { mode: "positive-only" });
  await poll(box, a, initial);
  await poll(box, b, initial);
  await merge(box, [a, b], initial);
  status = "ban";
  await poll(box, a, nextHour);
  expect(await merge(box, [a, b], initial, nextHour - initial + 60_000)).toBe("done");
  expect(box.snapshot().counties["41039"].status).toBe("none");
  expect(await merge(box, [a, b], nextHour)).toBe("waiting");
  await poll(box, b, nextHour);
  await merge(box, [a, b], nextHour);
  expect(box.snapshot().counties["41039"].status).toBe("ban");
  expect(box.alerts).toHaveLength(1);
});

test("merge waits for a legacy KV revision without rolling the display back", async () => {
  const box = sandbox();
  let status = "none";
  const src = source("or", async ({ now }) => ({ rows: [row(status, now.toISOString())] }));
  await poll(box, src, initial);
  await merge(box, [src], initial);
  const old = box.sqlite.query("SELECT hash, payload FROM source_payload WHERE id = 'or'").get();
  status = "ban";
  await poll(box, src, nextHour);
  const fresh = box.sqlite.query("SELECT hash, payload FROM source_payload WHERE id = 'or'").get();
  box.sqlite.exec("UPDATE source_refresh SET stored = 0 WHERE id = 'or'");
  box.keys.set("source:or", JSON.stringify({ ...JSON.parse(old.payload), hash: old.hash }));
  await expect(merge(box, [src], nextHour)).rejects.toThrow("not visible yet");
  expect(box.snapshot().counties["41039"].status).toBe("none");
  box.keys.set("source:or", JSON.stringify({ ...JSON.parse(fresh.payload), hash: fresh.hash }));
  await merge(box, [src], nextHour);
  expect(box.snapshot().counties["41039"].status).toBe("ban");
});

test("a vanished source ages to unknown without sending a false lift", async () => {
  const box = sandbox();
  let outage = false;
  const src = source("or", async ({ now }) => {
    if (outage) throw new Error("Source down");
    return { rows: [row("ban", now.toISOString())] };
  });
  await poll(box, src, initial);
  await merge(box, [src], initial);
  outage = true;
  await poll(box, src, nextHour);
  await merge(box, [src], nextHour);
  expect(box.snapshot().counties["41039"].status).toBe("ban");
  expect(box.snapshot().sources[0].ok).toBe(false);
  const stale = initial + STALE_MS + 3_600_000;
  await poll(box, src, stale);
  await merge(box, [src], stale);
  expect(box.snapshot().counties["41039"].status).toBe("unknown");
  expect(box.alerts).toEqual([]);
});

test("countywide evidence takes precedence over city evidence and publishes the city order", () => {
  const now = new Date(initial);
  const checked = now.toISOString();
  const county = source("or", async () => ({}));
  const city = source("eugene", async () => ({}), { scope: "part" });
  const local = { source: city, checked, rows: [row("ban", checked, { label: "Ban", scopeNote: "Eugene city limits" })] };
  const onlyLocal = mergeSources(null, [local], now).snapshot.counties["41039"];
  expect(onlyLocal).toMatchObject({ status: "restricted", label: "Ban (Eugene city limits)", scope: "part" });
  const countyNone = { source: county, checked, rows: [row("none", checked, { label: "No countywide ban" })] };
  const merged = mergeSources(null, [countyNone, local], now).snapshot.counties["41039"];
  expect(merged).toMatchObject({
    status: "none", label: "No countywide ban", note: expect.stringContaining("Eugene city limits"),
    orders: [{ scope: "part", status: "ban", sourceId: "eugene", scopeNote: "Eugene city limits" }],
  });
  const partialClear = { source: city, checked, rows: [row("none", checked, { scopeNote: "Eugene city limits" })] };
  expect(mergeSources(null, [partialClear], now).snapshot.counties["41039"].status).toBe("unknown");
});

test("public expiration safety holds during a D1 health lookup failure", async () => {
  const box = sandbox();
  const start = Date.now() - 15_000;
  const src = source("or", async ({ now }) => ({
    rows: [row("ban", now.toISOString(), { validUntil: new Date(start + 2_000).toISOString() })],
  }));
  await poll(box, src, start);
  await merge(box, [src], start, 1_000);
  expect(box.snapshot().counties["41039"].status).toBe("ban");
  box.env.DB = { prepare: () => { throw new Error("D1 temporarily unavailable"); } };
  const result = await snapshotReader(box.env, { fresh: true }).state("OR");
  expect(statusFor(result, "41039")).toMatchObject({ status: "unknown", label: "Source decision expired" });
});
