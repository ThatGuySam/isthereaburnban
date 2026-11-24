import { STATES } from "../src/shared/states-fips";
import type { CountyStatus, FireWeatherReport, SnapshotData } from "../src/shared/types";
import { formatNationalBans, type BanFormat } from "../src/worker/active-bans";
import { COUNTIES, COUNTY_BY_FIPS } from "../src/worker/counties";
import { withFireWeather } from "../src/worker/fire-weather";
import { statusFor } from "../src/worker/lookup";
import { withPublishedChecks } from "../src/worker/published-checks";
import { decodeActive, encodeActive, type SnapshotIndex, type StateSnapshot, type StateSummary } from "../src/worker/snapshot-v2";
import { withCurrentLinks } from "../src/worker/snapshot";
import { mergeSources, type SourceInput } from "../src/worker/sources/merge";
import { buildCatalog, buildStatePublication } from "../src/worker/sources/publication";
import { applyChecks, type SourceHead } from "../src/worker/sources/state";

declare global {
  namespace NodeJS {
    interface Process {
      threadCpuUsage(previous?: CpuUsage): CpuUsage;
    }
  }
}

export function nationalFixture(now: Date, allActive = false): SourceInput[] {
  const checked = now.toISOString();
  const future = new Date(now.getTime() + 3_600_000).toISOString();
  const groups = new Map<string, CountyStatus[]>();
  const fireWeather: FireWeatherReport[] = [];
  for (const [i, { state, fips, name }] of COUNTIES.entries()) {
    const status = allActive || i % 7 === 0 ? "ban" : i % 11 === 0 ? "restricted" : "none";
    const row: CountyStatus = {
      fips, state, county: name, status, label: status === "ban" ? "County burn ban" : "Open burning status",
      checked, since: null, expires: null, sourceUpdated: checked, sourceName: "Example forestry office",
      sourceUrl: "https://example.gov/feed", officialUrl: "https://example.gov/forestry/burn-status",
    };
    const group = groups.get(state);
    if (group) group.push(row);
    else groups.set(state, [row]);
    if (i % 9 === 0) fireWeather.push({ fips, alerts: [{ event: "Red Flag Warning", headline: "Red Flag Warning until evening",
      onset: checked, expires: future, ends: future, url: "https://weather.gov/example", sender: "NWS Forecast Office" }] });
  }
  const inputs: SourceInput[] = [{ source: { id: "nws-example", state: "US", mode: "positive-only", product: "fire-weather" },
    checked, rows: [], fireWeather, version: "fixture" }];
  const sorted = [...groups].sort((a, b) => b[1].length - a[1].length);
  for (const [i, [state, rows]] of sorted.entries()) {
    inputs.push({ source: { id: `${state}-example`, state, mode: "full", scope: "county" }, checked, rows, version: "fixture" });
    for (let district = 0; district < (i < 17 ? 2 : 1); district++) {
      const scoped = rows.filter((_, position) => position % 4 === district).map((row) => ({
        ...row, status: "restricted" as const, label: "Permit required", scopeNote: "Unincorporated district lands",
        validFrom: checked, validUntil: future,
      }));
      inputs.push({ source: { id: `${state}-district-${district}`, state, mode: "positive-only", scope: "part" },
        checked, rows: scoped, version: "fixture" });
    }
  }
  return inputs;
}

export function timings(run: () => unknown, samples = 120) {
  for (let i = 0; i < 20; i++) run();
  const milliseconds: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = process.threadCpuUsage();
    run();
    const elapsed = process.threadCpuUsage(start);
    milliseconds.push((elapsed.user + elapsed.system) / 1000);
  }
  milliseconds.sort((a, b) => a - b);
  const percentile = (p: number) => milliseconds[Math.ceil(milliseconds.length * p) - 1];
  return { p50: percentile(0.5), p95: percentile(0.95) };
}

function prepareStates(inputs: SourceInput[]) {
  const weather = new Map<string, FireWeatherReport[]>();
  for (const input of inputs) for (const report of input.fireWeather ?? []) {
    const state = COUNTY_BY_FIPS.get(report.fips)?.state;
    if (!state) continue;
    const reports = weather.get(state);
    if (reports) reports.push(report);
    else weather.set(state, [report]);
  }
  return STATES.map(({ abbr: state }) => {
    const stored = inputs.filter(({ source }) => source.state === state || source.product === "fire-weather")
      .map(({ rows, fireWeather: _reports, ...meta }) => ({ meta, payload: JSON.stringify({ rows,
        ...(meta.source.product === "fire-weather" ? { fireWeather: weather.get(state) } : {}) }) }));
    return { state, decode: (): SourceInput[] => stored.map(({ meta, payload }) => ({ ...meta, ...JSON.parse(payload) })) };
  });
}

