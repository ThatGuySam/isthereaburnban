import type { CountyStatus, Snapshot } from "../../shared/types";
import { COUNTY_BY_FIPS } from "../counties";
import type { Env } from "../env";
import { sha256 } from "./lib/hash";
import { BlockedError, type Validators } from "./lib/http";
import { STALE_MS, type SourceInput } from "./merge";
import { isActive, type ActiveSource, type Source } from "./types";

type Health = {
  checked: string;
  lastGood?: string;
  error?: string;
  blocked?: boolean;
  validators?: Validators;
  boundaries?: string[];
};

export type SourceHead = Health & { id: string; slot: number; hash: string | null };
type StoredHead = Pick<SourceHead, "id" | "slot" | "hash"> & { health: string };

const loadHead = ({ health, ...row }: StoredHead): SourceHead => ({ ...row, ...JSON.parse(health) as Health });
const sourceKey = (id: string) => `source:${id}`;
const hashKey = (id: string) => `${sourceKey(id)}:hash`;
type SourceData = { hash: string; rows: Omit<CountyStatus, "checked">[] };
const errorText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)).slice(0, 300);
const BY_VALIDITY = new Set(["ban", "restricted", "none", "unknown"]);

export async function readHeads(db: D1Database): Promise<Map<string, SourceHead>> {
  const { results } = await db.prepare("SELECT id, slot, hash, health FROM source_refresh").all<StoredHead>();
  return new Map(results.map((row) => [row.id, loadHead(row)]));
}

function normalize(source: ActiveSource, rows: CountyStatus[]) {
  if (!rows.length && source.mode === "full") throw new Error("Full source returned no rows");
  const ordered = rows.map((row) => {
    const { fips, state, county, label, since, expires, sourceUpdated, sourceName, sourceUrl, officialUrl, note,
      scopeNote, validFrom, validUntil } = row;
    const scope = source.scope === "part" ? source.scope : row.scope ?? source.scope;
    if (state !== source.state || COUNTY_BY_FIPS.get(fips)?.state !== source.state || !BY_VALIDITY.has(row.status) ||
      (validFrom && !Number.isFinite(Date.parse(validFrom))) || (validUntil && !Number.isFinite(Date.parse(validUntil))) ||
      (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) || (scope === "part" && !scopeNote)) {
      throw new Error(`${source.id}: invalid status row for ${fips}`);
    }
    const status = row.status === "none" && source.mode === "positive-only" && scope !== "part" ? "unknown" : row.status;
    return { fips, state, county, status, label: status === row.status ? label : "Countywide status unconfirmed",
      since, expires, sourceUpdated, sourceName, sourceUrl, officialUrl, note,
      scope, scopeNote, sourceId: source.id, validFrom, validUntil };
  });
  // Sort complete normalized rows so publisher ordering alone does not cause a write.
  const serialized = [...new Set(ordered.map((row) => JSON.stringify(row)))].sort().join(",");
  const boundaries = [...new Set(ordered.flatMap(({ validFrom, validUntil }) =>
    [validFrom, validUntil].filter((value): value is string => Boolean(value))))].sort();
  return { serialized, boundaries };
}

async function writeSource(env: Env, id: string, hash: string, serialized: string): Promise<void> {
  const storedHash = await env.KV.get(hashKey(id), "text");
  if (storedHash === hash) {
    const data = await env.KV.get<SourceData>(sourceKey(id), "json");
    if (data?.hash === hash) return; // The prior attempt completed the KV write before losing its D1 checkpoint.
  }
  await env.KV.put(sourceKey(id), `{"hash":"${hash}","rows":[${serialized}]}`);
  if (storedHash !== hash) await env.KV.put(hashKey(id), hash);
}

export async function pollSource(env: Env, source: ActiveSource, slot: number, now: Date): Promise<void> {
  const current = await env.DB.prepare("SELECT id, slot, hash, health FROM source_refresh WHERE id = ?")
    .bind(source.id).first<StoredHead>();
  if (current && current.slot >= slot) return;
  const previous = current ? loadHead(current) : undefined;
  const checked = now.toISOString();
  let hash = previous?.hash ?? null;
  let health: Health = { checked, lastGood: previous?.lastGood, validators: previous?.validators, boundaries: previous?.boundaries };
  let incoming: ReturnType<typeof normalize> | undefined;

  try {
    const result = await source.fetch({ now, validators: hash ? health.validators : undefined });
    if ("notModified" in result) {
      if (!hash) throw new Error("Source returned 304 before its first successful fetch");
    } else incoming = normalize(source, result.rows);
    health = { ...health, lastGood: checked, validators: result.validators };
  } catch (reason) {
    health.error = errorText(reason);
    health.blocked = reason instanceof BlockedError;
    console.warn(`source ${source.id} failed: ${health.error}`);
  }

  if (incoming) {
    const next = await sha256(incoming.serialized);
    if (next !== hash) await writeSource(env, source.id, next, incoming.serialized);
    hash = next;
    health.boundaries = incoming.boundaries;
  }
  await env.DB.prepare(`INSERT INTO source_refresh (id, slot, hash, health) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET slot = excluded.slot, hash = excluded.hash, health = excluded.health
    WHERE source_refresh.slot < excluded.slot`).bind(source.id, slot, hash, JSON.stringify(health)).run();
}

