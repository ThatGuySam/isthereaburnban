import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const PATH = "/en/dept/local-services/governance-leadership/local-government-for-unincorporated-king-county/fire-safety";
const URL = `https://kingcounty.gov${PATH}`;
const META = {
  id: "wa-king-fire-safety", state: "WA", scope: "part", stack: "Sitecore / HTML",
  // The county's public content delivery host serves the same current page and accepts Worker's TLS client.
  sourceName: "King County Fire Marshal", sourceUrl: `https://cd.kingcounty.gov${PATH}`, officialUrl: URL,
} as const;

export function parseKingFireSafety({ blocks }: HtmlParts, now: Date): CountyStatus[] {
  const heading = /^Current status$/i;
  const current = blocks.filter(({ tag, text }) => /^h[1-6]$/.test(tag) && heading.test(text));
  if (current.length !== 1 || current[0].tag !== "h2" ||
      !blocks.some(({ tag, text }) => tag === "p" && /Fire Safety Burn Bans for unincorporated King County\b/i.test(text))) {
    throw new Error("King County: missing current status or jurisdiction");
  }
  const [first] = blockAfterHeading(blocks, heading);
  const clear = first?.tag === "p" && first.text === "No Fire Safety Burn Ban";
  const stage = first?.tag === "p" && /^Stage (1|2) Fire Safety Burn Ban$/i.exec(first.text)?.[1];
  if (!clear && !stage) throw new Error("King County: unrecognized fire safety status");

  const county = countyByName("WA", "King");
  if (!county) throw new Error("King County is missing from the county list");
  return [{
    state: META.state, sourceId: META.id, scope: META.scope, county: county.name, fips: county.fips,
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: URL,
    scopeNote: "Fire safety in unincorporated King County",
    status: stage === "2" ? "ban" : stage === "1" ? "restricted" : "unknown",
    label: stage ? `Stage ${stage} fire safety burn ban` : "No current King County fire safety ban",
    note: stage === "2"
      ? "The fire marshal prohibits outdoor fires in unincorporated King County, with exceptions for certain cooking and heating devices."
      : stage === "1"
        ? "Debris and land-clearing burning are prohibited in unincorporated King County. Qualifying recreational fires have separate rules."
        : "The fire marshal reports no active fire safety burn ban in unincorporated King County. Standing outdoor burning rules still apply.",
    checked: now.toISOString(), since: null, expires: null, sourceUpdated: null,
  }];
}

export const waKingFireSafety: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  pollGroup: "wa-county-fire-safety",
  cadence: { kind: "daily", zone: US_ZONES.Pacific, hours: [0, 8, 16] },
  staleMs: 24 * 3_600_000,
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, { headers: { accept: "text/html", "cache-control": "no-cache" } });
    if (reply.notModified) throw new Error("Unexpected King County status 304");
    return { rows: parseKingFireSafety(await extractHtml(reply.response), now) };
  },
};
