import { arcgisRows, arcgisUrl, msToIso } from "../lib/arcgis";
import type { DailyDecision } from "../lib/daily-status";
import { localClock, parseUsDate } from "../lib/dates";
import { californiaDailySource, PACIFIC, winterWoodSmokeSeason } from "./daily";

const placerUrl = "https://www.placerair.org/1671/Burn-Days";
const placerLayer = "https://services9.arcgis.com/NENkjkswKTzMfG3A/arcgis/rest/services/Burn_Day_Status_Public/FeatureServer/0";
const placerAreas = new Map([
  ["Lake Tahoe", "North Shore of Lake Tahoe in Placer County"],
  ["City of Auburn", "City of Auburn"],
  ["Granite Bay/Loomis (SPFD)", "South Placer Fire District in Granite Bay and Loomis"],
  ["Eastern Placer County", "CAL FIRE areas east of Cisco Grove outside separately listed zones"],
  ["Western Placer County", "CAL FIRE areas west of Cisco Grove outside separately listed zones"],
  ["Eastern Placer County (TFD)", "Truckee Fire District in eastern Placer County"],
]);
const placerCities = new Set(["City of Lincoln", "City of Rocklin", "City of Roseville"]);
const placerHours = new Map([
  ["2-daylight", "daylight hours"],
  ["3-dark", "8 a.m. to dark"],
  ["4-8to6", "8 a.m. to 6 p.m."],
  ["5-8to5", "8 a.m. to 5 p.m."],
]);

function placerDecision(stamp: unknown, code: unknown, area: string): DailyDecision {
  const instant = msToIso(stamp);
  if (!instant) throw new Error("Placer: missing burn decision date");
  const { date, minute } = localClock(new Date(instant), PACIFIC);
  if (minute !== 0 || !instant.endsWith(":00.000Z")) throw new Error("Placer: burn date is not local midnight");
  const base = { date, county: "Placer", scopeNote: `${area}, residential open burning` };
  if (code === "9-pending") return { ...base, status: "pending" };
  if (code === "1-unrestricted") return { ...base, status: "allowed" };
  if (code === "6-noburn" || code === "7-suspended") {
    return {
      ...base, status: "ban", label: code === "7-suspended" ? "Residential burning suspended" : "Residential no-burn day",
      note: "The Placer County Air Pollution Control District map lists no residential open burning for this area and date.",
    };
  }
  const hours = typeof code === "string" ? placerHours.get(code) : undefined;
  if (!hours) throw new Error("Placer: unrecognized burn status");
  return {
    ...base, status: "restricted", label: `Residential burning limited to ${hours}`,
    note: "Separate fire agency permits and burn requirements may apply. Check the district's address map.",
  };
}

export const placerBurnMap = californiaDailySource({
  publisher: {
    id: "ca-placer-burn-days", stack: "CivicPlus / ArcGIS FeatureServer",
    sourceName: "Placer County Air Pollution Control District", officialUrl: placerUrl,
    sourceUrl: arcgisUrl(placerLayer, ["AreaName", "statusDateToday", "burnStatusToday", "statusDateTomorrow", "burnStatusTomorrow"]),
  },
  counties: ["Placer"], hours: [0, 9, 15, 19], http: { accept: "application/json" },
  async read(input) {
    const records = arcgisRows(await input.json(), { requireComplete: true });
    if (records.length !== placerAreas.size + placerCities.size) throw new Error("Placer: incomplete burn area roster");
    const seen = new Set<string>();
    return records.flatMap((record) => {
      const name = record.AreaName;
      if (typeof name !== "string" || seen.has(name)) throw new Error("Placer: missing or duplicate burn area");
      seen.add(name);
      if (placerCities.has(name)) return [];
      const area = placerAreas.get(name);
      if (!area) throw new Error(`Placer: unknown burn area ${name}`);
      const today = placerDecision(record.statusDateToday, record.burnStatusToday, area);
      // Some zones may not publish a second decision until later in the day.
      if (record.statusDateTomorrow === null && !record.burnStatusTomorrow) return [today];
      return [today, placerDecision(record.statusDateTomorrow, record.burnStatusTomorrow, area)];
    });
  },
});

const southCoastPage = "https://www.aqmd.gov/home/programs/community/community-detail?title=check-before-you-burn";
const southCoastLayer = "https://services2.arcgis.com/I4NVzmfP3kyPvlVg/arcgis/rest/services/Burn_No_Burn_V2/FeatureServer/0";
const southCoastCounties = ["Los Angeles", "Orange", "Riverside", "San Bernardino"];

export const southCoastWoodSmoke = californiaDailySource({
  publisher: {
    id: "ca-south-coast-wood-burning", stack: "ArcGIS FeatureServer",
    sourceName: "South Coast Air Quality Management District", officialUrl: southCoastPage,
    sourceUrl: arcgisUrl(southCoastLayer, ["Burn", "Forecast"]),
  },
  counties: southCoastCounties, hours: [0, 9, 15, 18], http: { accept: "application/json" },
  inSeason: winterWoodSmokeSeason,
  async read(input) {
    const records = arcgisRows(await input.json(), { requireComplete: true });
    const [designation, ...extra] = records.filter(({ Burn }) => Burn !== "Exempt Areas");
    if (!designation || extra.length || !records.some(({ Burn }) => Burn === "Exempt Areas")) {
      throw new Error("South Coast AQMD: changed designation and exemption areas");
    }
    const { Burn, Forecast } = designation;
    const date = typeof Forecast === "string" ? parseUsDate(Forecast) : null;
    if (!date || (Burn !== "Wood Burning Permitted" && Burn !== "Wood Burning Prohibited")) {
      throw new Error("South Coast AQMD: missing date or unrecognized designation");
    }
    return southCoastCounties.map((county) => {
      const base = { date, county, scopeNote: "Nonexempt areas in the South Coast Air Basin, residential wood burning" };
      return Burn === "Wood Burning Permitted" ? { ...base, status: "allowed" } : {
        ...base, status: "ban", label: "Residential wood-burning no-burn day",
        note: "The designation covers fireplaces, wood stoves and outdoor fire pits in the covered basin. Mountain communities above 3,000 feet, the Coachella Valley and High Desert, and qualifying households are exempt.",
      };
    });
  },
});
