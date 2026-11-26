import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { webCadLiveGroup } from "../lib/aspnet";
import { parseLocalDateTime, US_ZONES } from "../lib/dates";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const URL = "https://webcad.pikepa.org/pages/public/liveincidents.aspx";
const COUNTY = countyByName("PA", "Pike")!;
const META = {
  id: "pa-pike-webcad-burn-bans", state: "PA", scope: "part", stack: "ASP.NET WebForms / WebCAD",
  sourceName: "Pike County Communications", sourceUrl: URL, officialUrl: URL,
} as const;
const ZONE = US_ZONES.Eastern;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const TOWNSHIPS = ["Blooming Grove", "Delaware", "Dingman", "Greene", "Lackawaxen", "Lehman",
  "Palmyra", "Porter", "Shohola", "Westfall"];
const MUNICIPALITIES = new Map([
  ...TOWNSHIPS.map((name): [string, string] => [name.toUpperCase(), `${name} Township`]),
  ["MILFORD TWP", "Milford Township"], ["MILFORD BORO", "Milford Borough"], ["MATAMORAS", "Matamoras Borough"],
]);

export async function parsePikeWebCad(input: Response | string, now: Date): Promise<CountyStatus[]> {
  const { refreshed, incidents } = await webCadLiveGroup(input, "Burning Bans");
  const sourceUpdated = parseLocalDateTime(refreshed, ZONE);
  const published = sourceUpdated ? Date.parse(sourceUpdated) : NaN;
  // The live view's clock advances during a request. Allow minor clock skew.
  const age = now.getTime() - published;
  if (!sourceUpdated || age < -60_000 || age >= MAX_AGE_MS) throw new Error("Pike WebCAD: stale or invalid refresh stamp");

  const seen = new Set<string>();
  const checked = now.toISOString();
  const validUntil = new Date(published + MAX_AGE_MS).toISOString();
  return incidents.map(({ received, type, location }) => {
    const item = /^(\d{10}) (.+)$/.exec(received);
    const date = item && parseLocalDateTime(item[2], ZONE);
    const municipality = MUNICIPALITIES.get(location);
    if (type !== "BURN BAN IN EFFECT" || !item || !date || Date.parse(date) > published ||
        !municipality || seen.has(item[1])) {
      throw new Error("Pike WebCAD: unrecognized or duplicate burn-ban record");
    }
    seen.add(item[1]);
    return {
      fips: COUNTY.fips, county: COUNTY.name, state: META.state, sourceId: META.id,
      status: "ban", scope: META.scope, scopeNote: `${municipality} in Pike County`,
      label: `${municipality} burn ban in effect`,
      note: `Pike County Communications lists an active burn ban for ${municipality}. Confirm the order, exemptions and end date with the municipality.`,
      sourceName: META.sourceName, sourceUrl: URL, officialUrl: URL,
      documentId: item[1], since: null, expires: null, sourceUpdated, checked, validUntil,
    };
  });
}

export const paPikeWebCad: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", reportingFips: [COUNTY.fips],
  cadence: { kind: "hourly" }, pollGroup: "nj-and-pike-hourly", staleMs: MAX_AGE_MS,
  async fetch({ now }) {
    const reply = await fetchSource(URL, { headers: { accept: "text/html" }, maxBytes: 250_000 });
    if (reply.notModified) throw new Error("Unexpected Pike WebCAD 304");
    return { rows: await parsePikeWebCad(reply.response, now) };
  },
};
