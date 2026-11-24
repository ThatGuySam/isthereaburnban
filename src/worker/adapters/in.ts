import type { BanStatus, CountyStatus } from "../../shared/types";
import { type Adapter, type ArcgisResponse, arcgisRows, arcgisUrl, countyByName, getJson, msToIso, str, toStatuses } from "./common";

const LAYER = "https://services8.arcgis.com/mRWfR9ONMmLivkAh/arcgis/rest/services/WebEOC_prod_BurnBans/FeatureServer/0";
const meta = {
  state: "IN",
  sourceName: "Indiana Department of Homeland Security",
  sourceUrl: arcgisUrl(LAYER, ["orginating_county", "countyburnbanstatus", "burnbandatetime"]),
  officialUrl: "https://www.in.gov/dhs/burn-ban-map/",
};

/** Seen values: "No Burn Ban Reported", "Countywide Burn Ban". */
export function classify(raw: string): { status: BanStatus; label: string } {
  switch (raw.toLowerCase()) {
    case "no burn ban reported": return { status: "none", label: "No burn ban reported" };
    case "countywide burn ban": return { status: "ban", label: "Countywide burn ban" };
    case "local burn ban": return { status: "restricted", label: "Local burn ban" };
    default: return { status: "unknown", label: raw || "Not reported" };
  }
}

export function parse(json: ArcgisResponse, checked: string): CountyStatus[] {
  // Non-county rows (e.g. "Pokagon Band") don't match a county and are dropped by toStatuses.
  const rows = arcgisRows(json).map((a) => {
    const county = countyByName("IN", str(a.orginating_county));
    const c = classify(str(a.countyburnbanstatus));
    const scopeNote = `part of ${county?.name ?? "the county"} (area unspecified)`;
    const reported = msToIso(a.burnbandatetime);
    return {
      county,
      ...c,
      ...(c.status === "restricted" ? { scope: "part" as const, scopedBan: true as const, scopeNote, label: `Burn ban in ${scopeNote}` } : {}),
      sourceUpdated: reported,
      note: "Fire chiefs, cities and towns can issue their own restrictions.",
    };
  });
  return toStatuses(meta, rows, checked);
}

export const in_: Adapter = {
  id: "in",
  mode: "full",
  ...meta,
  async fetch() {
    return parse(await getJson(meta.sourceUrl), new Date().toISOString());
  },
};
