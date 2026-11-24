// @ts-nocheck -- bun test types are not installed; this file runs under Bun.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { activeFireWeather } from "../../api";
import { withFireWeather } from "../../fire-weather";
import worker from "../../index";
import { mergeSources } from "../merge";
import { ACTIVE_KEY, encodeActive, encodeState, INDEX_KEY, stateKey } from "../../snapshot-v2";
import { fetchNwsAlerts, NWS_USER_AGENT, nwsFireWeather, parseNwsAlerts } from "./alerts";
import { ND_DECLARATIONS_URL, readNdDeclarations } from "./rules";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8");
const live = fixture("active-2026-11-24");
const archive = fixture("archive-2026-11-18-to-19");
const ndRecords = fixture("nd-declarations-2026-11-24");
const liveAt = new Date("2026-11-24T07:42:59Z");
const archivedAt = new Date("2026-11-19T20:00:00Z");
const checked = liveAt.toISOString();
const feed = (...features) => ({ type: "FeatureCollection", features });
const wyomingWarning = () => JSON.parse(archive).features.find((feature) => feature.properties.sent === "2026-11-19T10:09:00-07:00");
const status = (fips, value = "unknown") => ({
  fips, state: fips.startsWith("08") ? "CO" : "OK", county: "Example County", status: value, label: value,
  since: checked, expires: null, sourceUpdated: null, checked,
  sourceName: "Issuer", sourceUrl: "https://example.gov/feed", officialUrl: "https://example.gov/",
});

test("reads the live filtered feed and keeps fire danger statements with actionable NWS headlines", () => {
  const rows = parseNwsAlerts(JSON.parse(live), liveAt);
  expect(rows).toHaveLength(20);
  const alerts = rows.flatMap((row) => row.alerts);
  expect(new Set(alerts.map((alert) => alert.event))).toEqual(new Set(["Fire Danger Statement"]));
  expect(new Set(alerts.map((alert) => alert.url)).size).toBe(3);
  expect(alerts.find((alert) => alert.sender === "NWS Baltimore MD/Washington DC")).toMatchObject({
    headline: expect.stringContaining("ELEVATED FIRE DANGER"),
    onset: "2026-11-24T07:40:00.000Z",
    expires: "2026-11-24T13:45:00.000Z",
    ends: null,
    url: expect.stringMatching(/^https:\/\/api\.weather\.gov\/alerts\/urn:oid:/),
  });
  expect(() => parseNwsAlerts({ title: "Bad Gateway" }, liveAt)).toThrow();
  expect(() => parseNwsAlerts(JSON.parse(archive), liveAt)).toThrow("Incomplete NWS");
});

test("maps actual warning SAME codes and reproduces the same counties with fire UGC alone", () => {
  const feature = wyomingWarning();
  const rows = parseNwsAlerts(feed(feature), archivedAt);
  expect(rows.map(({ fips }) => fips).sort()).toEqual(["56001", "56007", "56021"]);
  expect(rows[0].alerts[0]).toMatchObject({
    event: "Red Flag Warning", onset: "2026-11-19T18:00:00.000Z", ends: "2026-11-20T00:00:00.000Z",
    expires: "2026-11-20T00:00:00.000Z", sender: "NWS Cheyenne WY",
  });
  feature.properties.geocode.SAME = [];
  expect(parseNwsAlerts(feed(feature), archivedAt).map(({ fips }) => fips).sort()).toEqual(["56001", "56007", "56021"]);
});

test("maps direct county UGC and both cross-state and supplementary zone mappings", () => {
  const feature = wyomingWarning();
  feature.properties.geocode = { SAME: ["040000"], UGC: ["OKC143", "MTZ133"] };
  feature.properties.affectedZones = [];
  const rows = parseNwsAlerts(feed(feature), archivedAt);
  expect(rows.map(({ fips }) => fips).sort()).toEqual(["30011", "30025", "40143", "46063"]);

  feature.properties.geocode = { SAME: ["015009"], UGC: ["HIZ317"] };
  expect(parseNwsAlerts(feed(feature), archivedAt).map(({ fips }) => fips).sort()).toEqual(["15005", "15009"]);
});

test("opens warnings ahead of onset, prefers latest updates, and respects cancellation and event end", () => {
  const warning = wyomingWarning();
  expect(parseNwsAlerts(feed(warning), new Date("2026-11-19T17:30Z"))).toHaveLength(3);
  const cancellation = structuredClone(warning);
  Object.assign(cancellation.properties, {
    "@id": cancellation.properties["@id"] + ".cancel",
    messageType: "Cancel", sent: "2026-11-19T19:00:00.000Z",
  });
  expect(parseNwsAlerts(feed(cancellation, warning), archivedAt)).toHaveLength(0);
  const expired = structuredClone(warning);
  expired.properties.expires = "2026-11-20T01:00:00.000Z";
  expect(parseNwsAlerts(feed(expired), new Date("2026-11-20T00:00Z"))).toHaveLength(0);
});

