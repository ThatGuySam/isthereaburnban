import type { CountyStatus, LookupResult, SnapshotData, SourceOutage } from "../shared/types";
import { cityRulesUrl } from "../shared/city-rules";
import { DEPENDS_SENTENCE, locationConfirmation, placeName, placeStatus, statusSentence, statusTheme, unknownStatus } from "../shared/render";
import { countyDecision } from "./county-decision";
import { COUNTY_BY_FIPS, countyPath, STATE_DIR_BY_ABBR } from "./counties";
import type { Env } from "./env";
import { resolveCity } from "./places";
import { withReportDates } from "./report-dates";
import type { SnapshotReader } from "./snapshot";
import { SOURCES } from "./sources/registry";
import { isActive } from "./sources/types";

export const DISCLAIMER = "Informational only. Always confirm with the official source before burning.";

export class LookupError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const ACTIVE_SOURCES = new Map(SOURCES.filter(isActive).map((source) => [source.id, source]));

function outagesFor(snapshot: SnapshotData, fips: string, state: string, decision?: CountyStatus): SourceOutage[] {
  const outages: SourceOutage[] = [];
  for (const health of snapshot.sources) {
    if (health.ok || health.state !== state || health.mode === "manual" || !health.lastAttemptedAt) continue;
    const source = ACTIVE_SOURCES.get(health.id);
    const fipsList = health.mode === "full" ? source?.expectedFips : source?.reportingFips;
    if (!(fipsList?.includes(fips) ?? (health.mode === "full"))) continue;
    const showsFailure = (report: Pick<CountyStatus, "sourceId" | "sourceCheckFailed">) =>
      report.sourceId === health.id && report.sourceCheckFailed;
    if (decision && (showsFailure(decision) || decision.orders?.some(showsFailure) || decision.conflict?.reports.some(showsFailure))) continue;
    outages.push({ sourceId: health.id, sourceName: source?.sourceName ?? health.id,
      officialUrl: health.officialUrl ?? source?.officialUrl ?? "",
      sourceFailedSince: health.failedSince ?? health.lastAttemptedAt,
      lastAttemptedAt: health.lastAttemptedAt });
  }
  return outages;
}

/** Status for one county. Never defaults to "none": anything we can't vouch for is "unknown". */
export function statusFor(snapshot: SnapshotData, fips: string, now = Date.now()): CountyStatus {
  const hit = snapshot.counties[fips];
  if (hit) {
    const decision = countyDecision(withReportDates(hit), now);
    const checked = decision.sourceUrl ? decision.checked : null;
    const health = decision.sourceId ? snapshot.sources.find((s) => s.id === decision.sourceId) : undefined;
    const outages = outagesFor(snapshot, fips, hit.state, decision);
    return { ...decision, checked, lastAttemptedAt: decision.lastAttemptedAt ?? health?.lastAttemptedAt ?? undefined,
      ...(outages.length ? { sourceOutages: outages } : {}) };
  }
  const c = COUNTY_BY_FIPS.get(fips);
  if (!c) throw new LookupError(`unknown county FIPS ${fips}`, 404);
  const dir = STATE_DIR_BY_ABBR.get(c.state);
  const [unavailable, ...outages] = outagesFor(snapshot, fips, c.state);
  return {
    fips,
    state: c.state,
    county: c.name,
    status: "unknown",
    label: "No confirmed county report",
    since: null,
    expires: null,
    sourceUpdated: null,
    checked: null,
    firstSeenAt: null,
    statusChangedAt: null,
    sourceId: unavailable?.sourceId,
    sourceName: unavailable?.sourceName ?? dir?.publisher ?? "",
    sourceUrl: unavailable ? ACTIVE_SOURCES.get(unavailable.sourceId)?.sourceUrl ?? "" : "",
    officialUrl: unavailable?.officialUrl || dir?.officialUrl || "",
    note: dir?.notes,
    lastAttemptedAt: unavailable?.lastAttemptedAt,
    sourceCheckFailed: unavailable ? true : undefined,
    sourceFailedSince: unavailable?.sourceFailedSince,
    ...(outages.length ? { sourceOutages: outages } : {}),
  };
}

