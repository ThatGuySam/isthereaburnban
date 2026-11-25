import { localClock } from "./lib/dates";
import type { ActiveSource } from "./types";

export const HOUR_MS = 3_600_000;
export const READINESS_TIMEOUT_MS = 15 * 60_000;
const CRON_MINUTE_MS = 7 * 60_000;

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

export function cachedLocalClock() {
  const times = new Map<string, ReturnType<typeof localClock>>();
  return (at: Date, zone: string) => {
    const key = `${zone}/${at.getTime()}`;
    const cached = times.get(key);
    if (cached) return cached;
    const time = localClock(at, zone);
    times.set(key, time);
    return time;
  };
}

/** Hourly slots are anchored to the cron; daily schedules follow publisher local time and DST. */
export function pollingSlots(source: ActiveSource, now: number, clock = localClock) {
  const current = Math.floor((now - CRON_MINUTE_MS) / HOUR_MS) * HOUR_MS + CRON_MINUTE_MS;
  const scheduled = (slot: number) => isDue(source, slot, slot - HOUR_MS, clock);
  let next = current + HOUR_MS;
  while (next <= current + 49 * HOUR_MS && !scheduled(next)) next += HOUR_MS;
  const overdue: number[] = [];
  for (let slot = current; slot >= current - 72 * HOUR_MS && overdue.length < 2; slot -= HOUR_MS) {
    if (slot + READINESS_TIMEOUT_MS <= now && scheduled(slot)) overdue.push(slot);
  }
  return { next, overdue };
}
