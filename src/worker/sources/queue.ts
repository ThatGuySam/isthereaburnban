import type { Env } from "../env";
import { CHANNELS } from "../notification-audience";
import type { Notice } from "../notification-message";
import { drainOutbox, enqueueNotices } from "../notification-outbox";
import { consumeDeadLetters, SOURCE_DLQ } from "./dead-letter";
import { runSourceMonitor } from "./monitor";
import { cachedLocalClock, isDue, READINESS_TIMEOUT_MS } from "./schedule";
import { advancePublication, currentRun, planPublication } from "./publication";
import { SOURCES } from "./registry";
import { pollSource, readHeads } from "./state";
import { isActive, type ActiveSource, type Source } from "./types";

export type SourceMessage =
  | { kind: "source"; id: string; slot: number }
  | { kind: "source-group"; ids: string[]; slot: number }
  | { kind: "merge"; slot: number; due: string[] }
  | { kind: "publish"; id: string }
  | { kind: "deliver" }
  | { kind: "monitor" };

const MERGE_DELAY = 120; // Let one poll per source finish and new KV revisions propagate.
// One readiness read, up to three D1 statements per poll, and one cleanup.
export const MAX_POLL_GROUP = 16;
export { isDue } from "./schedule";
type Dependencies = {
  sources?: readonly Source[];
  now?: Date;
  sendNotices?: (env: Env, runId: string, notices: Notice[]) => Promise<unknown>;
};

export async function enqueueSources(env: Env, slot: number, { sources = SOURCES }: Dependencies = {}): Promise<void> {
  if (!env.SOURCE_QUEUE) throw new Error("Missing SOURCE_QUEUE binding");
  const heads = await readHeads(env.DB);
  const clock = cachedLocalClock();
  const dueSources = sources.filter(isActive).filter((source) => isDue(source, slot, heads.get(source.id)?.slot, clock));
  const due = dueSources.map(({ id }) => id);
  const messages: Extract<SourceMessage, { kind: "source" | "source-group" }>[] = [];
  const groups = new Map<string, string[]>();
  for (const { id, pollGroup } of dueSources) {
    if (!pollGroup) {
      messages.push({ kind: "source", id, slot });
      continue;
    }
    let ids = groups.get(pollGroup);
    if (!ids) {
      ids = [];
      groups.set(pollGroup, ids);
      messages.push({ kind: "source-group", ids, slot });
    }
    if (ids.length === MAX_POLL_GROUP) throw new Error(`Source poll group too large: ${pollGroup}`);
    ids.push(id);
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO source_jobs (source_id, slot)
    SELECT value, ? FROM json_each(?)`).bind(slot, JSON.stringify(due)).run();
  // Send source messages first. A failed send can safely be retried with the same slot.
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100).map((body) => ({ body }));
    await env.SOURCE_QUEUE.sendBatch(batch);
  }
  await env.SOURCE_QUEUE.send({ kind: "merge", slot, due }, { delaySeconds: MERGE_DELAY });
}

async function sendCronNotices(env: Env, runId: string, notices: Notice[]) {
  await enqueueNotices(env, runId, notices, CHANNELS);
  await env.SOURCE_QUEUE?.send({ kind: "deliver" });
}

export async function consumeSourceMessage(env: Env, message: SourceMessage, {
  sources = SOURCES, now = new Date(), sendNotices = sendCronNotices,
}: Dependencies = {}): Promise<"done" | "waiting"> {
  if (message.kind === "source" || message.kind === "source-group") {
    const ids = message.kind === "source" ? [message.id] : message.ids;
    const due: ActiveSource[] = [];
    for (const id of ids) {
      const source = sources.find((entry) => entry.id === id);
      if (source && isActive(source)) due.push(source);
    }
    if (due.length) {
      // Source heads stay stable from planning through catalog commit, including late polls for this slot.
      const active = await env.DB.prepare("SELECT 1 FROM snapshot_run WHERE cursor <= json_array_length(plan) + 2").first();
      if (active) return "waiting";
      for (const source of due) await pollSource(env, source, message.slot, now);
    }
    await env.DB.prepare("DELETE FROM source_jobs WHERE slot <= ? AND source_id IN (SELECT value FROM json_each(?))")
      .bind(message.slot, JSON.stringify(ids)).run();
    return "done";
  }

  const queue = env.SOURCE_QUEUE;
  if (!queue) throw new Error("Missing SOURCE_QUEUE binding");
  if (message.kind === "monitor") {
    if (await runSourceMonitor(env, sources, now.getTime())) await queue.send({ kind: "deliver" });
    return "done";
  }
  if (message.kind === "deliver") {
    if (await drainOutbox(env)) await queue.send(message);
    return "done";
  }
  const run = await currentRun(env.DB);
  if (message.kind === "publish") {
    if (run?.id !== message.id) return "done";
    if (await advancePublication(env, run, sources, sendNotices)) await queue.send(message);
    return "done";
  }
  if (run) {
    await queue.send({ kind: "publish", id: run.id });
    return message.slot > run.slot ? "waiting" : "done";
  }
  const heads = await readHeads(env.DB);
  // An older retry must not publish a partly completed newer refresh.
  if ([...heads.values()].some((head) => head.slot > message.slot)) return "done";
  if (now.getTime() - message.slot < READINESS_TIMEOUT_MS &&
    message.due.some((id) => sources.some((source) => source.id === id && isActive(source)) && (heads.get(id)?.slot ?? -1) < message.slot)) {
    return "waiting";
  }
  const id = await planPublication(env, message.slot, now, sources, heads, sendNotices);
  if (id) await queue.send({ kind: "publish", id });
  return "done";
}

export async function consumeSourceQueue(batch: MessageBatch<SourceMessage>, env: Env) {
  if (batch.queue === SOURCE_DLQ) return consumeDeadLetters(batch, env);
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