test("scopes the active Colorado legal projection and preserves baseline status and lastmod", () => {
  const feature = wyomingWarning();
  feature.properties.geocode = { SAME: ["008009", "008013", "008027", "008101", "040143"], UGC: [] };
  feature.properties.affectedZones = [];
  const rows = parseNwsAlerts(feed(feature), archivedAt);
  const co = { id: "example-co", state: "CO", mode: "full" };
  const ok = { id: "example-ok", state: "OK", mode: "full" };
  const sources = [{ source: co, rows: [status("08101", "ban")], checked },
    { source: ok, rows: [status("40143", "none")], checked }];
  const before = mergeSources(null, sources, archivedAt).snapshot;
  const { snapshot, transitions } = mergeSources(before, [...sources, { source: nwsFireWeather, rows: [], fireWeather: rows, checked }], archivedAt);
  expect(transitions).toEqual([]);
  expect(snapshot.changed).toEqual(before.changed);
  expect(withFireWeather(snapshot, Date.parse("2026-11-19T17:30Z")).counties["08009"].status).toBe("unknown");
  const projected = withFireWeather(snapshot, archivedAt.getTime());
  expect(projected.counties["08009"]).toMatchObject({ status: "restricted", scope: "part", scopeNote: "Unincorporated Baca County" });
  expect(projected.counties["08013"].orders[0].officialUrl).toContain("ordinance-2023-1");
  expect(projected.counties["08027"].orders[0]).toMatchObject({ scope: "county", note: expect.stringContaining("§8.1") });
  expect(projected.counties["08101"]).toMatchObject({ status: "ban", orders: [expect.objectContaining({ officialUrl: expect.stringContaining("chapter-824") })] });
  expect(projected.counties["40143"]).toMatchObject({ status: "none", alerts: [expect.objectContaining({ event: "Red Flag Warning" })] });
  expect(withFireWeather(snapshot, Date.parse("2026-11-20T00:00Z")).counties).toEqual(before.counties);
  expect(activeFireWeather(projected, "ok").counties.map(({ fips }) => fips)).toEqual(["40143"]);
});

test("applies New Mexico's prescribed-burning statute and South Dakota's local open-fire rules", () => {
  const warning = wyomingWarning();
  warning.properties.geocode = { SAME: ["035001", "046089", "046097", "046099"], UGC: [] };
  warning.properties.affectedZones = [];
  const rows = parseNwsAlerts(feed(warning), archivedAt);
  expect(rows.find(({ fips }) => fips === "35001")?.orders?.[0]).toMatchObject({
    scope: "part", scopeNote: "Prescribed burns in the area covered by the warning", note: expect.stringContaining("§68-5-3(C)"),
  });
  expect(rows.find(({ fips }) => fips === "46089")?.orders?.[0].note).toContain("Ordinance 21-1");
  expect(rows.find(({ fips }) => fips === "46097")?.orders?.[0].note).toContain("Ordinance 2024-04");
  expect(rows.find(({ fips }) => fips === "46099")?.orders).toBeUndefined();
  warning.properties.event = "Fire Weather Watch";
  expect(parseNwsAlerts(feed(warning), archivedAt).every((row) => !row.orders)).toBe(true);
});

test("only a live verification of a signed North Dakota declaration can activate its scoped restriction", async () => {
  const warning = wyomingWarning();
  warning.properties.geocode = { SAME: ["038017", "038035", "038055", "038057"], UGC: [] };
  warning.properties.affectedZones = [];
  const cap = JSON.stringify(feed(warning));
  const fetchImpl = async (url, options) => {
    if (url === ND_DECLARATIONS_URL) return new Response(ndRecords);
    expect(url).toBe(nwsFireWeather.sourceUrl);
    expect(options.headers.get("user-agent")).toBe(NWS_USER_AGENT);
    expect(new URL(url).searchParams.get("event").split(",")).toContain("Fire Weather Watch");
    return new Response(cap);
  };
  const { fireWeather: rows } = await fetchNwsAlerts(archivedAt, fetchImpl);
  expect(rows.find(({ fips }) => fips === "38017")?.orders?.[0]).toMatchObject({
    status: "restricted", scope: "county", officialUrl: expect.stringContaining("cass-county-burn-restrictions"),
  });
  expect(rows.find(({ fips }) => fips === "38035")?.orders).toBeUndefined();
  expect((await readNdDeclarations(new Date("2026-12-01T06:00Z"), fetchImpl)).has("38017")).toBe(false);
  expect(rows.find(({ fips }) => fips === "38055")?.orders?.[0]?.officialUrl).toContain("mcleancountynd.gov");
  expect(rows.find(({ fips }) => fips === "38057")?.orders?.[0]?.officialUrl).toContain("mercercountynd.com");
  const rescinded = ndRecords.replaceAll('"declaration_rescinded":"No"', '"declaration_rescinded":"Yes"');
  const inactive = await fetchNwsAlerts(archivedAt, async (url) => new Response(url === ND_DECLARATIONS_URL ? rescinded : cap));
  expect(inactive.fireWeather.find(({ fips }) => fips === "38017")?.orders).toBeUndefined();
});

