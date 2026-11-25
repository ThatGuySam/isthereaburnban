import { z } from "zod";
import type { CountyStatus } from "../../../shared/types";
import { parseLocalDateTime, reportWindow, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const HOUR = 3_600_000;
const SITE = "https://chesterfieldfire.org";
const META = {
  id: "mi-chesterfield-permit-status", state: "MI", scope: "part", stack: "WordPress / public JSON",
  sourceName: "Chesterfield Township Fire Department",
  officialUrl: `${SITE}/how-do-i/request-an-open-burn-permit/`,
  sourceUrl: `${SITE}/wp-json/chfd/v1/forms/burn-status`,
} as const;

const statusFeed = z.object({
  ban: z.boolean(),
  weather: z.object({
    closed: z.boolean(),
    available: z.boolean(),
    checked: z.string(),
    observed: z.string().nullable(),
    alerts: z.array(z.string()),
    station: z.string(),
    limit: z.number(),
    wind: z.number().nullable(),
    gust: z.number().nullable(),
  }).nullish(),
});

function weatherHold(row: NonNullable<z.infer<typeof statusFeed>["weather"]>, now: Date) {
  const checked = parseLocalDateTime(row.checked, US_ZONES.Eastern);
  const window = reportWindow(checked, now, HOUR);
  if (!window || row.station !== "Selfridge Air National Guard Base (KMTC)" || row.limit !== 15) {
    throw new Error("Chesterfield: unexpected station, threshold or report time");
  }
  if (row.alerts.length) return window;
  const observed = row.observed && parseLocalDateTime(row.observed, US_ZONES.Eastern);
  const stationWindow = reportWindow(observed || null, now, 2 * HOUR);
  if (!stationWindow || stationWindow.sourceUpdated > window.sourceUpdated ||
      Math.max(row.wind ?? 0, row.gust ?? 0) <= row.limit) {
    throw new Error("Chesterfield: weather hold lacks a current high-wind observation");
  }
  return { ...window, validUntil: [window.validUntil, stationWindow.validUntil].sort()[0] };
}

export function parseChesterfieldBurnStatus(data: unknown, now: Date): CountyStatus[] {
  const { ban, weather } = statusFeed.parse(data);
  const common = {
    ...META, sourceId: META.id, fips: "26099", county: "Macomb County",
    status: "restricted", scopeNote: "Chesterfield Township open burning permits",
    checked: now.toISOString(), since: null, expires: null,
  } as const;

  if (ban) return [{
    ...common, sourceUpdated: null, label: "Fire department reports a burn ban for permitted open burning",
    note: "The township has suspended open burn permits until it lifts the ban. Its permit page lists separate rules for campfires.",
  }];
  if (!weather?.available || !weather.closed) return [];
  return [{
    ...common, ...weatherHold(weather, now), label: "Open burn permits paused for weather",
    note: "The fire department reports a weather closure for open burn permits. Check its permit page for the current wind, fire-weather alerts and campfire rules.",
  }];
}

export const miChesterfieldBurnStatus: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only", reportingFips: ["26099"],
  cadence: { kind: "hourly" }, staleMs: 2 * HOUR,
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "application/json" }, maxBytes: 16_000, maxResponseAgeMs: HOUR,
    });
    if (reply.notModified) throw new Error("Unexpected Chesterfield 304");
    return { rows: parseChesterfieldBurnStatus(await reply.response.json(), now) };
  },
};
