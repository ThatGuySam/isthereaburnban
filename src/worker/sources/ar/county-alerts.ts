import type { CountyStatus } from "../../../shared/types";
import { apptegyLiveFeed } from "../lib/apptegy";
import { civicPlusActiveAlertBody, civicPlusActiveAlerts, civicPlusUrl } from "../lib/civicplus";
import { parseLocalDateTime, parseUsDate, reportWindow, US_ZONES } from "../lib/dates";
import { pacedSourceReader, getText } from "../lib/http";
import type { ActiveSource } from "../types";

const ZONE = US_ZONES.Central;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CADENCE = { kind: "daily", zone: ZONE, hours: [4, 10, 16, 22] } as const;
const GARLAND_URL = civicPlusUrl("https://www.garlandcounty.org/", "alerts");
const GARLAND = {
  id: "ar-garland-county-alerts", state: "AR", scope: "part", stack: "CivicPlus / Alert Center",
  sourceName: "Garland County Judge", sourceUrl: GARLAND_URL, officialUrl: GARLAND_URL,
} as const;
const HOT_SPRINGS_URL = civicPlusUrl("https://www.hotspringsar.gov/", "alerts");
const HOT_SPRINGS = {
  id: "ar-hot-springs-burn-alerts", state: "AR", scope: "part", stack: "CivicPlus / Alert Center",
  sourceName: "City of Hot Springs", sourceUrl: HOT_SPRINGS_URL, officialUrl: HOT_SPRINGS_URL,
} as const;
type CivicPublisher = typeof GARLAND | typeof HOT_SPRINGS;
type ReadAlert = (url: string) => Promise<Response | string>;

async function currentCivicBan({ meta, issue, lift, input, now, readAlert }: {
  meta: CivicPublisher; issue: RegExp; lift: RegExp; input: Response | string; now: Date; readAlert: ReadAlert;
}) {
  const alerts = await civicPlusActiveAlerts(input, meta.sourceUrl);
  const candidates = alerts.filter(({ title }) => /\bburn ban\b/i.test(title)).map((alert) => {
    const posted = alert.published && parseLocalDateTime(alert.published, ZONE);
    if (!posted || posted > now.toISOString()) throw new Error(`${meta.sourceName}: future or undated burn-ban alert`);
    return { alert, posted };
  }).sort((left, right) => right.posted.localeCompare(left.posted));
  const [latest, older] = candidates;
  if (!latest) return;
  const { alert, posted } = latest;
  if (older?.posted === posted) throw new Error(`${meta.sourceName}: ambiguous active burn-ban alerts`);
  if (lift.test(alert.title)) return;
  if (!issue.test(alert.title)) {
    throw new Error(`${meta.sourceName}: unrecognized active burn-ban alert`);
  }
  const window = reportWindow(posted, now, 120 * DAY);
  if (!window) throw new Error(`${meta.sourceName}: stale burn-ban alert`);
  const body = await civicPlusActiveAlertBody(await readAlert(alert.url), alert);
  return { url: alert.url, body, window };
}

export async function parseGarlandAlerts(input: Response | string, now: Date, readAlert: ReadAlert): Promise<CountyStatus[]> {
  const current = await currentCivicBan({
    meta: GARLAND, issue: /^Garland County Burn Ban in Effect[.!]?$/i,
    lift: /^Garland County Burn Ban (?:Lifted|Rescinded)[.!]?$/i, input, now, readAlert,
  });
  if (!current) return [];
  const { body, window, url } = current;
  const order = /^GARLAND COUNTY EXECUTIVE ORDER (CC-\d{2}-\d+)\b/i.exec(body);
  const start = /beginning this (\d{1,2})(?:st|nd|rd|th) day of ([a-z]+) (\d{4}), and ending upon authorization/i.exec(body);
  const since = start && parseUsDate(`${start[2]} ${start[1]}, ${start[3]}`);
  if (!order || !since || since > window.sourceUpdated.slice(0, 10) || !/\bA burn ban is hereby issued for all unincorporated areas of Garland County\./i.test(body) ||
      !/BE IT SO ORDERED\.$/i.test(body)) {
    throw new Error("Garland: missing effective date or unincorporated scope in the executive order");
  }
  return [{
    ...window,
    fips: "05051", county: "Garland County", state: GARLAND.state, scope: GARLAND.scope, sourceId: GARLAND.id,
    status: "ban", label: "County burn ban in effect", scopeNote: "Unincorporated Garland County",
    note: `Executive Order ${order[1]} prohibits covered open burning without a permit until the county judge ends the order.`,
    since, expires: null, checked: now.toISOString(), sourceName: GARLAND.sourceName, sourceUrl: GARLAND_URL, officialUrl: url,
  }];
}

