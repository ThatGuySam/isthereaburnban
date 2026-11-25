import { countyByName } from "../../counties";
import { dailyStatusRows, type DailyDecision } from "../lib/daily-status";
import { localClock, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

export const PACIFIC = US_ZONES.Pacific;

export function winterWoodSmokeDate(date: string) {
  const month = date.slice(5, 7);
  return month <= "02" || month >= "11";
}

export const winterWoodSmokeSeason = (now: Date) => winterWoodSmokeDate(localClock(now, PACIFIC).date);

export function californiaFootprint(counties: readonly string[]) {
  return [...new Set(counties)].map((name) => {
    const county = countyByName("CA", name);
    if (!county) throw new Error(`Unknown California county: ${name}`);
    return county.fips;
  });
}

type DailyPublisher = Pick<ActiveSource, "id" | "sourceName" | "sourceUrl" | "officialUrl" | "stack">;

export function californiaDailySource({
  publisher, counties, hours, read, http, inSeason,
}: {
  publisher: DailyPublisher;
  counties: readonly string[];
  hours: readonly [number, ...number[]];
  read: (input: Response, now: Date) => Promise<DailyDecision[]>;
  http?: { accept: string; maxBytes?: number };
  inSeason?: (now: Date) => boolean;
}) {
  const meta = { ...publisher, state: "CA", scope: "part" } as const;
  async function parse(input: Response, now: Date) {
    return dailyStatusRows(meta, PACIFIC, await read(input, now), now);
  }
  const source: ActiveSource = {
    ...meta, coverage: "restrictions", mode: "positive-only",
    reportingFips: californiaFootprint(counties),
    cadence: { kind: "daily", zone: PACIFIC, hours },
    staleMs: 30 * 60 * 60 * 1000,
    async fetch({ now }) {
      if (inSeason && !inSeason(now)) return { rows: [] };
      const reply = await fetchSource(meta.sourceUrl, {
        headers: { accept: http?.accept ?? "text/html" },
        maxBytes: http?.maxBytes,
      });
      if (reply.notModified) throw new Error(`Unexpected ${meta.id} HTTP 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
  return { source, parse };
}
