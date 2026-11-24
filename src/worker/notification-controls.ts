import type { Env } from "./env";

export const ALERTS_PAUSED_KEY = "notifications:paused";
export const MANUAL_LIMIT = 8;
// TODO(fire-weather-notifications): Add a separate opt-in flag and delivery history for NWS push and email.

export async function alertsPausedInDb(env: Env): Promise<boolean> {
  const paused = await env.DB.prepare("SELECT paused FROM notification_settings WHERE id = 1").first<number>("paused");
  return paused !== 0;
}

export async function alertsPaused(env: Env): Promise<boolean> {
  return await alertsPausedInDb(env) || await env.KV.get(ALERTS_PAUSED_KEY) === "1";
}

export async function setAlertsPaused(env: Env, paused: boolean): Promise<void> {
  // Reserve the change in D1. A slow resume may never clear a newer pause.
  const generation = await env.DB.prepare(`UPDATE notification_settings SET paused = 1, generation = generation + 1
    WHERE id = 1 RETURNING generation`).first<number>("generation");
  if (generation === null) throw new Error("Notification settings are unavailable");
  await env.KV.put(ALERTS_PAUSED_KEY, paused ? "1" : "0");
  if (!paused) {
    await env.DB.prepare("UPDATE notification_settings SET paused = 0 WHERE id = 1 AND generation = ?")
      .bind(generation).run();
  }
}