export async function parseHotSpringsAlerts(input: Response | string, now: Date, readAlert: ReadAlert): Promise<CountyStatus[]> {
  const current = await currentCivicBan({
    meta: HOT_SPRINGS, issue: /^Burn Ban in Effect for the City of Hot Springs[.!]?$/i,
    lift: /^Burn Ban (?:Lifted|Rescinded) for the City of Hot Springs[.!]?$/i, input, now, readAlert,
  });
  if (!current) return [];
  const { body, window, url } = current;
  const start = /^Beginning ([A-Za-z]+, [A-Za-z]+ \d{1,2}) at (\d{1,2}:\d{2} [ap]\.m\.), a burn ban is in effect for the City of Hot Springs\./i.exec(body);
  const effective = start && parseLocalDateTime(`${start[1]}, ${window.sourceUpdated.slice(0, 4)} ${start[2]}`, ZONE);
  if (!effective || effective > window.sourceUpdated || !/The burn ban prohibits all controlled burning within city limits\./i.test(body) ||
      !/The burn ban will be in effect as long as these conditions are present\./i.test(body)) {
    throw new Error("Hot Springs: missing effective time or city scope in the notice");
  }
  return [{
    ...window, validFrom: effective,
    fips: "05051", county: "Garland County", state: HOT_SPRINGS.state, scope: HOT_SPRINGS.scope, sourceId: HOT_SPRINGS.id,
    status: "ban", label: "City controlled-burning ban", scopeNote: "City of Hot Springs",
    note: "Hot Springs prohibits controlled burning within city limits and has rescinded previously issued burn permits.",
    since: effective.slice(0, 10), expires: null, checked: now.toISOString(),
    sourceName: HOT_SPRINGS.sourceName, sourceUrl: HOT_SPRINGS_URL, officialUrl: url,
  }];
}

function civicSource(meta: CivicPublisher, parse: typeof parseGarlandAlerts): ActiveSource {
  return {
    ...meta, mode: "positive-only", coverage: "restrictions", cadence: CADENCE,
    reportingFips: ["05051"], staleMs: 18 * HOUR, keepRowLinks: true,
    async fetch({ now }) {
      const reader = pacedSourceReader({
        attempts: 1, headers: { accept: "text/html" }, maxBytes: 400_000, maxResponseAgeMs: 2 * HOUR,
      });
      const read = async (url: string) => {
        const reply = await reader(url);
        if (reply.notModified) throw new Error(`Unexpected ${meta.sourceName} alert 304`);
        return reply.response;
      };
      return { rows: await parse(await read(meta.sourceUrl), now, read) };
    },
  };
}

export const arGarlandAlerts = civicSource(GARLAND, parseGarlandAlerts);
export const arHotSpringsAlerts = civicSource(HOT_SPRINGS, parseHotSpringsAlerts);

const SECTION = 526976;
const NASHVILLE_SITE = "https://www.nashar.org/";
const NASHVILLE = {
  id: "ar-nashville-burn-alerts", state: "AR", scope: "part", stack: "Apptegy / Thrillshare JSON",
  sourceName: "City of Nashville",
  sourceUrl: `https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o/31323/cms/live_feeds?section_ids=${SECTION}`,
  officialUrl: new URL("live-feed", NASHVILLE_SITE).href,
} as const;

export function parseNashvilleAlerts(data: unknown, now: Date): CountyStatus[] {
  const alerts = apptegyLiveFeed(data, SECTION, now);
  const latest = alerts.find(({ text }) => /\bburn ban\b/i.test(text));
  if (!latest || latest.author !== NASHVILLE.sourceName ||
      !/^The City of Nashville is (?:still )?under a burn ban[.!]?$/i.test(latest.text)) return [];
  const window = reportWindow(latest.published, now, 30 * DAY);
  if (!window) return [];
  return [{
    ...window,
    fips: "05061", county: "Howard County", state: NASHVILLE.state, scope: NASHVILLE.scope, sourceId: NASHVILLE.id,
    status: "ban", label: "City burn ban in effect", scopeNote: "City of Nashville",
    note: "Nashville reports a city burn ban. Check with the city for the order and its exceptions.",
    since: null, expires: null, checked: now.toISOString(), sourceName: NASHVILLE.sourceName, sourceUrl: NASHVILLE.sourceUrl,
    officialUrl: new URL(`live_feeds/${latest.id}`, NASHVILLE_SITE).href,
  }];
}

export const arNashvilleAlerts: ActiveSource = {
  ...NASHVILLE, mode: "positive-only", coverage: "restrictions", cadence: CADENCE,
  reportingFips: ["05061"], staleMs: 18 * HOUR, keepRowLinks: true,
  async fetch({ now }) {
    const text = await getText(NASHVILLE.sourceUrl, { attempts: 1, maxBytes: 180_000, headers: { accept: "application/json" } });
    return { rows: parseNashvilleAlerts(JSON.parse(text), now) };
  },
};