export function buildResult(query: LookupResult["query"], fipsList: string[], snapshot: SnapshotData | ((fips: string) => SnapshotData)): LookupResult {
  const forCounty = typeof snapshot === "function" ? snapshot : () => snapshot;
  const results = fipsList.map((f) => ({ ...statusFor(forCounty(f), f), url: countyPath(f) }));
  const generated = fipsList.length ? forCounty(fipsList[0]).generated : null;
  return { query, answer: placeStatus(results), generated, ambiguous: results.length > 1, approximate: false, results, disclaimer: DISCLAIMER };
}

function locationCandidates(query: LookupResult["query"], ids: string[], reason: string, matchedZip?: string): LookupResult {
  const results = ids.map((id) => {
    const county = COUNTY_BY_FIPS.get(id)!;
    return { ...unknownStatus(county, STATE_DIR_BY_ABBR.get(county.state)), label: "Location needs confirmation", url: countyPath(id) };
  });
  return { query, answer: "unknown", generated: null, approximate: true, ambiguous: results.length > 1,
    matchedZip, approximationReason: reason, results, disclaimer: DISCLAIMER };
}

/** ZIP -> counties in land-overlap order. An absent ZIP gets a numeric substitute within the prefix. */
export async function zipToFips(env: Env, zip: string): Promise<{ fips: string[]; approximate: boolean; matched: string }> {
  if (!/^\d{5}$/.test(zip)) throw new LookupError("zip must be 5 digits");
  const res = await env.ASSETS.fetch(new Request(`https://assets.local/zip/${zip.slice(0, 3)}.json`));
  if (!res.ok) throw new LookupError(`no counties found for ZIP ${zip}`, 404);
  const shard = (await res.json()) as Record<string, string[]>;
  if (shard[zip]) return { fips: shard[zip], approximate: false, matched: zip };
  const target = Number(zip);
  let best = "";
  for (const z of Object.keys(shard)) if (!best || Math.abs(Number(z) - target) < Math.abs(Number(best) - target)) best = z;
  if (!best) throw new LookupError(`no counties found for ZIP ${zip}`, 404);
  return { fips: shard[best], approximate: true, matched: best };
}

