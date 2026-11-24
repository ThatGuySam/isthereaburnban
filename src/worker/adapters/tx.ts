import type { CountyStatus } from "../../shared/types";
import { type Adapter, type ArcgisResponse, arcgisRows, arcgisUrl, byPublisherFips, completeLayer, countyByName, publisherDate, str, toStatuses } from "./common";
import { fetchSource } from "../sources/lib/http";
import { parseLocalDateTime, US_ZONES } from "../sources/lib/dates";
import { countiesInState } from "../counties";

const LAYER = "https://gis.tfs.tamu.edu/arcgis/rest/services/EOC/BurnBan/FeatureServer/0";
const BAN_LABEL = "County burn ban (unincorporated areas)";
const TXT_URL = "https://tfsfrp.tamu.edu/WILDFIRES/BURNBAN.txt";
const FIELDS = ["County", "FIPS", "BurnBan", "StartDate"];
const MAX_BULLETIN_AGE_MS = 36 * 3_600_000;
const meta = {
  state: "TX",
  sourceName: "Texas A&M Forest Service",
  sourceUrl: arcgisUrl(LAYER, FIELDS),
  officialUrl: "https://tfsweb.tamu.edu/wildfire-and-other-disasters/burn-bans-and-information/",
};

export function parse(json: ArcgisResponse, checked: string): CountyStatus[] {
  const rows = arcgisRows(json, { requireComplete: true }).map((a) => {
    const code = str(a.BurnBan);
    if (code !== "Yes" && code !== "No") throw new Error(`TX: unrecognized burn ban code ${code}`);
    const yes = code === "Yes";
    const start = publisherDate("TX", a.StartDate, !yes);
    return {
      county: byPublisherFips("TX", "48", a.County, a.FIPS),
      status: yes ? ("ban" as const) : ("none" as const),
      label: yes ? BAN_LABEL : "No county burn ban reported",
      scopeNote: yes ? "Unincorporated areas" : undefined,
      since: yes ? start : null,
      validFrom: yes ? start ?? undefined : undefined,
    };
  });
  return toStatuses(meta, rows, checked, true);
}

/** BURNBAN.txt: UTF-16LE, header "82 Texas Burn Bans - 11/23/2026 10:52:12 AM", then one county name per line. */
export function parseTxt(buf: ArrayBuffer, checked: string): CountyStatus[] {
  const text = new TextDecoder("utf-16le").decode(buf).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines.shift() ?? "";
  const m = header.match(/^(\d+)\s+Texas Burn Bans\s*-\s*(.+)$/i);
  if (!m) throw new Error("TX txt: unexpected header");
  const sourceUpdated = parseLocalDateTime(m[2], US_ZONES.Central);
  const invalidDate = "TX txt: stale, future or invalid bulletin date";
  if (!sourceUpdated) throw new Error(invalidDate);
  const age = Date.parse(checked) - Date.parse(sourceUpdated);
  if (!Number.isFinite(age) || age < 0 || age >= MAX_BULLETIN_AGE_MS) throw new Error(invalidDate);
  const banned = new Set<string>();
  for (const name of lines) {
    const county = countyByName("TX", name);
    if (!county) throw new Error(`TX txt: unrecognized county ${name}`);
    if (banned.has(county.fips)) throw new Error(`TX txt: duplicate county ${name}`);
    banned.add(county.fips);
  }
  if (banned.size !== Number(m[1])) throw new Error(`TX txt: header says ${m[1]} bans, matched ${banned.size}`);
  const validUntil = new Date(Date.parse(sourceUpdated) + MAX_BULLETIN_AGE_MS).toISOString();
  const rows = countiesInState("TX").map((c) => ({
    county: c,
    status: banned.has(c.fips) ? ("ban" as const) : ("none" as const),
    label: banned.has(c.fips) ? BAN_LABEL : "No county burn ban reported",
    scopeNote: banned.has(c.fips) ? "Unincorporated areas" : undefined,
    sourceUpdated,
    validUntil,
  }));
  return toStatuses({ ...meta, sourceUrl: TXT_URL, officialUrl: TXT_URL }, rows, checked, true);
}

export const tx: Adapter = {
  id: "tx",
  mode: "full",
  keepRowLinks: true,
  ...meta,
  async fetch(now = new Date()) {
    const checked = now.toISOString();
    try {
      return parse(await completeLayer(LAYER, FIELDS), checked);
    } catch (err) {
      try {
        const reply = await fetchSource(TXT_URL, { headers: { accept: "text/plain" } });
        if (reply.notModified) throw new Error("unexpected 304");
        return parseTxt(await reply.response.arrayBuffer(), checked);
      } catch (fallback) {
        throw new Error(`TX ArcGIS failed (${String(err)}); text failed (${String(fallback)})`);
      }
    }
  },
};