export function snapshotBenchmarks(inputs: SourceInput[], now: Date) {
  const states = prepareStates(inputs).sort((a, b) => a.state.localeCompare(b.state));
  const previous = states.map(({ state, decode }) => buildStatePublication(null, decode(), now, state, "fixture", "signature"));
  const aggregateInputs = inputs.map(({ rows, fireWeather, ...meta }) => ({ meta, payload: JSON.stringify({ rows, fireWeather }) }));
  const originalJson = JSON.stringify(mergeSources(null, inputs, now).snapshot);
  const heads = new Map<string, SourceHead>(inputs.filter(({ version }) => version).map(({ source, version, checked, lastGood }) =>
    [source.id, { id: source.id, hash: version ?? null, checked, lastGood: lastGood ?? checked, slot: now.getTime(), stored: 1 }]));
  const checkedAgain = new Date(now.getTime() + 60_000).toISOString();
  const orderChecks = Object.fromEntries([...heads].map(([id]) => [id, checkedAgain]));
  for (const head of heads.values()) head.lastGood = checkedAgain;
  const read = (snapshot: SnapshotData, scoped = false) => {
    withCurrentLinks(snapshot);
    applyChecks(snapshot, heads, now);
    return withFireWeather(scoped ? withPublishedChecks(snapshot, orderChecks) : snapshot, now.getTime());
  };
  const stateCases = states.map(({ state, decode }, i) => {
    const json = previous[i].snapshot;
    const fips = COUNTIES.find((county) => county.state === state)?.fips;
    return {
      state,
      merge: () => buildStatePublication(JSON.parse(json), decode(), now, state, "fixture-next", "signature"),
      read: () => {
        const view = read(JSON.parse(json), true);
        return fips ? statusFor(view, fips) : view;
      },
    };
  });
  const active = encodeActive("fixture", previous);
  const pretty = encodeActive("fixture", previous.map((entry) => ({ ...entry, active: entry.pretty })));
  const whole: SnapshotData = JSON.parse(originalJson);
  const index: SnapshotIndex = { version: 2, reportDates: true, revision: "fixture", generated: now.toISOString(),
    sources: whole.sources, sourceVersions: whole.sourceVersions, orderChecks,
    states: Object.fromEntries(states.map(({ state }, i) => {
      const summary: StateSummary = JSON.parse(previous[i].summary);
      return [state, { revision: "fixture", signature: summary.signature, cached: true, lastChanged: summary.lastChanged }];
    })) };
  const indexJson = JSON.stringify(index);
  const largest = previous.reduce((max, entry) => entry.snapshot.length > max.length ? entry.snapshot : max, "");
  const registry = inputs.map(({ source }) => source);
  const run = { id: "fixture", generated: now.toISOString() };
  const readActive = (format: BanFormat, clock = now) => {
    const projection = decodeActive(format === "pretty" ? pretty : active);
    const catalog: SnapshotIndex = JSON.parse(indexJson);
    return formatNationalBans(projection, catalog, heads, clock, format);
  };
  return {
    stateCases,
    counts: { sources: inputs.length, counties: Object.keys(whole.counties).length, activeBytes: Buffer.byteLength(active), prettyBytes: Buffer.byteLength(pretty),
      indexBytes: Buffer.byteLength(indexJson), wholeBytes: Buffer.byteLength(originalJson),
      maxStateBytes: Math.max(...previous.map(({ snapshot }) => Buffer.byteLength(snapshot))) },
    wholeRead: () => statusFor(read(JSON.parse(originalJson)), "40143"),
    wholeMerge: () => JSON.stringify(mergeSources(null, aggregateInputs.map(({ meta, payload }) => ({ ...meta, ...JSON.parse(payload) })), now).snapshot),
    coldRebuild: () => {
      const shards = states.map(({ state, decode }) => ({
        ...buildStatePublication(null, decode(), now, state, run.id, "signature"),
        state, revision: run.id, cached: 1,
      }));
      return {
        index: JSON.stringify(buildCatalog(run, shards, registry, heads)),
        active: encodeActive(run.id, shards),
        pretty: encodeActive(run.id, shards.map((shard) => ({ ...shard, active: shard.pretty }))),
      };
    },
    joinActive: () => encodeActive("fixture", previous),
    readActive: () => new Response(readActive("compact").body.join("")),
    readActiveMcp: () => new Response(new Blob(['{"content":[{"type":"text","text":', ...readActive("pretty").body, '}] }'])),
    readActiveExpired: () => new Response(new Blob(['{"content":[{"type":"text","text":',
      ...readActive("pretty", new Date(now.getTime() + 3_600_000)).body, '}] }'])),
    parseIndex: () => JSON.parse(indexJson) as SnapshotIndex,
    parseWhole: () => JSON.parse(originalJson) as SnapshotData,
    parseLargestState: () => JSON.parse(largest) as StateSnapshot,
  };
}
