import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { extractHtml, statusTableRows, type HtmlParts } from "../lib/html";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://burnpermit.sd.gov/Windows/Login.aspx";
const META = {
  id: "sd-black-hills-pile-burning", state: "SD", scope: "part",
  stack: "ASP.NET WebForms / HTML table", sourceName: "South Dakota Wildland Fire",
  sourceUrl: URL, officialUrl: URL,
} as const;
const TABLE = { id: "gvConditions", heading: "County Burn Status", columns: ["County", "Condition"] };
const DISTRICT_COUNTIES = new Set(["Custer", "Fall River", "Lawrence", "Meade", "Pennington"]);
const SNOW = /^([1-9]\d*) inches of snow required to burn small piles\. ([1-9]\d*) inches of snow is required to burn large pile\.$/;
const HOUR = 3_600_000;

export function parseBlackHillsPileBurning(parts: HtmlParts, now: Date): CountyStatus[] {
  const checked = now.toISOString();
  const seen = new Set<string>();
  const rows: CountyStatus[] = [];
  for (const [name, condition] of statusTableRows(parts, TABLE)) {
    if (seen.has(name)) throw new Error(`South Dakota Wildland Fire: duplicate condition for ${name}`);
    seen.add(name);
    if (!DISTRICT_COUNTIES.has(name)) continue;
    const county = countyByName(META.state, name);
    const snow = SNOW.exec(condition);
    if (!county || !snow) continue;
    const [, small, large] = snow;
    rows.push({
      fips: county.fips, county: county.name, state: META.state, sourceId: META.id, scope: META.scope,
      scopeNote: "Private-land slash piles in the Black Hills Forest Fire Protection District",
      status: "restricted", label: "Slash-pile burning requires a permit and snow cover",
      note: `The district reports a minimum of ${small} inches of snow for small slash piles and ${large} inches for large piles. Confirm your permit is valid, snow cover is continuous, and local orders allow the burn. Check with city officials inside incorporated cities and towns.`,
      checked, since: null, expires: null, sourceUpdated: null,
      sourceName: META.sourceName, sourceUrl: META.sourceUrl, officialUrl: META.officialUrl,
    });
  }
  if (!rows.length) throw new Error("South Dakota Wildland Fire: no recognized district pile-burning conditions");
  return rows;
}

export const sdBlackHillsPileBurning: ActiveSource = {
  ...META, coverage: "restrictions", mode: "positive-only",
  cadence: { kind: "daily", zone: US_ZONES.Mountain, hours: [6, 10, 14, 18, 22] },
  staleMs: 10 * HOUR,
  async fetch({ now }) {
    const reply = await fetchSource(URL, {
      headers: { accept: "text/html" }, maxBytes: 64_000, maxResponseAgeMs: 2 * HOUR,
    });
    if (reply.notModified) throw new Error("Unexpected South Dakota Wildland Fire 304");
    return { rows: parseBlackHillsPileBurning(await extractHtml(reply.response), now) };
  },
};
