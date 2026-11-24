import type { CountyStatus } from "../../shared/types";
import { type Adapter, type ArcgisResponse, arcgisRows, arcgisUrl, countyByName, getJson, str, toStatuses } from "./common";

const LAYER = "https://services.arcgis.com/vPD5PVLI6sfkZ5E4/arcgis/rest/services/Active_Burn_Bans_%28View%29/FeatureServer/0";
const meta = {
  state: "IA",
  sourceName: "Iowa State Fire Marshal",
  sourceUrl: arcgisUrl(LAYER, ["County", "Active_Burn_Ban", "proc_url"]),
  officialUrl:
    "https://dps.iowa.gov/divisions-iowa-department-public-safety/iowa-state-fire-marshal-division/state-fire-marshal-division-general-information",
};

/** Positive-only: "yes" is an active ban; anything else (lift, null) means we can't say. */
export function parse(json: ArcgisResponse, checked: string): CountyStatus[] {
  const rows = arcgisRows(json).map((a) => {
    const yes = str(a.Active_Burn_Ban).toLowerCase() === "yes";
    const proc = str(a.proc_url);
    return {
      county: countyByName("IA", str(a.County)),
      status: yes ? ("ban" as const) : ("unknown" as const),
      label: yes ? "State Fire Marshal burn ban" : "No active ban listed; we can't confirm there is none",
      officialUrl: yes && /^https?:\/\//.test(proc) ? proc : undefined,
    };
  });
  return toStatuses(meta, rows, checked);
}

export const ia: Adapter = {
  id: "ia",
  mode: "positive-only",
  keepRowLinks: true,
  ...meta,
  async fetch(now = new Date()) {
    return parse(await getJson(meta.sourceUrl), now.toISOString());
  },
};