export function materialRevisions(sources: readonly Source[], heads: Map<string, SourceHead>, now: Date) {
  const time = now.getTime();
  return sources.map((source) => {
    const identity = [source.id, source.scope, source.mode, source.officialUrl];
    const head = heads.get(source.id);
    if (!isActive(source)) return [...identity, source.error];
    if (!head) return [...identity, "pending"];
    const stale = head.lastGood ? time - Date.parse(head.lastGood) > (source.staleMs ?? STALE_MS) : false;
    const reached = head.boundaries?.filter((boundary) => Date.parse(boundary) <= time).length ?? 0;
    return [...identity, head.hash, head.error ? head.blocked ? "blocked" : "failed" : "ok", stale, reached];
  });
}

function fallback(source: Source, prev: Snapshot | null): CountyStatus[] {
  const rows: CountyStatus[] = [];
  for (const county of Object.values(prev?.counties ?? {})) {
    if (county.state !== source.state) continue;
    const ownOrders = county.orders?.filter((order) => order.sourceId === source.id) ?? [];
    const selected = county.sourceId ? county.sourceId === source.id : source.id === source.state.toLowerCase();
    if (selected && (county.scope !== "part" || !ownOrders.length)) {
      rows.push({ ...county, orders: undefined });
    }
    for (const order of ownOrders) {
      rows.push({ ...county, ...order, sourceUrl: source.sourceUrl, orders: undefined });
    }
  }
  return rows;
}

export async function readSourceInputs(
  env: Env, sources: readonly Source[], heads: Map<string, SourceHead>, prev: Snapshot | null, now: Date,
): Promise<SourceInput[]> {
  const inputs: SourceInput[] = [];
  const checked = now.toISOString();
  const keys = sources.filter((source) => isActive(source) && heads.get(source.id)?.hash).map((source) => sourceKey(source.id));
  const revisions = new Map<string, SourceData | null>();
  for (let i = 0; i < keys.length; i += 100) {
    const values = await env.KV.get<SourceData>(keys.slice(i, i + 100), "json");
    for (const [key, data] of values) revisions.set(key, data);
  }
  for (const source of sources) {
    if (!isActive(source)) {
      inputs.push({ source, rows: [], checked, error: source.error });
      continue;
    }
    const head = heads.get(source.id);
    if (!head?.hash) {
      inputs.push({ source, rows: fallback(source, prev), checked: head?.checked ?? checked, error: head?.error ?? "Awaiting first source refresh" });
      continue;
    }
    const data = revisions.get(sourceKey(source.id));
    if (data?.hash !== head.hash) throw new Error(`KV source revision is not visible yet: ${source.id}`);
    const lastGood = head.lastGood ?? head.checked;
    inputs.push({ source, version: head.hash, checked: head.checked, lastGood, error: head.error,
      staleMs: source.staleMs, rows: data.rows });
  }
  return inputs;
}

export async function sourceInputs(sources: readonly Source[], prev: Snapshot | null, now: Date): Promise<SourceInput[]> {
  const inputs: SourceInput[] = [];
  for (const source of sources) {
    const checked = now.toISOString();
    if (!isActive(source)) {
      inputs.push({ source, rows: [], checked, error: source.error });
      continue;
    }
    try {
      const result = await source.fetch({ now });
      if ("notModified" in result) throw new Error("Unexpected 304 without stored validators");
      const normalized: SourceData["rows"] = JSON.parse(`[${normalize(source, result.rows).serialized}]`);
      inputs.push({ source, rows: normalized, checked, lastGood: checked, staleMs: source.staleMs });
    } catch (reason) {
      inputs.push({ source, rows: fallback(source, prev), checked, error: errorText(reason), staleMs: source.staleMs });
    }
  }
  return inputs;
}

export function applyChecks(snapshot: Snapshot, heads: Map<string, SourceHead>, now: Date) {
  for (const source of snapshot.sources) {
    const head = heads.get(source.id);
    if (!head) continue;
    source.checked = head.checked;
    source.ok = !head.error;
    source.error = head.error;
  }
  const clock = now.getTime();
  for (const row of Object.values(snapshot.counties)) {
    if (!row.sourceId) continue;
    const head = heads.get(row.sourceId);
    if (head?.lastGood && head.hash === snapshot.sourceVersions?.[row.sourceId]) row.checked = head.lastGood;
    if (row.validUntil && Date.parse(row.validUntil) <= clock) {
      row.status = "unknown";
      row.label = "Source decision expired";
      row.note = undefined;
      row.since = row.expires = null;
    } else if (clock - Date.parse(row.checked) > STALE_MS && row.status !== "unknown") {
      row.status = "unknown";
      row.label = "Source unavailable. Our last good data is over 48 hours old";
      row.note = undefined;
    }
    if (row.orders?.some((order) => order.validUntil && Date.parse(order.validUntil) <= clock)) {
      row.orders = row.orders.filter((order) => !order.validUntil || Date.parse(order.validUntil) > clock);
      // The merge rebuilds the human-readable summary of remaining orders.
      row.note = undefined;
    }
  }
}
