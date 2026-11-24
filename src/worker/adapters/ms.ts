import type { CountyStatus } from "../../shared/types";
import { ninjaTablesUrl } from "../sources/lib/wordpress";
import { countiesInState } from "../counties";
import { type Adapter, countyByName, getJson, toStatuses } from "./common";

const meta = {
  state: "MS",
  sourceName: "Mississippi Forestry Commission",
  sourceUrl: ninjaTablesUrl("https://www.mfc.ms.gov", 1775),
  officialUrl: "https://www.mfc.ms.gov/burning-info/burn-bans/",
};

export type MsRow = { value: { counties?: string; issued?: string; expires?: string; exemptions?: string } };

/** "12/30/26" -> "2026-12-30"; null when malformed (the table has typos like "1214/26"). */
export function msDate(raw: string | undefined): string | null {
  const m = (raw ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** Today's date in Mississippi (US Central), as YYYY-MM-DD. */
export function centralDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(now);
}

export function parse(data: MsRow[], checked: string, today = centralDate(new Date(checked))): CountyStatus[] {
  if (!Array.isArray(data)) throw new Error("MS: expected an array");
  const bans = new Map<string, { since: string | null; expires: string | null; exemptions: string }>();
  for (const r of data) {
    const v = r?.value ?? {};
    const expires = msDate(v.expires);
    if (expires && expires < today) continue; // expired listing
    for (const name of (v.counties ?? "").split(/,|\band\b|&/)) {
      const c = countyByName("MS", name.trim());
      if (c) bans.set(c.fips, { since: msDate(v.issued), expires, exemptions: (v.exemptions ?? "").trim() });
    }
  }
  const rows = countiesInState("MS").map((c) => {
    const b = bans.get(c.fips);
    if (!b) return { county: c, status: "none" as const, label: "No county burn ban listed" };
    const ex = b.exemptions && !/^no exemptions?$/i.test(b.exemptions) ? `Exemptions: ${b.exemptions} (see the official page for what each number covers).` : "No exemptions listed.";
    return {
      county: c,
      status: "ban" as const,
      label: "County burn ban",
      since: b.since,
      expires: b.expires,
      note: ex,
    };
  });
  return toStatuses(meta, rows, checked);
}

export const ms: Adapter = {
  id: "ms",
  mode: "full",
  ...meta,
  async fetch() {
    return parse(await getJson<MsRow[]>(meta.sourceUrl), new Date().toISOString());
  },
};
