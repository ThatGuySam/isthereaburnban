import type { BanStatus, CountyStatus } from "../../shared/types";
import { type Adapter, type ArcgisResponse, arcgisRows, arcgisUrl, countyByName, getJson, msToIso, str, toStatuses } from "./common";

const LAYER = "https://services3.arcgis.com/yrIZ0Nv0mSGTWJsH/arcgis/rest/services/OklahomaBurnBan__Data_Layer__v_9_0__View/FeatureServer/0";
const meta = {
  state: "OK",
  sourceName: "Oklahoma Forestry Services",
  sourceUrl: arcgisUrl(LAYER, ["county_nam", "Burn_Ban_Status", "EditDate"]),
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
  const rows = arcgisRows(json).map((a) => ({
    county: countyByName("OK", str(a.county_nam)),
    ...classify(str(a.Burn_Ban_Status)),
    sourceUpdated: msToIso(a.EditDate),
  }));
  return toStatuses(meta, rows, checked);
}

export const ok: Adapter = {
  id: "ok",
  mode: "full",
  ...meta,
  async fetch() {
    return parse(await getJson(meta.sourceUrl), new Date().toISOString());
  },
};