test("Worker serves fire weather on both county routes, in text and through MCP", async () => {
  const now = new Date();
  const warning = wyomingWarning();
  const sent = new Date(now.getTime() - 60_000).toISOString();
  const until = new Date(now.getTime() + 60_000).toISOString();
  Object.assign(warning.properties, { sent, effective: sent, onset: sent, expires: until, ends: until });
  const rows = parseNwsAlerts(feed(warning), now);
  const { snapshot } = mergeSources(null, [{ source: nwsFireWeather, rows: [], fireWeather: rows, checked: now.toISOString() }], now);
  const revision = "nws-test";
  const shard = encodeState({ ...snapshot, version: 2, state: "WY", revision }, revision);
  const index = { version: 2, revision, generated: snapshot.generated, sources: snapshot.sources, orderChecks: {},
    states: { WY: { revision, signature: revision, cached: true } } };
  const values = new Map([[INDEX_KEY, JSON.stringify(index)], [ACTIVE_KEY, encodeActive(revision, [shard])], [stateKey("WY"), shard.snapshot]]);
  const env = { SITE_URL: "https://isthereaburnban.com", DB: { prepare: () => ({
    all: async () => ({ results: [] }), bind: () => ({ all: async () => ({ results: [] }) }),
  }) }, KV: { get: async (key, type) => {
    const value = values.get(key);
    return value && type === "json" ? JSON.parse(value) : value ?? null;
  } } };
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
  const route = (path, init) => worker.fetch(new Request(env.SITE_URL + path, init), env, ctx);
  const single = await route("/api/v1/counties/56001");
  expect(single.status).toBe(200);
  expect(await single.json()).toMatchObject({ status: "unknown", alerts: rows[0].alerts });
  const lookup = await route("/api/v1/status?fips=56001");
  expect((await lookup.json()).results[0]).toMatchObject({ status: "unknown", alerts: rows[0].alerts });
  const text = await route("/api/v1/status?fips=56001&format=text");
  expect(await text.text()).toContain(`Red Flag Warning until ${until}`);
  const national = await route("/api/v1/fire-weather?state=wy");
  expect(await national.json()).toMatchObject({ counties: expect.arrayContaining([expect.objectContaining({ fips: "56001" })]),
    source: { state: "US", product: "fire-weather", ok: true } });
  const bans = await route("/api/v1/bans");
  expect((await bans.json()).counties).toHaveLength(0);

  const mcp = await route("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: "isthereaburnban.com" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "check_burn_ban", arguments: { fips: "56001" } } }),
  });
  expect(mcp.status).toBe(200);
  const body = await mcp.text();
  const payload = JSON.parse(mcp.headers.get("content-type")?.includes("text/event-stream") ? /^data: (.+)$/m.exec(body)[1] : body);
  expect(payload.result.content[0].text).toContain(`Red Flag Warning until ${until}`);
  expect(JSON.parse(payload.result.content[1].text).results[0].alerts).toEqual(rows[0].alerts);
});

test("filtered NWS live and real archived fixtures parse within 7 ms p95 process CPU", () => {
  for (const [name, body, now, options] of [
    ["live", live, liveAt, {}], ["archive", archive, new Date("2026-11-18T20:00Z"), { archive: true }],
  ]) {
    const parse = () => parseNwsAlerts(JSON.parse(body), now, options);
    for (let i = 0; i < 20; i++) parse();
    const samples = Array.from({ length: 120 }, () => {
      const start = process.cpuUsage();
      parse();
      const elapsed = process.cpuUsage(start);
      return (elapsed.user + elapsed.system) / 1_000;
    }).sort((a, b) => a - b);
    const [p50, p95] = [samples[59], samples[113]];
    console.log(`NWS ${name} parse CPU (ms) p50 ${p50.toFixed(3)}, p95 ${p95.toFixed(3)}`);
    expect(p95).toBeLessThan(7);
  }
});
