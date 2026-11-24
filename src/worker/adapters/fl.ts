import type { BanStatus, CountyStatus } from "../../shared/types";
import { type Adapter, type ArcgisResponse, arcgisRows, arcgisUrl, countyByName, getJson, msToIso, str, toStatuses } from "./common";

const LAYER = "https://services3.arcgis.com/XYg2eF8UuxZVuVmF/arcgis/rest/services/Burn_Ban_Public_View_v2_4118cfe50dba49efa3d6fa7326d5a87f/FeatureServer/0";
const meta = {
  state: "FL",
  sourceName: "Florida Forest Service",
  sourceUrl: arcgisUrl(LAYER, ["NAME", "Burn_Ban", "Fireworks_Ban", "DateUpdated"]),
  officialUrl: "https://www.fdacs.gov/CurrentWildfireInfo",
};

/** Seen values (2026-11-23): "No Burn Ban", "Yard Debris". Yard Debris = county prohibits yard-debris burning only. */
export function classify(raw: string): { status: BanStatus; label: string } {
  switch (raw.toLowerCase()) {
    case "no burn ban": return { status: "none", label: "No county burn ban reported" };
    case "burn ban": return { status: "ban", label: "County burn ban" };
    case "yard debris": return { status: "restricted", label: "Yard debris burning prohibited" };
    default: return { status: "unknown", label: raw || "Not reported" };
  }
}

export function parse(json: ArcgisResponse, checked: string): CountyStatus[] {
  const rows = arcgisRows(json).map((a) => {
    const fireworks = str(a.Fireworks_Ban).toUpperCase() === "YES";
    const decision = classify(str(a.Burn_Ban));
    return {
      county: countyByName("FL", str(a.NAME)),
      ...decision,
      standing: decision.status === "restricted" ? true as const : undefined,
      scopeNote: decision.status === "restricted" ? "Yard debris burning" : undefined,
      sourceUpdated: msToIso(a.DateUpdated),
      note: fireworks ? "This county also has a fireworks ban." : undefined,
    };
  });
  return toStatuses(meta, rows, checked);
}

export const fl: Adapter = {
  id: "fl",
  mode: "full",
  ...meta,
  async fetch() {
    return parse(await getJson(meta.sourceUrl), new Date().toISOString());
  },
};
