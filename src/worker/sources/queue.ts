import type { Snapshot } from "../../shared/types";
import { SNAPSHOT_KEY, type Env } from "../env";
import { CHANNELS } from "../notification-audience";
import type { Notice } from "../notification-message";
import { notify } from "../notify";
import { alertNotices, transitionInsert } from "../snapshot";
import { localClock } from "./lib/dates";
import { sha256 } from "./lib/hash";
import { mergeSources } from "./merge";
import { SOURCES } from "./registry";
import { materialRevisions, pollSource, readHeads, readSourceInputs } from "./state";
import { isActive, type ActiveSource, type Source } from "./types";

export type SourceMessage =
  | { kind: "source"; id: string; slot: number }
  | { kind: "merge"; slot: number; due: string[] };

const MERGE_DELAY = 120; // Let one poll per source finish and new KV revisions propagate.
const READINESS_TIMEOUT_MS = 15 * 60_000;
// Increment if the same source revisions need a different snapshot projection.
const MERGE_VERSION = 1;
type Checkpoint = { id: string; signature: string; published: number };
type Dependencies = {
  sources?: readonly Source[];
  now?: Date;
  sendNotices?: (env: Env, runId: string, notices: Notice[]) => Promise<unknown>;
};

export function isDue(source: ActiveSource, slot: number, previous?: number): boolean {
  if (previous != null && previous >= slot) return false;
  const cadence = source.cadence;
  if (cadence.kind === "hourly") return true;
  const { date, minute } = localClock(new Date(slot), cadence.zone);
  const latest = cadence.hours.findLast((hour) => minute >= hour * 60);
  if (latest === undefined) return false;
  const last = previous == null ? undefined : localClock(new Date(previous), cadence.zone);
  return !last || last.date !== date || last.minute < latest * 60;
}

export async function enqueueSources(env: Env, slot: number, { sources = SOURCES }: Dependencies = {}): Promise<void> {
  if (!env.SOURCE_QUEUE) throw new Error("Missing SOURCE_QUEUE binding");
  const heads = await readHeads(env.DB);
  const due = sources.filter(isActive).filter((source) => isDue(source, slot, heads.get(source.id)?.slot)).map((source) => source.id);
  // Send source messages first. A failed send can safely be retried with the same slot.
  for (let i = 0; i < due.length; i += 100) {
    const batch = due.slice(i, i + 100).map((id) => ({ body: { kind: "source" as const, id, slot } }));
    await env.SOURCE_QUEUE.sendBatch(batch);
  }
  await env.SOURCE_QUEUE.send({ kind: "merge", slot, due }, { delaySeconds: MERGE_DELAY });
}

async function sendCronNotices(env: Env, runId: string, notices: Notice[]) {
  await notify(env, {
    mode: "send", origin: "cron", runId, audience: { kind: "all" }, channels: CHANNELS, notices,
  });
}

async function publishPending(env: Env, checkpoint: Checkpoint, sendNotices: NonNullable<Dependencies["sendNotices"]>) {
  if (checkpoint.published) return;
  const pending = await env.DB.prepare("SELECT snapshot, notices FROM source_snapshot WHERE id = ?")
    .bind(checkpoint.id).first<{ snapshot: string; notices: string }>();
  if (!pending) throw new Error("Pending snapshot missing");
  await env.KV.put(SNAPSHOT_KEY, pending.snapshot);
  const notices = JSON.parse(pending.notices) as Notice[];
  if (notices.length) await sendNotices(env, `sources-${checkpoint.id}`, notices);
  await env.DB.prepare("UPDATE source_snapshot SET published = 1, notices = '[]' WHERE id = ?").bind(checkpoint.id).run();
}

export async function consumeSourceMessage(env: Env, message: SourceMessage, {
  sources = SOURCES, now = new Date(), sendNotices = sendCronNotices,
}: Dependencies = {}): Promise<"done" | "waiting"> {
  if (message.kind === "source") {
    const source = sources.find((entry) => entry.id === message.id);
    if (source && isActive(source)) await pollSource(env, source, message.slot, now);
    return "done";
  }

  const checkpoint = await env.DB.prepare("SELECT id, signature, published FROM source_snapshot WHERE singleton = 1").first<Checkpoint>();
  if (checkpoint) await publishPending(env, checkpoint, sendNotices);
  const heads = await readHeads(env.DB);
  // An older retry must not publish a partly completed newer refresh.
  if ([...heads.values()].some((head) => head.slot > message.slot)) return "done";
  if (now.getTime() - message.slot < READINESS_TIMEOUT_MS &&
    message.due.some((id) => sources.some((source) => source.id === id && isActive(source)) && (heads.get(id)?.slot ?? -1) < message.slot)) {
    return "waiting";
  }
  const signature = await sha256(JSON.stringify([MERGE_VERSION, materialRevisions(sources, heads, now)]));
  if (checkpoint?.signature === signature) return "done";

  const prev = checkpoint
    ? JSON.parse((await env.DB.prepare("SELECT snapshot FROM source_snapshot WHERE singleton = 1").first<string>("snapshot"))!) as Snapshot
    : await env.KV.get<Snapshot>(SNAPSHOT_KEY, "json");
  const inputs = await readSourceInputs(env, sources, heads, prev, now);
  const { snapshot, transitions } = mergeSources(prev, inputs, now);
  const write = env.DB.prepare(`INSERT INTO source_snapshot (singleton, id, signature, published, snapshot, notices)
    VALUES (1, ?, ?, 0, ?, ?)
    ON CONFLICT(singleton) DO UPDATE SET id = excluded.id, signature = excluded.signature, published = 0,
      snapshot = excluded.snapshot, notices = excluded.notices`);
  const next = { id: crypto.randomUUID(), signature, published: 0 };
  const statements = [write.bind(next.id, signature, JSON.stringify(snapshot), JSON.stringify(alertNotices(transitions, snapshot)))];
  if (transitions.length) statements.push(transitionInsert(env.DB, transitions));
  await env.DB.batch(statements);
  await publishPending(env, next, sendNotices);
  return "done";
}

export async function consumeSourceQueue(batch: MessageBatch<SourceMessage>, env: Env) {
  for (const message of batch.messages) {
    try {
      if (await consumeSourceMessage(env, message.body) === "waiting") message.retry({ delaySeconds: 60 });
      else message.ack();
    } catch (error) {
      console.error("Source queue message failed", message.body, error);
      message.retry({ delaySeconds: 60 });
    }
  }
}
