import type { CountyStatus } from "../../../shared/types";
import { civicPlusActiveAlerts, civicPlusUrl } from "../lib/civicplus";
import { localClock, parseUsDate, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const alertCenter = civicPlusUrl("https://www.mountainviewmo.gov", "alerts");
const publisher = {
  id: "mo-mountain-view-alerts", state: "MO", scope: "part", stack: "CivicPlus / Alert Center",
  sourceName: "City of Mountain View", sourceUrl: alertCenter, officialUrl: alertCenter,
} as const;

export async function parseMountainViewAlerts(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const alerts = await civicPlusActiveAlerts(input, alertCenter);
  const bans = alerts.filter(({ title }) => /^(?:citywide )?burn ban(?: in effect)?$/i.test(title));
  if (!bans.length) return [];
  if (bans.length !== 1) throw new Error("Mountain View: ambiguous active burn alerts");

  const { text, url } = bans[0];
  const date = /^As of (\d{1,2}-\d{1,2}-\d{4}) a burn ban is in (?:effect|affect) until further notice\./i.exec(text)?.[1];
  const since = date && parseUsDate(date);
  if (!since || since > localClock(now, US_ZONES.Central).date ||
      /\b(?:lifted|rescinded|expired|cancelled|canceled|test)\b/i.test(text)) {
    throw new Error("Mountain View: unverified burn ban text");
  }
  return [{
    fips: "29091", county: "Howell County", state: publisher.state, sourceId: publisher.id,
    scope: publisher.scope, scopeNote: "City of Mountain View",
    status: "ban", label: "City burn ban", since, expires: null, sourceUpdated: null, checked: now.toISOString(),
    sourceName: publisher.sourceName, sourceUrl: publisher.sourceUrl, officialUrl: url,
    note: "The city lists a burn ban until further notice. Confirm the affected activities and exceptions with the city.",
  }];
}

export const moMountainView: ActiveSource = {
  ...publisher, coverage: "restrictions", mode: "positive-only", keepRowLinks: true,
  cadence: { kind: "hourly" },
  staleMs: 6 * 60 * 60 * 1000,
  async fetch({ now }) {
    const reply = await fetchSource(publisher.sourceUrl, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected Mountain View 304");
    return { rows: await parseMountainViewAlerts(reply.response, now) };
  },
};