/** Coordinates -> county FIPS via the Census geocoder, cached by coords rounded to 3 decimals (~100 m). */
export async function coordsToFips(lat: number, lon: number): Promise<string[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new LookupError("lat and lon must be valid coordinates");
  const x = lon.toFixed(3);
  const y = lat.toFixed(3);
  // County routes and ZIP overlaps are keyed to 2020 geographies, including Connecticut's historic counties.
  const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${x}&y=${y}&benchmark=Public_AR_Current&vintage=Census2020_Current&layers=Counties&format=json`;
  const cache = typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : undefined;
  const key = new Request(url);
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) return cached.json<string[]>();
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new LookupError(`location lookup failed (Census geocoder HTTP ${res.status})`, 502);
  const json = (await res.json()) as { result?: { geographies?: Record<string, { GEOID?: string }[]> } };
  const counties = json.result?.geographies?.Counties ?? [];
  const fips = counties.map((c) => c.GEOID ?? "").filter((g) => COUNTY_BY_FIPS.has(g));
  if (!fips.length) throw new LookupError("that location is not inside a US county we know", 404);
  await cache?.put(key, Response.json(fips, { headers: { "cache-control": "public, max-age=2592000" } })).catch(() => undefined);
  return fips;
}

/** Shared entry point for the API, MCP tools and pages. */
export async function lookup(
  env: Env,
  snapshots: SnapshotReader,
  q: LookupResult["query"],
): Promise<LookupResult> {
  const result = async (query: LookupResult["query"], fips: string[]) => {
    const states = await snapshots.forCounties(fips);
    const answer = buildResult(query, fips, (id) => states.get(countyState(id))!);
    const nextChangeAt = snapshots.nextBoundary();
    return Number.isFinite(nextChangeAt) ? { ...answer, nextChangeAt } : answer;
  };
  if (q.zip) {
    const query = { zip: q.zip.trim() };
    const z = await zipToFips(env, query.zip);
    if (z.approximate) {
      return locationCandidates(query, z.fips,
        "The requested ZIP has no Census ZIP-area entry. We used the closest ZIP by number with the same first three digits.", z.matched);
    }
    return { ...await result(query, z.fips), matchedZip: z.matched };
  }
  if (q.lat !== undefined || q.lon !== undefined) {
    const lat = Number(q.lat);
    const lon = Number(q.lon);
    const ids = await coordsToFips(lat, lon);
    return q.here ? locationCandidates({ here: true }, ids, "We estimated the county from your IP address.") : result({ lat, lon }, ids);
  }
  if (q.fips) {
    const f = q.fips.trim();
    if (!/^\d{5}$/.test(f)) throw new LookupError("fips must be a 5-digit county FIPS code");
    return result({ fips: f }, [f]);
  }
  if (q.city) {
    const place = await resolveCity(env, q.city, q.state);
    return {
      ...await result({ city: q.city.trim(), ...(q.state ? { state: q.state.trim().toUpperCase() } : {}) }, place.counties),
      place: { ...place, localRulesUrl: cityRulesUrl(place.url) },
    };
  }
  throw new LookupError("provide zip, lat and lon, fips, city (with state), or here=1");
}

export function countyState(fips: string): string {
  const county = COUNTY_BY_FIPS.get(fips);
  if (!county) throw new LookupError(`unknown county FIPS ${fips}`, 404);
  return county.state;
}

/** "Yes: Tulsa County, OK has a burn ban (County Burn Ban). Source: ..., checked .... Official: ..." */
export function resultSentence(r: CountyStatus): string {
  const checked = r.checked?.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):.*Z$/, "$1Z");
  const head = `${statusTheme(r.status).word}: ${statusSentence(r)}.`;
  const outages = r.sourceOutages?.map((outage) =>
    `${outage.sourceName}: Couldn't check since ${outage.sourceFailedSince}. ${outage.officialUrl}`.trim()) ?? [];
  if (r.conflict) {
    return [head, ...r.conflict.reports.map((report) => [
      `${report.sourceName} reports ${report.label}.`,
      report.since && `Effective ${report.since}.`,
      report.sourceUpdated && report.sourceUpdated !== report.since && `Publisher report date ${report.sourceUpdated}.`,
      report.checked && `Checked ${report.checked}.`,
      report.sourceFailedSince && `Couldn't check since ${report.sourceFailedSince}.`,
      report.note, report.officialUrl, report.sourceUrl !== report.officialUrl && report.sourceUrl,
    ].filter(Boolean).join(" ")), ...outages].join("\n");
  }
  const src = r.sourceUrl && r.sourceName ? ` Source: ${r.sourceName}${checked ? `, checked ${checked}` : ""}.` : "";
  const dates = [
    r.sourceCheckFailed && (r.sourceFailedSince ?? r.lastAttemptedAt) && `Couldn't check since ${r.sourceFailedSince ?? r.lastAttemptedAt}.`,
    r.since && `Effective ${r.since}.`,
    r.firstSeenAt && `First recorded ${r.firstSeenAt}.`,
    r.statusChangedAt && `Published status changed ${r.statusChangedAt}.`,
    r.sourceUpdated && `Publisher report date ${r.sourceUpdated}.`,
  ].filter(Boolean).join(" ");
  const exp = r.expires ? ` Expires ${r.expires}.` : "";
  const weather = r.alerts?.map((alert) => {
    const end = alert.ends ?? alert.expires;
    return ` NWS fire weather: ${alert.event}${end ? ` until ${end}` : ""}.`;
  }).join("") ?? "";
  return [`${head}${exp}${src}${dates ? ` ${dates}` : ""}${weather}${r.note ? ` ${r.note}` : ""}${r.officialUrl ? ` ${r.sourceUrl ? "Official source" : "Official directory"}: ${r.officialUrl}` : ""}`,
    ...outages].join("\n");
}

/** Share the place qualifier and county answers across the text API and MCP. */
export function lookupText(result: LookupResult): string {
  if (result.approximate) {
    const counties = result.results.map((row) => `- ${placeName(row)}`).join("\n");
    return `${locationConfirmation(result)}\n${counties}`;
  }
  const lines = result.results.map(resultSentence);
  if (result.answer === "depends") lines.unshift(`${DEPENDS_SENTENCE}.`);
  if (result.place) {
    const local = result.place.localRulesUrl;
    lines.push(`Check rules inside city limits with the city fire authority.${local ? ` ${local}` : ""}`);
  }
  return lines.join("\n");
}
