import type { CountyStatus } from "../../shared/types";
import { localDayWindow, parseUsDate, US_ZONES } from "../sources/lib/dates";
import { ninjaTablesUrl } from "../sources/lib/wordpress";
import { countiesInState } from "../counties";
import { type Adapter, countyByName, getJson, getText, toStatuses } from "./common";

const TABLE = 1775;
const meta = {
  state: "MS",
  sourceName: "Mississippi Forestry Commission",
  sourceUrl: ninjaTablesUrl("https://www.mfc.ms.gov", TABLE),
  officialUrl: "https://www.mfc.ms.gov/burning-info/burn-bans/",
};

type MsRow = { counties: string; issued: string; expires: string; exemptions: string; ___id___: number };

/** WordPress renders a separate row identifier for each record in the commission's table. */
export function msEditionIds(html: string): Set<number> {
  const table = new RegExp(`<table\\b[^>]*\\bid="footable_${TABLE}"[^>]*>`, "g");
  const styles = new RegExp(`<style\\b[^>]*\\bid="ninja_table_custom_css_${TABLE}"[^>]*>([\\s\\S]*?)</style>`, "g");
  const blocks = [...html.matchAll(styles)];
  if ([...html.matchAll(table)].length !== 1 || blocks.length !== 1) throw new Error("MS: unexpected burn ban table identity");
  const marker = new RegExp(`#footable_${TABLE}\\.ninja_footable\\.ninja_table_pro tbody tr\\.nt_row_id_(\\d+)\\s*\\{`, "g");
  const ids = [...blocks[0][1].matchAll(marker)].map((match) => Number(match[1]));
  if (!ids.length) throw new Error("MS: rendered table does not confirm an empty edition");
  if (new Set(ids).size !== ids.length) throw new Error("MS: duplicate rendered table row IDs");
  return new Set(ids);
}

export function msDate(raw: string): string | null {
  return /^\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})$/.test(raw.trim()) ? parseUsDate(raw) : null;
}

function isRow(value: unknown): value is MsRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<MsRow>;
  return Number.isSafeInteger(row.___id___) && typeof row.counties === "string" && Boolean(row.counties.trim()) &&
    typeof row.issued === "string" && typeof row.expires === "string" && typeof row.exemptions === "string";
}

export function parse(data: unknown, checked: string, expectedIds: ReadonlySet<number>): CountyStatus[] {
  if (!Array.isArray(data) || !data.length) throw new Error("MS: missing or empty burn ban table");
  const seenIds = new Set<number>();
  const bans = new Map<string, MsRow>();
  for (const entry of data) {
    const value: unknown = entry?.value;
    if (!isRow(value)) throw new Error("MS: unexpected burn ban table schema");
    const id = value.___id___;
    if (seenIds.has(id)) throw new Error(`MS: duplicate table row ${id}`);
    if (!expectedIds.has(id)) throw new Error(`MS: table row ${id} is absent from the publisher page`);
    seenIds.add(id);
    for (const name of value.counties.split(/,|\band\b|&/)) {
      const county = countyByName("MS", name.trim());
      if (!county) throw new Error(`MS: unrecognized county ${name.trim()}`);
      if (bans.has(county.fips)) throw new Error(`MS: duplicate order for ${county.name}`);
      bans.set(county.fips, value);
    }
  }
  if (seenIds.size !== expectedIds.size) throw new Error("MS: incomplete burn ban table");

  const rows = countiesInState("MS").map((county) => {
    const ban = bans.get(county.fips);
    const none = { county, status: "none" as const, label: "No county burn ban listed" };
    if (!ban) return none;
    const since = msDate(ban.issued);
    const rawEnd = msDate(ban.expires);
    const expires = rawEnd && (!since || rawEnd >= since) ? rawEnd : null;
    const validFrom = since ? localDayWindow(since, US_ZONES.Central).validFrom : undefined;
    const validUntil = expires ? localDayWindow(expires, US_ZONES.Central).validUntil : undefined;
    if (since && validUntil && Date.parse(validUntil) <= Date.parse(checked)) return none;
    const exemptions = ban.exemptions.trim();
    const note = [
      since ? "" : `The commission's start date “${ban.issued}” could not be verified.`,
      expires ? "" : `The commission's end date “${ban.expires}” could not be verified.`,
      exemptions && !/^no exemptions?$/i.test(exemptions)
        ? `Exemptions: ${exemptions} (see the official page for what each number covers).`
        : "No exemptions listed.",
    ].filter(Boolean).join(" ");
    return {
      county, status: since ? "ban" as const : "unknown" as const,
      label: since ? "County burn ban" : "County burn ban start unconfirmed",
      since, expires, validFrom, validUntil, note,
    };
  });
  return toStatuses(meta, rows, checked, true);
}

export const ms: Adapter = {
  id: "ms",
  mode: "full",
  ...meta,
  async fetch(now = new Date()) {
    const [data, html] = await Promise.all([getJson(meta.sourceUrl), getText(meta.officialUrl)]);
    return parse(data, now.toISOString(), msEditionIds(html));
  },
};
