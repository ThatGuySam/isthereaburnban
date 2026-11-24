import type { Env } from "../env";
import { CHANNELS } from "../notification-audience";
import type { Notice } from "../notification-message";
import { notify } from "../notify";
import { nudgePushRetries, retryPendingPush } from "../push-outbox";
import { localClock } from "./lib/dates";
import { advancePublication, currentRun, planPublication } from "./publication";
import { SOURCES } from "./registry";
import { pollSource, readHeads } from "./state";
import { isActive, type ActiveSource, type Source } from "./types";

export type SourceMessage =
  | { kind: "source"; id: string; slot: number }
  | { kind: "merge"; slot: number; due: string[] }
  | { kind: "publish"; id: string }
  | { kind: "push-retry" };

const MERGE_DELAY = 120; // Let one poll per source finish and new KV revisions propagate.
const READINESS_TIMEOUT_MS = 15 * 60_000;
type Dependencies = {
  sources?: readonly Source[];
  now?: Date;
  sendNotices?: (env: Env, runId: string, notices: Notice[]) => Promise<unknown>;
};

export function isDue(source: ActiveSource, slot: number, previous?: number, clock = localClock): boolean {
  if (previous != null && previous >= slot) return false;
  const cadence = source.cadence;
  if (cadence.kind === "hourly") return true;
  const { date, minute } = clock(new Date(slot), cadence.zone);
  const latest = cadence.hours.findLast((hour) => minute >= hour * 60);
  if (latest === undefined) return false;
  const last = previous == null ? undefined : clock(new Date(previous), cadence.zone);
  return !last || last.date !== date || last.minute < latest * 60;
}

export async function enqueueSources(env: Env, slot: number, { sources = SOURCES }: Dependencies = {}): Promise<void> {
  if (!env.SOURCE_QUEUE) throw new Error("Missing SOURCE_QUEUE binding");
  const heads = await readHeads(env.DB);
  const localTimes = new Map<string, ReturnType<typeof localClock>>();
  const clock = (at: Date, zone: string) => {
    const key = `${zone}/${at.getTime()}`;
    const cached = localTimes.get(key);
    if (cached) return cached;
    const time = localClock(at, zone);
    localTimes.set(key, time);
    return time;
  };
  const due = sources.filter(isActive).filter((source) => isDue(source, slot, heads.get(source.id)?.slot, clock)).map((source) => source.id);
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

export async function consumeSourceMessage(env: Env, message: SourceMessage, {
  sources = SOURCES, now = new Date(), sendNotices = sendCronNotices,
}: Dependencies = {}): Promise<"done" | "waiting"> {
  if (message.kind === "push-retry") {
    const delay = await retryPendingPush(env, now.getTime());
    if (delay !== null) await nudgePushRetries(env, delay);
    return "done";
  }
  if (message.kind === "source") {
    const source = sources.find((entry) => entry.id === message.id);
    if (source && isActive(source)) {
      // Source heads stay stable from planning through catalog commit, including late polls for this slot.
      const active = await env.DB.prepare("SELECT 1 FROM snapshot_run WHERE cursor <= json_array_length(plan) + 2").first();
      if (active) return "waiting";
      await pollSource(env, source, message.slot, now);
    }
    return "done";
  }

  const queue = env.SOURCE_QUEUE;
  if (!queue) throw new Error("Missing SOURCE_QUEUE binding");
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
