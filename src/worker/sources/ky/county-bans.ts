import type { CountyStatus } from "../../../shared/types";
import { countyByName, matchKey } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { extractHtml } from "../lib/html";
import { getText } from "../lib/http";
import { parseSharePointPage, sharePointListItems, sharePointListUrl } from "../lib/sharepoint";
import type { ActiveSource } from "../types";

const SITE = "https://eec.ky.gov/Natural-Resources/Forestry/wildland-fire-management";
const PAGE = "County-Burn-Bans.aspx";
const CONTENT_FIELD = "Main_x0020_Content";
const META = {
  id: "ky-forestry-county-bans", state: "KY", scope: "county", stack: "SharePoint Pages REST / rich-text list",
  sourceName: "Kentucky Division of Forestry",
  sourceUrl: sharePointListUrl(SITE, "Pages", {
    $select: `Id,Title,FileLeafRef,Modified,${CONTENT_FIELD}`,
    $filter: `FileLeafRef eq '${PAGE}'`,
  }),
  officialUrl: `${SITE}/pages/county-burn-bans.aspx`,
} as const;

const HOUR = 3_600_000;
const MAX_EDITION_AGE = 30 * 24 * HOUR;
const INTRO = /^The following is a list of counties and\/or cities with a burn ban in effect\./i;
const EMPTY = /^The Division of Forestry is not aware of any local bans\b/i;

// Exact incorporated-city and county name collisions using Kentucky's city points layer.
const AMBIGUOUS = new Set([
  "allen", "butler", "carlisle", "clay", "clinton", "crittenden", "cumberland", "franklin", "fulton",
  "grayson", "greenup", "hardin", "harlan", "henderson", "hickman", "jackson", "livingston", "marion",
  "martin", "russell", "union",
]);

function reportedCounty(entry: string, modified: string) {
  if (/^city of\s/i.test(entry)) return;
  const county = countyByName(META.state, entry);
  if (!county || / County$/i.test(entry) || !AMBIGUOUS.has(matchKey(entry))) return county;
  // The November 18 Grayson County order corroborates this edition's bare label.
  if (county.fips === "21085" && modified === "2026-11-20T23:41:51.000Z") return county;
}

export async function parseKentuckyCountyBans(data: unknown, now: Date): Promise<CountyStatus[]> {
  const { content, modified } = parseSharePointPage(data, { fileName: PAGE, contentField: CONTENT_FIELD });
  const [intro, ...entries] = sharePointListItems(await extractHtml(content), /^Current Burn Bans$/i);
  if (!intro || !INTRO.test(intro)) throw new Error("Kentucky Forestry: current list heading or description missing");

  const edit = Date.parse(modified);
  if (edit > now.getTime()) throw new Error("Kentucky Forestry: list edit time is in the future");
  if (!entries.length) throw new Error("Kentucky Forestry: current list entries missing");
  if (entries.length === 1 && EMPTY.test(entries[0])) return [];
  if (entries.some((entry) => EMPTY.test(entry))) throw new Error("Kentucky Forestry: conflicting list entries");
  if (now.getTime() - edit >= MAX_EDITION_AGE) throw new Error("Kentucky Forestry: positive list is over 30 days old");

  const rows = new Map<string, CountyStatus>();
  const checked = now.toISOString();
  const validUntil = new Date(edit + MAX_EDITION_AGE).toISOString();
  for (const entry of entries) {
    const county = reportedCounty(entry, modified);
    if (!county) continue;
    rows.set(county.fips, {
      fips: county.fips, county: county.name, state: META.state, sourceId: META.id, scope: META.scope,
      status: "ban", label: "Reported county burn ban",
      note: "Kentucky Forestry lists an active county order. Contact the county judge-executive or local fire department for the order, exceptions and any change.",
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
      checked, sourceUpdated: modified, since: null, expires: null, validUntil,
    });
  }
  if (!rows.size) throw new Error("Kentucky Forestry: no county entries could be verified");
  return [...rows.values()];
}

export const kyForestryCountyBans: ActiveSource = {
  ...META,
  coverage: "restrictions",
  mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Eastern, hours: [0, 6, 12, 18] },
  staleMs: 24 * HOUR,
  async fetch({ now }) {
    const body = await getText(META.sourceUrl, { headers: { accept: "application/json;odata=nometadata" }, maxBytes: 128_000 });
    return { rows: await parseKentuckyCountyBans(JSON.parse(body), now) };
  },
};
