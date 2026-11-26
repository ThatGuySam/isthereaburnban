import { countyStatusBulletin, namedStatusRows, scopedStatusBulletin } from "../lib/county-bulletin";
import { atLocalTime, localClock, parseUsDate, reportWindow, US_ZONES } from "../lib/dates";
import { extractHtml, htmlStatusBlocks } from "../lib/html";

const zone = US_ZONES.Arizona;
const daily = { kind: "daily", zone, hours: [8, 16] } as const;
const pollGroup = "az-county-daily";
const dayMs = 86_400_000;
const countyGroup = "Yavapai County (unincorporated areas)";
const zones = ["Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5"] as const;

function restrictionStage(text: string) {
  if (text === "None" || text === "Stage 0") return;
  if (/^Stage [1-3]$/.test(text)) return text;
  throw new Error(`Unrecognized Arizona local fire stage: ${text}`);
}

export const azFlagstaffFireStages = countyStatusBulletin({
  id: "az-flagstaff-fire-stages", state: "AZ", county: "Coconino", stack: "CivicPlus / HTML",
  sourceName: "Flagstaff Fire Department",
  sourceUrl: "https://flagstaff.az.gov/2981/Fire-Restriction-Stages",
  officialUrl: "https://flagstaff.az.gov/2981/Fire-Restriction-Stages",
  scopeNote: "City of Flagstaff", cadence: daily, pollGroup, staleMs: dayMs * 1.5,
  async read(input) {
    const messages = await htmlStatusBlocks(input, "#divEditor885613f5-9552-4478-9ac3-6a0e89aa039a .fr-view", "p");
    const prefix = "The City of Flagstaff is currently in ";
    const [message, ...duplicates] = messages.filter((text) => text.startsWith(prefix));
    const stageText = message?.match(/^The City of Flagstaff is currently in (Stage \d+) Fire Restrictions\.$/)?.[1];
    if (!stageText || duplicates.length) throw new Error("Missing or ambiguous Flagstaff current fire stage");
    const stage = restrictionStage(stageText);
    if (!stage) return;
    return {
      status: "restricted", label: `${stage} fire restrictions`,
      note: "Flagstaff's city restrictions limit open burn permit issuance and other activities. See the city stage table and separate weather restrictions.",
    };
  },
});

export const azYavapaiFireZones = scopedStatusBulletin({
  id: "az-yavapai-fire-zones", state: "AZ", counties: ["Yavapai"], stack: "OpenCities / HTML status roster",
  sourceName: "Yavapai County Emergency Management",
  sourceUrl: "https://www.yavapaiready.gov/Community-Resources/Outdoor-Fire-Ordinance",
  officialUrl: "https://www.yavapaiready.gov/Community-Resources/Outdoor-Fire-Ordinance",
  cadence: daily, pollGroup, staleMs: dayMs * 1.5,
  async read(input, now) {
    const isStamp = ({ text }: { text: string }) => text.startsWith("Current Restriction Status:");
    const parts = await extractHtml(input, { tableHeading: isStamp });
    const [stamp, ...otherStamps] = parts.blocks.filter(isStamp);
    const updated = stamp?.text.match(/^Current Restriction Status: Updated (.+)$/)?.[1];
    const sourceUpdated = updated && parseUsDate(updated);
    const [table, ...others] = parts.tables.filter(({ heading }) => heading === stamp?.text);
    const [header, group, ...rows] = table?.rows ?? [];
    if (!sourceUpdated || sourceUpdated > localClock(now, zone).date || otherStamps.length || others.length ||
      header?.join("|") !== "Jurisdiction|Current Stage|Planned Changes" || group?.[0] !== countyGroup ||
      rows[zones.length]?.[0]?.startsWith("Zone ")) {
      throw new Error("Missing or changed Yavapai County fire status roster");
    }
    const stages = namedStatusRows(rows.slice(0, zones.length), zones, 3);
    return [...stages].flatMap(([name, [value]]) => {
      const stage = restrictionStage(value);
      if (!stage) return [];
      const window = reportWindow(atLocalTime(sourceUpdated, 0, zone), now, 45 * dayMs);
      if (!window) throw new Error("Yavapai County active fire stages need a newer update");
      return [{
        county: "Yavapai", status: "restricted" as const, sourceUpdated, validUntil: window.validUntil,
        scopeNote: `Unincorporated Yavapai County, ${name}, within county jurisdiction`,
        label: `${stage} fire restrictions`,
        note: "Yavapai County reports a current stage for this outdoor fire ordinance zone. Incorporated areas, state and federal lands, and tribal lands have separate authorities.",
      }];
    });
  },
});
