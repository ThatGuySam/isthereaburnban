const INLINE_LIMIT_BYTES = 1_750_000;
// At most 3 UTF-8 bytes per UTF-16 code unit, including supplementary characters paired below.
const CHUNK_CODE_UNITS = 240_000;
export const SNAPSHOT_KV_LIMIT_BYTES = 25 * 1024 * 1024;

const fields = ["snapshot", "active", "active_pretty", "weather_counties", "weather", "notices"] as const;
type Field = typeof fields[number];
export type StatePayload = Record<Field, string>;
export type StateRevision = { state: string; revision: string };

export function writeStateParts(db: D1Database, state: string, revision: string, summary: string, payload: StatePayload) {
  const sizes = fields.map((field) => Buffer.byteLength(payload[field]));
  const bytes = Buffer.byteLength(summary) + sizes.reduce((sum, size) => sum + size, 0);
  const chunked = bytes >= INLINE_LIMIT_BYTES;
  const parent = db.prepare(`INSERT INTO snapshot_state
    (state, revision, summary, ${fields.join(", ")}, chunked, encoded_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(state, revision, summary, ...fields.map((field) => chunked ? "" : payload[field]), Number(chunked), bytes);
  if (!chunked) return { writes: [parent], snapshotBytes: sizes[0] };

  const insert = db.prepare("INSERT INTO snapshot_state_part (state, revision, field, part, value) VALUES (?, ?, ?, ?, ?)");
  const writes = [parent];
  for (const field of fields) {
    const value = payload[field];
    let part = 0;
    for (let start = 0; start < value.length;) {
      let end = Math.min(start + CHUNK_CODE_UNITS, value.length);
      const last = value.charCodeAt(end - 1);
      if (end < value.length && last >= 0xD800 && last <= 0xDBFF) end -= 1;
      writes.push(insert.bind(state, revision, field, part++, value.slice(start, end)));
      start = end;
    }
  }
  return { writes, snapshotBytes: sizes[0] };
}

export async function readStateParts(db: D1Database, refs: StateRevision[], selected: readonly Field[]) {
  const data = new Map<string, Partial<Record<Field, string[]>>>();
  if (!refs.length) return data;
  const { results } = await db.prepare(`SELECT shard.state, shard.field, shard.value FROM snapshot_state_part shard
    JOIN json_each(?) ref ON shard.state = ref.value ->> 'state' AND shard.revision = ref.value ->> 'revision'
    WHERE shard.field IN (SELECT value FROM json_each(?)) ORDER BY shard.state, shard.field, shard.part`)
    .bind(JSON.stringify(refs), JSON.stringify(selected)).all<{ state: string; field: Field; value: string }>();
  for (const { state, field, value } of results) {
    let row = data.get(state);
    if (!row) data.set(state, row = {});
    (row[field] ??= []).push(value);
  }
  return data;
}
