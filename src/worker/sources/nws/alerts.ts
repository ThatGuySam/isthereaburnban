import { z } from "zod";
import zoneCounties from "../../../data/nws-zone-counties.json";
import type { FireWeatherAlert, FireWeatherReport } from "../../../shared/types";
import { COUNTY_BY_FIPS } from "../../counties";
import { fetchSource, type HttpFetch } from "../lib/http";
import type { ActiveSource } from "../types";
import { hasDatedRedFlagRule, readNdDeclarations, redFlagOrder } from "./rules";

const RED_FLAG = "Red Flag Warning";
const FIRE_WATCH = "Fire Weather Watch";
const FIRE_STATEMENT = "Fire Danger Statement";
const SPECIAL_STATEMENT = "Special Weather Statement";
const events = [RED_FLAG, FIRE_WATCH, "Extreme Fire Danger", FIRE_STATEMENT, SPECIAL_STATEMENT];
const sourceUrl = `https://api.weather.gov/alerts/active?event=${events.map(encodeURIComponent).join(",")}`;
const officialUrl = "https://www.weather.gov/fire/";
const sourceName = "National Weather Service";
export const NWS_USER_AGENT = "isthereaburnban.com (https://isthereaburnban.com/developers/)";

const text = z.string().nullish();
const strings = z.array(z.string()).nullish();
const alertFeed = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.object({
    id: text,
    properties: z.object({
      "@id": text, event: z.string(), sent: text, effective: text, onset: text, expires: text, ends: text,
      headline: text, description: text, status: z.string(), messageType: z.string(), sender: text,
      senderName: text, affectedZones: strings,
      geocode: z.object({ SAME: strings, UGC: strings }).nullish(),
      parameters: z.object({ NWSheadline: strings, VTEC: strings }).nullish(),
    }),
  })),
  pagination: z.object({ next: text }).nullish(),
});
type Alert = z.infer<typeof alertFeed>["features"][number]["properties"];
type AlertVersion = { alert: FireWeatherAlert; effective: string | null; sent: string; withdrawn: boolean };

const fireZones: Record<string, string[]> = zoneCounties.fire;
const forecastZones: Record<string, string[]> = zoneCounties.forecast;
const supplementalCounties = new Set(zoneCounties.supplementalCounties);
const fireHeadline = /\b(?:(?:extreme|increased|elevated|enhanced|high|critical)\s+(?:fire danger|risk (?:for|of) (?:rapid )?fire spread)|fire danger statement)\b/i;

function countyFips(alert: Alert) {
  const fips = new Set<string>();
  for (const same of alert.geocode?.SAME ?? []) {
    // The first digit can designate a portion of the county instead of the whole county.
    if (/^\d{6}$/.test(same) && COUNTY_BY_FIPS.has(same.slice(1))) fips.add(same.slice(1));
  }
  const hasSame = fips.size > 0;
  const affectedZones = (alert.affectedZones ?? []).map((url) => /\/zones\/(fire|forecast|county)\/([A-Z]{2}[CZ]\d{3})$/.exec(url));
  const types = new Map(affectedZones.flatMap((match) => match ? [[match[2], match[1]]] : []));
  const ugcs = new Set([...(alert.geocode?.UGC ?? []), ...types.keys()]);
  for (const ugc of ugcs) {
    if (/^[A-Z]{2}C\d{3}$/.test(ugc)) {
      const stateFips = STATE_FIPS.get(ugc.slice(0, 2));
      const county = stateFips && stateFips + ugc.slice(3);
      if (county && COUNTY_BY_FIPS.has(county)) fips.add(county);
    } else if (/^[A-Z]{2}Z\d{3}$/.test(ugc)) {
      const kind = types.get(ugc);
      const fire = kind ? kind === "fire" : alert.event === RED_FLAG || alert.event === FIRE_WATCH;
      for (const county of (fire ? fireZones : forecastZones)[ugc] ?? []) {
        if (!hasSame || supplementalCounties.has(county)) fips.add(county);
      }
    }
  }
  return fips;
}

const STATE_FIPS = new Map([...COUNTY_BY_FIPS.values()].map((county) => [county.state, county.stateFips]));
const instant = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const capUrl = /^https:\/\/api\.weather\.gov\/alerts\/[\w.:%-]+$/;

