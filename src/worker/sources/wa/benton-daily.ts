import { countyByName } from "../../counties";
import { dailyStatusRows, type DailyDecision } from "../lib/daily-status";
import { localClock, parseUsDate, US_ZONES } from "../lib/dates";
import { htmlStatusBlocks } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://bentoncleanair.org/burning/todays-burn-decision/";
const ZONE = US_ZONES.Pacific;
const META = {
  id: "wa-benton-daily-burn-decision", state: "WA", stack: "WordPress / dated burn decision block",
  sourceName: "Benton Clean Air Agency", sourceUrl: URL, officialUrl: URL,
};
const county = countyByName(META.state, "Benton");
if (!county) throw new Error("Missing Benton County");

export async function parseBentonDaily(input: Response, now: Date) {
  const [heading, ...bulletin] = await htmlStatusBlocks(input, "#post-485",
    ".wp-block-rhzm-aqi-burn-date h2, .wp-block-rhzm-aqi-burn-status h3, .wp-block-rhzm-aqi-burn-status p");
  const day = heading && parseUsDate(heading);
  if (!day || day !== localClock(now, ZONE).date) throw new Error("Benton Clean Air: stale or missing burn decision date");
  const pending = /^Unfortunately, a burn decision has not yet been made for (\d{1,2}\/\d{1,2}\/\d{4})\./.exec(bulletin[0]);
  if (pending && bulletin.length === 1 && parseUsDate(pending[1]) === day) return [];

  const decisions: DailyDecision[] = ["Residential", "Agricultural"].map((kind) => {
    const [decision, ...duplicates] = bulletin.filter((text) => text.startsWith(`${kind}:`));
    const match = /^(?:Residential|Agricultural): (No Burn Day|Burn Day)\.?$/i.exec(decision);
    if (!match || duplicates.length) throw new Error(`Benton Clean Air: unknown ${kind.toLowerCase()} decision`);
    const base = {
      date: day, county: "Benton",
      scopeNote: `${kind} burning regulated by Benton Clean Air Agency`,
    };
    if (match[1].toLowerCase() === "burn day") return { ...base, status: "allowed" };
    return {
      ...base, status: "restricted", label: `${kind} no-burn day`,
      note: "Benton Clean Air Agency reports that covered burning is closed today. Check its decision for exemptions and separate rules for other activities.",
    };
  });
  return dailyStatusRows(META, ZONE, decisions, now);
}

export const waBentonDaily: ActiveSource = {
  ...META, scope: "part", mode: "positive-only", coverage: "restrictions", reportingFips: [county.fips],
  cadence: { kind: "daily", zone: ZONE, hours: [0, 8, 9, 10, 13, 18] }, staleMs: 12 * 3_600_000,
  async fetch({ now }) {
    const reply = await fetchSource(URL, { headers: { accept: "text/html", "cache-control": "no-cache" } });
    if (reply.notModified) throw new Error("Unexpected Benton Clean Air decision 304");
    return { rows: await parseBentonDaily(reply.response, now) };
  },
};
