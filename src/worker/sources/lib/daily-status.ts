import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import type { ActiveSource } from "../types";
import { localClock, localDayWindow, parseUsDate, shiftDay } from "./dates";

export type DailyDecision = {
  date: string;
  county: string;
  scopeNote: string;
  officialUrl?: string;
} & (
  | { status: "allowed" | "pending" }
  | { status: "ban" | "restricted"; label: string; note: string }
);

type Publisher = Pick<ActiveSource, "id" | "state" | "sourceName" | "sourceUrl" | "officialUrl">;

/** Publish only active limits from today's or tomorrow's explicitly dated local decisions. */
export function dailyStatusRows(
  publisher: Publisher,
  zone: string,
  decisions: readonly DailyDecision[],
  now: Date,
): CountyStatus[] {
  const { date: today } = localClock(now, zone);
  const tomorrow = shiftDay(today, 1);
  const checked = now.toISOString();
  const windows = new Map<string, ReturnType<typeof localDayWindow>>();
  const seen = new Set<string>();
  const rows: CountyStatus[] = [];
  let fresh = false;
  for (const decision of decisions) {
    const { date, county: name, scopeNote } = decision;
    const county = countyByName(publisher.state, name);
    if (!county || parseUsDate(date) !== date || !scopeNote) {
      throw new Error(`${publisher.id}: invalid daily decision`);
    }
    const key = JSON.stringify([date, county.fips, scopeNote]);
    if (seen.has(key)) throw new Error(`${publisher.id}: duplicate daily decision for ${name} (${scopeNote})`);
    seen.add(key);
    if (date !== today && date !== tomorrow) continue;
    fresh = true;
    if (!("label" in decision)) continue;
    let window = windows.get(date);
    if (!window) {
      window = localDayWindow(date, zone);
      windows.set(date, window);
    }
    rows.push({
      ...window, fips: county.fips, county: county.name, state: publisher.state, scope: "part",
      scopeNote, status: decision.status, label: decision.label, note: decision.note, checked,
      sourceId: publisher.id, sourceName: publisher.sourceName, sourceUrl: publisher.sourceUrl,
      officialUrl: decision.officialUrl ?? publisher.officialUrl, sourceUpdated: null, since: null, expires: date,
    });
  }
  if (!fresh) throw new Error(`${publisher.id}: no current dated decisions`);
  return rows;
}