export function parseNwsAlerts(value: unknown, now: Date, {
  archive = false,
}: { archive?: boolean } = {}): FireWeatherReport[] {
  const feed = alertFeed.parse(value);
  if (feed.pagination?.next && !archive) throw new Error("Incomplete NWS active alert feed");
  const at = now.toISOString();
  const clock = now.getTime();
  const reports: FireWeatherReport[] = [];
  // A county may appear in several segments of an updated bulletin. Keep the most recent
  // version of a VTEC event per county, and allow distinct events to coexist.
  const versions = new Map<string, Map<string, AlertVersion>>();
  for (const { id, properties: props } of feed.features) {
    if (props.status !== "Actual" || !events.includes(props.event)) continue;
    const sent = instant(props.sent);
    if (!sent || sent > at) continue;
    const isStatement = props.event === SPECIAL_STATEMENT;
    const firstLine = isStatement ? props.description?.trimStart().split("\n", 1)[0] : undefined;
    const statement = props.parameters?.NWSheadline?.find((headline) => fireHeadline.test(headline)) ??
      (firstLine?.startsWith("...") && fireHeadline.test(firstLine) ? firstLine.replace(/^\.+|\.+$/g, "") : undefined);
    if (isStatement && !statement && !fireHeadline.test(props.headline ?? "")) continue;
    const alert: FireWeatherAlert = {
      event: isStatement ? FIRE_STATEMENT : props.event,
      headline: (statement ?? props.headline)?.trim() || props.event,
      onset: instant(props.onset), expires: instant(props.expires), ends: instant(props.ends),
      sender: props.senderName?.trim() || props.sender?.trim() || sourceName,
      url: [props["@id"], id].find((url) => url && capUrl.test(url)) ?? officialUrl,
    };
    const effective = instant(props.effective);
    const vtec = props.parameters?.VTEC?.[0]?.match(/^\/O\.([A-Z]{3})\.([A-Z0-9.]+)\.\d{6}T\d{4}Z-/);
    const key = vtec ? vtec[2] : alert.url === officialUrl ? `${alert.event}:${alert.sender}:${alert.headline}` : alert.url;
    const withdrawn = props.messageType === "Cancel" || props.messageType === "Ack" || props.messageType === "Error" ||
      vtec?.[1] === "CAN" || vtec?.[1] === "UPG";
    for (const fips of countyFips(props)) {
      const versionsForCounty = versions.get(fips) ?? new Map<string, AlertVersion>();
      versions.set(fips, versionsForCounty);
      const previous = versionsForCounty.get(key);
      if (previous && (sent < previous.sent || (sent === previous.sent &&
        (previous.withdrawn || (!withdrawn && alert.url <= previous.alert.url))))) continue;
      // Keep withdrawals as tombstones for this response, so an older version can't reappear.
      versionsForCounty.set(key, { alert, effective, sent, withdrawn });
    }
  }

  for (const [fips, entries] of versions) {
    const alerts: FireWeatherAlert[] = [];
    const orders: NonNullable<FireWeatherReport["orders"]> = [];
    for (const { alert, effective, withdrawn } of [...entries.values()].sort((a, b) =>
      a.alert.event.localeCompare(b.alert.event) || a.alert.url.localeCompare(b.alert.url))) {
      if (withdrawn || !alertIsCurrent(alert, clock)) continue;
      alerts.push(alert);
      const order = redFlagOrder(fips, alert, effective);
      if (order) orders.push(order);
    }
    if (!alerts.length) continue;
    reports.push({ fips, alerts, ...(orders.length ? { orders } : {}) });
  }
  return reports;
}

export function alertIsCurrent({ expires, ends }: FireWeatherAlert, clock: number) {
  return Boolean((expires || ends) && (!expires || Date.parse(expires) > clock) && (!ends || Date.parse(ends) > clock));
}

export async function fetchNwsAlerts(now: Date, fetchImpl?: HttpFetch) {
  const reply = await fetchSource(sourceUrl, {
    headers: { accept: "application/geo+json", "user-agent": NWS_USER_AGENT },
    maxBytes: 2_000_000, fetchImpl,
  });
  if (reply.notModified) throw new Error("Unexpected NWS 304");
  const fireWeather = parseNwsAlerts(await reply.response.json(), now);
  const dated = fireWeather.filter((row) => hasDatedRedFlagRule(row.fips) && row.alerts.some((alert) => alert.event === RED_FLAG));
  if (dated.length) {
    try {
      const declarations = await readNdDeclarations(now, fetchImpl);
      for (const row of dated) {
        const declaration = declarations.get(row.fips);
        if (!declaration) continue;
        row.orders = row.alerts.flatMap((alert) => {
          const order = redFlagOrder(row.fips, alert, null, declaration);
          return order ? [order] : [];
        });
      }
    } catch (error) {
      // The weather evidence can still be delivered when the declaration can't be confirmed.
      console.warn("NWS North Dakota declaration lookup failed", error instanceof Error ? error.message : String(error));
    }
  }
  return { fireWeather };
}

export const nwsFireWeather = {
  id: "nws-fire-weather", state: "US", product: "fire-weather", mode: "positive-only", scope: "county",
  cadence: { kind: "hourly" }, coverage: "restrictions", stack: "NWS CAP / GeoJSON",
  sourceName, sourceUrl, officialUrl, staleMs: 3 * 3_600_000,
  fetch: ({ now }) => fetchNwsAlerts(now),
} satisfies ActiveSource;
