import type { BanStatus, CountyStatus } from "../../shared/types";
import { type Adapter, type ArcgisResponse, arcgisRows, arcgisUrl, byPublisherFips, completeLayer, publisherDate, str, toStatuses } from "./common";

const LAYER = "https://services3.arcgis.com/uymqJ6hE4wvB3E9t/arcgis/rest/services/Burn_Ban1/FeatureServer/3";
const FIELDS = ["Parish1", "Prsh_Fips1", "Burn_Ban1", "EditDate"];
const meta = {
  state: "LA",
  sourceName: "Louisiana Department of Agriculture and Forestry",
  sourceUrl: arcgisUrl(LAYER, FIELDS),
  officialUrl: "https://www.ldaf.la.gov/land/fire/safety",
};

/** Seen values: "Burn Ban", "none", null. */
export function classify(raw: string): { status: BanStatus; label: string } {
  switch (raw.toLowerCase()) {
    case "none": return { status: "none", label: "No parish burn ban reported" };
    case "burn ban": return { status: "ban", label: "Parish burn ban" };
    default: return { status: "unknown", label: raw || "Not reported" };
  }
}

export function parse(json: ArcgisResponse, checked: string): CountyStatus[] {
  const rows = arcgisRows(json, { requireComplete: true }).map((a) => {
    const decision = classify(str(a.Burn_Ban1));
    if (decision.status === "unknown" && a.Burn_Ban1 !== null) throw new Error(`LA: unrecognized burn ban code ${decision.label}`);
    return {
      county: byPublisherFips("LA", "22", a.Parish1, a.Prsh_Fips1),
      ...decision,
      sourceUpdated: publisherDate("LA", a.EditDate),
    };
  });
  return toStatuses(meta, rows, checked, true);
}

export const la: Adapter = {
  id: "la",
  mode: "full",
  ...meta,
  async fetch(now = new Date()) {
    return parse(await completeLayer(LAYER, FIELDS), now.toISOString());
  },
};
