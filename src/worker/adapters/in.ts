import type { BanStatus, CountyStatus } from "../../shared/types";
import { type Adapter, type ArcgisResponse, type Row, arcgisRows, arcgisUrl, completeLayer, countyByName, publisherDate, str, toStatuses } from "./common";

const LAYER = "https://services8.arcgis.com/mRWfR9ONMmLivkAh/arcgis/rest/services/WebEOC_prod_BurnBans/FeatureServer/0";
const FIELDS = ["orginating_county", "countyburnbanstatus", "burnbandatetime"];
const meta = {
  state: "IN",
  sourceName: "Indiana Department of Homeland Security",
  sourceUrl: arcgisUrl(LAYER, FIELDS),
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
  let seenPokagon = false;
  const rows = arcgisRows(json, { requireComplete: true }).flatMap((a): Row[] => {
    const name = str(a.orginating_county);
    const c = classify(str(a.countyburnbanstatus));
    if (c.status === "unknown") throw new Error(`IN: unrecognized burn ban code ${c.label}`);
    const reported = publisherDate("IN", a.burnbandatetime);
    // WebEOC also lists the Pokagon Band, whose reports aren't countywide decisions.
    if (name === "Pokagon Band") {
      if (seenPokagon) throw new Error("IN: duplicate Pokagon Band report");
      seenPokagon = true;
      return [];
    }
    const county = countyByName("IN", name);
    const scopeNote = `part of ${county?.name ?? "the county"} (area unspecified)`;
    return [{
      county,
      ...c,
      ...(c.status === "restricted" ? { scope: "part" as const, scopedBan: true as const, scopeNote, label: `Burn ban in ${scopeNote}` } : {}),
      sourceUpdated: reported,
      note: "Fire chiefs, cities and towns can issue their own restrictions.",
    }];
  });
  return toStatuses(meta, rows, checked, true);
}

export const in_: Adapter = {
  id: "in",
  mode: "full",
  ...meta,
  async fetch(now = new Date()) {
    return parse(await completeLayer(LAYER, FIELDS), now.toISOString());
  },
};
