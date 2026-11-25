import type { BanStatus, CountyStatus } from "../../shared/types";
import { type Adapter, type ArcgisResponse, arcgisRows, arcgisUrl, completeLayer, countyByName, publisherDate, str, toStatuses } from "./common";

const LAYER = "https://services3.arcgis.com/yrIZ0Nv0mSGTWJsH/arcgis/rest/services/OklahomaBurnBan__Data_Layer__v_9_0__View/FeatureServer/0";
const FIELDS = ["county_nam", "Burn_Ban_Status", "EditDate"];
const meta = {
  state: "OK",
  sourceName: "Oklahoma Forestry Services",
  sourceUrl: arcgisUrl(LAYER, FIELDS),
  officialUrl: "https://experience.arcgis.com/experience/8bdc59b2a54a4383a9a2996fb9407580/",
};

export function classify(raw: string): { status: BanStatus; label: string } {
  switch (raw.toLowerCase()) {
    case "none": return { status: "none", label: "No county or governor burn ban reported" };
    case "county burn ban": return { status: "ban", label: "County burn ban" };
    case "governor's burn ban": return { status: "ban", label: "Governor's burn ban" };
    case "ozone alert": return { status: "restricted", label: "Ozone alert" };
    default: return { status: "unknown", label: raw || "Not reported" };
  }
}

export function parse(json: ArcgisResponse, checked: string): CountyStatus[] {
  const rows = arcgisRows(json, { requireComplete: true }).map((a) => {
    const decision = classify(str(a.Burn_Ban_Status));
    if (decision.status === "unknown") throw new Error(`OK: unrecognized burn ban code ${decision.label}`);
    return { county: countyByName("OK", str(a.county_nam)), ...decision, sourceUpdated: publisherDate("OK", a.EditDate) };
  });
  return toStatuses(meta, rows, checked, true);
}

export const ok: Adapter = {
  id: "ok",
  mode: "full",
  ...meta,
  async fetch(now = new Date()) {
    return parse(await completeLayer(LAYER, FIELDS), now.toISOString());
  },
};
