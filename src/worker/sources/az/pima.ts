import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { civicPlusAlertDetails } from "../lib/civicplus";
import { US_ZONES } from "../lib/dates";
import { blockAfterHeading, extractHtml, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://www.pima.gov/wildfire-warnings";
const META = {
  id: "az-pima-wildfire", state: "AZ", scope: "part", stack: "CivicPlus / emergency alert widget",
  sourceName: "Pima County Office of Emergency Management", sourceUrl: URL, officialUrl: URL,
} satisfies Pick<ActiveSource, "id" | "state" | "scope" | "stack" | "sourceName" | "sourceUrl" | "officialUrl">;

export function parsePimaWildfire(parts: HtmlParts, now: Date): CountyStatus[] {
  const details = civicPlusAlertDetails(parts, /^Current Fire Restrictions Status$/i);
  const scope = blockAfterHeading(parts.blocks, /^Fire Restrictions$/i);
  if (!scope.some(({ text }) => /Pima County fire restrictions apply to County-owned property\b/i.test(text))) {
    throw new Error("Pima wildfire bulletin: expected County-owned property scope");
  }
  if (details.length !== 1) throw new Error("Pima wildfire bulletin: expected one alert message");

  const message = details[0];
  const clear = /^There are currently no fire restrictions in effect[.!](?: Always use caution with any activity that could start a wildfire[.!])?$/i.test(message);
  const stage = (/^Stage (1|2|I|II) fire restrictions are (?:currently )?in effect[.!]$/i.exec(message) ??
    /^There are currently Stage (1|2|I|II) fire restrictions in effect[.!]$/i.exec(message))?.[1].toUpperCase();
  if (!clear && !stage) throw new Error("Pima wildfire bulletin: unrecognized alert message");

  const county = countyByName(META.state, "Pima");
  if (!county) throw new Error("Pima County is missing from the county list");
  return [{
    state: META.state, scope: META.scope, sourceId: META.id, county: county.name, fips: county.fips,
    sourceName: META.sourceName, sourceUrl: URL, officialUrl: URL,
    status: stage ? "restricted" : "unknown", scopeNote: "Pima County-owned property",
    label: stage ? `Stage ${stage} fire restrictions` : "County-owned property advisory",
    note: clear
      ? "Pima County’s bulletin reports no active fire restrictions on County-owned property. Check the fire authority or land manager for your location."
      : "Pima County’s bulletin reports an active stage on County-owned property. Check the bulletin for restrictions and exceptions.",
    checked: now.toISOString(), sourceUpdated: null, since: null, expires: null,
  }];
}

export const azPimaWildfire: ActiveSource = {
  ...META,
  coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Arizona, hours: [0, 8, 16] },
  staleMs: 24 * 3_600_000,
  async fetch({ now }) {
    const reply = await fetchSource(URL, { headers: { accept: "text/html" } });
    if (reply.notModified) throw new Error("Unexpected Pima wildfire bulletin 304");
    return { rows: parsePimaWildfire(await extractHtml(reply.response), now) };
  },
};
