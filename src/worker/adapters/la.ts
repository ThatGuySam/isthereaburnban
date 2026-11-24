import type { BanStatus, CountyStatus } from "../../shared/types";
import { type Adapter, type ArcgisResponse, arcgisRows, arcgisUrl, byFips, countyByName, getJson, msToIso, str, toStatuses } from "./common";

const LAYER = "https://services3.arcgis.com/uymqJ6hE4wvB3E9t/arcgis/rest/services/Burn_Ban1/FeatureServer/3";
const meta = {
  state: "LA",
  sourceName: "Louisiana Department of Agriculture and Forestry",
  sourceUrl: arcgisUrl(LAYER, ["Parish1", "Prsh_Fips1", "Burn_Ban1", "EditDate"]),
  officialUrl: "https://www.ldaf.la.gov/land/fire/safety",
};

/** Seen values: "Burn Ban", "none", null. */
export function classify(raw: string): { status: BanStatus; label: string } {
  const v = raw.toLowerCase();
  if (v === "none" || v === "no burn ban") return { status: "none", label: "No burn ban" };
  if (v.includes("ban")) return { status: "ban", label: "Parish burn ban" };
  if (v.includes("restrict")) return { status: "restricted", label: raw };
  return { status: "unknown", label: raw || "Not reported" };
}

export function parse(json: ArcgisResponse, checked: string): CountyStatus[] {
  const rows = arcgisRows(json).map((a) => {
    const code = str(a.Prsh_Fips1);
    return {
      county: (code ? byFips(`22${code.padStart(3, "0")}`) : undefined) ?? countyByName("LA", str(a.Parish1)),
      ...classify(str(a.Burn_Ban1)),
      sourceUpdated: msToIso(a.EditDate),
    };
  });
  return toStatuses(meta, rows, checked);
}

export const la: Adapter = {
  id: "la",
  mode: "full",
  ...meta,
  async fetch() {
    return parse(await getJson(meta.sourceUrl), new Date().toISOString());
  },
};
