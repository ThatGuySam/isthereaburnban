import type { BanStatus, CountyStatus } from "../../shared/types";
import { type Adapter, type ArcgisResponse, arcgisRows, arcgisUrl, completeLayer, countyByName, publisherDate, str, toStatuses } from "./common";

const LAYER = "https://services3.arcgis.com/XYg2eF8UuxZVuVmF/arcgis/rest/services/Burn_Ban_Public_View_v2_4118cfe50dba49efa3d6fa7326d5a87f/FeatureServer/0";
const FIELDS = ["NAME", "Burn_Ban", "Fireworks_Ban", "DateUpdated"];
const meta = {
  state: "FL",
  sourceName: "Florida Forest Service",
  sourceUrl: arcgisUrl(LAYER, FIELDS),
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
  const rows = arcgisRows(json, { requireComplete: true }).map((a) => {
    const fireworks = str(a.Fireworks_Ban).toUpperCase();
    if (fireworks !== "YES" && fireworks !== "NO") throw new Error(`FL: unrecognized fireworks code ${fireworks}`);
    const decision = classify(str(a.Burn_Ban));
    if (decision.status === "unknown") throw new Error(`FL: unrecognized burn ban code ${decision.label}`);
    return {
      county: countyByName("FL", str(a.NAME)),
      ...decision,
      standing: decision.status === "restricted" ? true as const : undefined,
      scopeNote: decision.status === "restricted" ? "Yard debris burning" : undefined,
      sourceUpdated: publisherDate("FL", a.DateUpdated, true),
      note: fireworks === "YES" ? "This county also has a fireworks ban." : undefined,
    };
  });
  return toStatuses(meta, rows, checked, true);
}

export const fl: Adapter = {
  id: "fl",
  mode: "full",
  ...meta,
  async fetch(now = new Date()) {
    return parse(await completeLayer(LAYER, FIELDS), now.toISOString());
  },
};
