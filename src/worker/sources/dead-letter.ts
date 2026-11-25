import type { Env } from "../env";
import type { SourceMessage } from "./queue";

export const SOURCE_DLQ = "isthereaburnban-sources-dlq";

export async function consumeDeadLetters(batch: MessageBatch<SourceMessage>, env: Env) {
  const save = env.DB.prepare("INSERT OR IGNORE INTO source_dead_letters (message_id, received_at, body) VALUES (?, ?, ?)");
  await env.DB.batch(batch.messages.map((message) => save.bind(message.id, Date.now(), JSON.stringify(message.body))));
  batch.ackAll();
}

export async function replayDeadLetter(env: Env, id: string) {
  if (!env.SOURCE_QUEUE) return false;
  const body = await env.DB.prepare("SELECT body FROM source_dead_letters WHERE message_id = ? AND replayed_at IS NULL")
    .bind(id).first<string>("body");
  if (!body) return false;
  await env.SOURCE_QUEUE.send(JSON.parse(body) as SourceMessage);
  await env.DB.prepare("UPDATE source_dead_letters SET replayed_at = ? WHERE message_id = ? AND replayed_at IS NULL")
    .bind(Date.now(), id).run();
  return true;
}
