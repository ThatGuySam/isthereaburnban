import type { CountyStatus } from "../../../shared/types";
import { localClock, localDayWindow, parseUsDate, US_ZONES } from "../lib/dates";
import { extractHtmlGrid } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

// The bare URL can serve yesterday's Hummingbird cache. This public variant returns the uncached notice.
const URL = "https://tmfpd.us/outdoor-burning/?burn-status-check=1";
const ZONE = US_ZONES.Pacific;
const META = {
  id: "nv-tmfpd-pile-burning", state: "NV", scope: "part",
  sourceName: "Truckee Meadows Fire Protection District", stack: "WordPress / Oxygen HTML",
  sourceUrl: URL, officialUrl: URL,
} as const;

const BANNER = {
  row: "section#section-737-190",
  cell: "h4#headline-739-190, #code_block-857-190 p, #text_block-19-3379",
};

export async function parseTmfpdPileBurning(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const [banner, ...others] = await extractHtmlGrid(input, BANNER);
  if (!banner || others.length || banner.length < 2 || banner.length > 3) {
    throw new Error("Truckee Meadows: expected one daily pile-burning banner");
  }
  const [decision, effective, terms] = banner.map(({ text }) => text);
  const value = /^Pile Burning is (OPEN|CLOSED)$/i.exec(decision)?.[1].toUpperCase();
  if (!value) throw new Error("Truckee Meadows: unrecognized pile-burning status");

  const dateText = /^Effective Date:\s*(.+)$/i.exec(effective)?.[1];
  const day = dateText && parseUsDate(dateText);
  if (!day || day !== localClock(now, ZONE).date) {
    throw new Error("Truckee Meadows: daily effective date does not match today in Pacific time");
  }

  const closed = value === "CLOSED";
  if (!closed) {
    const range = /^Pile Burning is allowed with an approved permit and weather permitting effective (\S+)\s*[–—-]\s*(\S+)$/i.exec(terms ?? "");
    const start = range && parseUsDate(range[1]);
    const end = range && parseUsDate(range[2]);
    if (!start || !end || day < start || day > end) {
      throw new Error("Truckee Meadows: invalid pile-burning permit terms or season");
    }
  }

  return [{
    fips: "32031", county: "Washoe County", state: META.state, sourceId: META.id, scope: META.scope,
    scopeNote: "Pile burning within the Truckee Meadows Fire Protection District",
    status: closed ? "ban" : "restricted",
    label: closed ? "District pile burning closed" : "District pile burning open with permit",
    note: closed
      ? "The district’s daily notice closes pile burning in its service area. Check the district for other types of fire."
      : "The district’s daily notice allows pile burning with an approved permit and suitable weather. Check the district’s permit terms and local air-quality rules.",
    since: day, expires: null, sourceUpdated: null, checked: now.toISOString(),
    ...localDayWindow(day, ZONE),
    sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
  }];
}

export const nvTmfpdPileBurning: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: ZONE, hours: [2, 6, 9, 12, 15, 18] },
  staleMs: 25 * 60 * 60 * 1_000,
  async fetch({ now }) {
    const reply = await fetchSource(META.sourceUrl, {
      headers: { accept: "text/html" }, maxBytes: 600_000,
    });
    if (reply.notModified) throw new Error("Unexpected Truckee Meadows daily status 304");
    return { rows: await parseTmfpdPileBurning(reply.response, now) };
  },
};
