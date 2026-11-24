// @ts-nocheck -- bun test and SQLite types are not installed.
import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { STATES_DIR } from "../counties";
import { SNAPSHOT_KEY } from "../env";
import { withFireWeather } from "../fire-weather";
import { readSnapshot } from "../snapshot";
import { US_ZONES } from "./lib/dates";
import { mergeSources, STALE_MS } from "./merge";
import { nwsFireWeather, parseNwsAlerts } from "./nws/alerts";
import { consumeSourceMessage, enqueueSources, isDue } from "./queue";
import { SOURCES } from "./registry";
import { applyChecks, readHeads } from "./state";
import { isActive } from "./types";

const stores = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

function sandbox() {
  const sqlite = new Database(":memory:");
  stores.push(sqlite);
  for (const file of ["0001_init.sql", "0003_source_refresh.sql"]) {
    sqlite.exec(readFileSync(new URL(`../../../migrations/${file}`, import.meta.url), "utf8"));
  }
  const keys = new Map();
  const puts = [];
  const messages = [];
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
        if (sql.startsWith("UPDATE source_snapshot SET published = 1") && failure.finalize) {
          return { bind: () => ({ run: async () => { throw new Error("D1 interrupted after alert"); } }) };
        }
        return prepare(sql);
      },
      batch: async (statements) => sqlite.transaction(() => statements.map((statement) => statement.execute()))(),
    },
    KV: {
      get: async (key, type) => {
        const read = (key) => {
          const value = keys.get(key);
          return !value ? null : type === "json" || type?.type === "json" ? JSON.parse(value) : value;
        };
        return Array.isArray(key) ? new Map(key.map((key) => [key, read(key)])) : read(key);
      },
      put: async (key, value) => {
        if (key === failure.key) throw new Error("interrupted KV write");
        puts.push(key);
        keys.set(key, value);
      },
    },
    SOURCE_QUEUE: {
      sendBatch: async (batch) => messages.push(...batch),
      send: async (body, options) => messages.push({ body, ...options }),
    },
  };
  const sendNotices = async (_, runId, notices) => {
    if (!alerts.some((alert) => alert.runId === runId)) alerts.push({ runId, notices });
  };
  return { env, failure, messages, alerts, puts, keys, sqlite, sendNotices, snapshot: () => JSON.parse(keys.get(SNAPSHOT_KEY)) };
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
  stack: "HTML", sourceName: id, sourceUrl: "https://www.example.gov/feed", officialUrl: "https://www.example.gov/status",
  fetch, ...extra,
});
const run = (box, sources, message, clock = message.slot) =>
  consumeSourceMessage(box.env, message, { sources, now: new Date(clock), sendNotices: box.sendNotices });
const poll = (box, src, slot) => run(box, [src], { kind: "source", id: src.id, slot });
const merge = (box, sources, slot, delay = 120_000) =>
  run(box, sources, { kind: "merge", slot, due: sources.map(({ id }) => id) }, slot + delay);

test("registry and states.json agree in both directions, and source IDs are unique", () => {
  const active = SOURCES.filter(isActive);
  const live = STATES_DIR.filter(({ coverage }) => coverage === "live").map(({ abbr }) => abbr).sort();
  expect([...new Set(active.filter(({ coverage }) => coverage === "live").map(({ state }) => state))].sort()).toEqual(live);
  expect(new Set(SOURCES.map(({ id }) => id)).size).toBe(SOURCES.length);
  const dailyPolls = active.reduce((total, { cadence }) => total + (cadence.kind === "hourly" ? 24 : cadence.hours.length), 0);
  expect(dailyPolls * 2 + 24).toBeLessThanOrEqual(1000); // two keys per changed poll plus one hourly publication
  expect((dailyPolls + 24) * 3).toBeLessThanOrEqual(10000); // enqueue, dequeue, delete
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
    { state: "CO", fips: "08059", county: "Jefferson County" })] }), { state: "CO" });
  const weather = { ...nwsFireWeather, fetch: async ({ now }) => ({ fireWeather: parseNwsAlerts({
    type: "FeatureCollection", features: now.getTime() === active ? [warning] : [],
  }, now) }) };
  const sources = [county, weather];

  await poll(box, county, before);
  await poll(box, weather, before);
  await merge(box, sources, before);
  const baseline = box.snapshot();
  await poll(box, county, active);
  await poll(box, weather, active);
  await merge(box, sources, active);
  const during = box.snapshot();
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
  });
  await poll(box, src, initial);
  await poll(box, src, initial);
  await merge(box, [src], initial);
  expect(called).toBe(1);
  expect(box.puts).toEqual(["source:or", "source:or:hash", SNAPSHOT_KEY]);
  expect(box.snapshot().sources[0]).toMatchObject({ ok: true, counties: 2 });
  await poll(box, src, nextHour);
  await merge(box, [src], nextHour);
  await poll(box, src, nextHour + 3_600_000);
  await merge(box, [src], nextHour + 3_600_000);
  await poll(box, src, initial - 1);
  expect(called).toBe(3);
  expect(box.puts).toHaveLength(3);
  const snapshot = box.snapshot();
  applyChecks(snapshot, await readHeads(box.env.DB), new Date(nextHour + 3_600_000));
  expect(snapshot.counties["41039"].checked).toBe(new Date(nextHour + 3_600_000).toISOString());
  expect(box.alerts).toEqual([]);
});

test("journal handles KV and D1 interruption without duplicating a transition or alert run", async () => {
  const box = sandbox();
  let status = "none";
  const src = source("or", async ({ now }) => ({ rows: [row(status, now.toISOString())] }));
  await poll(box, src, initial);
  await merge(box, [src], initial);
  status = "ban";
  await poll(box, src, nextHour);

  box.failure.key = SNAPSHOT_KEY;
  await expect(merge(box, [src], nextHour)).rejects.toThrow("interrupted KV write");
  expect(box.snapshot().counties["41039"].status).toBe("none");
  expect(box.sqlite.query("SELECT old_status, new_status FROM transitions").all()).toEqual([{ old_status: "none", new_status: "ban" }]);
  expect(box.alerts).toHaveLength(0);

  box.failure.key = null;
  box.failure.finalize = true;
  await expect(merge(box, [src], nextHour)).rejects.toThrow("after alert");
  expect(box.snapshot().counties["41039"].status).toBe("ban");
  expect(box.alerts).toHaveLength(1);

  box.failure.finalize = false;
  await merge(box, [src], nextHour);
  await merge(box, [src], nextHour);
  expect(box.sqlite.query("SELECT * FROM transitions").all()).toHaveLength(1);
  expect(box.alerts).toHaveLength(1);
  expect(box.alerts[0].notices[0].title).toBe("Burn ban: Lane County, OR");
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

test("merge retries an invisible KV revision without rolling the display back", async () => {
  const box = sandbox();
  let status = "none";
  const src = source("or", async ({ now }) => ({ rows: [row(status, now.toISOString())] }));
  await poll(box, src, initial);
  await merge(box, [src], initial);
  const old = box.keys.get("source:or");
  status = "ban";
  await poll(box, src, nextHour);
  const published = box.keys.get("source:or");
  box.keys.set("source:or", old);
  await expect(merge(box, [src], nextHour)).rejects.toThrow("not visible yet");
  expect(box.snapshot().counties["41039"].status).toBe("none");
  box.keys.set("source:or", published);
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
  const result = await readSnapshot(box.env, true);
  expect(result.counties["41039"]).toMatchObject({ status: "unknown", label: "Source decision expired" });
});
