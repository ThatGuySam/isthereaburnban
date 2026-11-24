import type { CountyStatus } from "../../shared/types";
import { type Adapter, type ArcgisResponse, arcgisRows, arcgisUrl, byFips, countyByName, getJson, msToIso, str, toStatuses } from "./common";
import { fetchSource } from "../sources/lib/http";
import { countiesInState } from "../counties";

const LAYER = "https://gis.tfs.tamu.edu/arcgis/rest/services/EOC/BurnBan/FeatureServer/0";
const BAN_LABEL = "County burn ban (unincorporated areas)";
const TXT_URL = "https://tfsfrp.tamu.edu/WILDFIRES/BURNBAN.txt";
const meta = {
  state: "TX",
  sourceName: "Texas A&M Forest Service",
  sourceUrl: arcgisUrl(LAYER, ["County", "FIPS", "BurnBan", "StartDate"]),
  officialUrl: "https://tfsweb.tamu.edu/wildfire-and-other-disasters/burn-bans-and-information/",
};

export function parse(json: ArcgisResponse, checked: string): CountyStatus[] {
  const rows = arcgisRows(json).map((a) => {
    const code = str(a.FIPS).padStart(3, "0");
    const yes = str(a.BurnBan).toLowerCase() === "yes";
    const no = str(a.BurnBan).toLowerCase() === "no";
    return {
      county: byFips(`48${code}`) ?? countyByName("TX", str(a.County)),
      status: yes ? ("ban" as const) : no ? ("none" as const) : ("unknown" as const),
      label: yes ? BAN_LABEL : no ? "No county burn ban reported" : "Not reported",
      scopeNote: yes ? "Unincorporated areas" : undefined,
      since: yes ? msToIso(a.StartDate) : null,
    };
  });
  return toStatuses(meta, rows, checked);
}

/** BURNBAN.txt: UTF-16LE, header "82 Texas Burn Bans - 11/23/2026 10:52:12 AM", then one county name per line. */
export function parseTxt(buf: ArrayBuffer, checked: string): CountyStatus[] {
  const text = new TextDecoder("utf-16le").decode(buf).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines.shift() ?? "";
  const m = header.match(/^(\d+)\s+Texas Burn Bans\s*-\s*(.+)$/i);
  if (!m) throw new Error("TX txt: unexpected header");
  const stamp = new Date(`${m[2]} CST`);
  const sourceUpdated = Number.isNaN(stamp.getTime()) ? null : stamp.toISOString();
  const banned = new Set(lines.map((l) => countyByName("TX", l)?.fips).filter(Boolean));
  if (banned.size !== Number(m[1])) throw new Error(`TX txt: header says ${m[1]} bans, matched ${banned.size}`);
  const rows = countiesInState("TX").map((c) => ({
    county: c,
    status: banned.has(c.fips) ? ("ban" as const) : ("none" as const),
    label: banned.has(c.fips) ? BAN_LABEL : "No county burn ban reported",
    scopeNote: banned.has(c.fips) ? "Unincorporated areas" : undefined,
    sourceUpdated,
  }));
  return toStatuses({ ...meta, sourceUrl: TXT_URL }, rows, checked);
}

export const tx: Adapter = {
  id: "tx",
  mode: "full",
  ...meta,
  async fetch() {
    const checked = new Date().toISOString();
    try {
      return parse(await getJson(meta.sourceUrl), checked);
    } catch (err) {
      const reply = await fetchSource(TXT_URL, { headers: { accept: "text/plain" } });
      if (reply.notModified) throw new Error(`TX FeatureServer failed (${String(err)}); unexpected TXT 304`);
      return parseTxt(await reply.response.arrayBuffer(), checked);
    }
  },
};

