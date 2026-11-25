import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import { arcgisRows, arcgisUrl } from "../lib/arcgis";
import { US_ZONES } from "../lib/dates";
import { getText } from "../lib/http";
import type { ActiveSource } from "../types";

const LAYER = "https://gis.carboncounty.com/arcgis/rest/services/Burn_Ban_Zones/FeatureServer/1";
const URL = arcgisUrl(LAYER, ["MUNINAME", "Burn_Status"]);
const MAP = "https://carbongis.maps.arcgis.com/apps/webappviewer/index.html?id=b59aeef167da47e8884609b2ee6c926d";
const COUNTY = countyByName("PA", "Carbon")!;
const META = {
  id: "pa-carbon-municipal-burn-status", state: "PA", scope: "part", stack: "ArcGIS FeatureServer",
  sourceName: "Carbon County GIS", sourceUrl: URL, officialUrl: MAP,
} as const;

const MUNICIPALITIES = new Set([
  "Banks Township", "Beaver Meadows Borough", "Bowmanstown Borough", "East Penn Township", "East Side Borough",
  "Franklin Township", "Jim Thorpe Borough", "Kidder Township", "Lansford Borough", "Lausanne Township",
  "Lehigh Township", "Lehighton Borough", "Lower Towamensing Twp", "Mahoning Township", "Nesquehoning Borough",
  "Packer Township", "Palmerton Borough", "Parryville Borough", "Penn Forest Township", "Summit Hill Borough",
  "Towamensing Township", "Weatherly Borough", "Weissport Borough",
]);

export function parseCarbonBurnStatus(data: unknown, now: Date): CountyStatus[] {
  const rows = arcgisRows(data, { requireComplete: true });
  if (rows.length !== MUNICIPALITIES.size) throw new Error("Carbon County: incomplete municipality roster");
  const seen = new Set<string>();
  const checked = now.toISOString();
  return rows.flatMap(({ MUNINAME: name, Burn_Status: code }): CountyStatus[] => {
    if (typeof name !== "string" || !MUNICIPALITIES.has(name) || seen.has(name)) {
      throw new Error("Carbon County: unknown or duplicate municipality");
    }
    seen.add(name);
    if (code === "Allowed") return [];
    const closed = code === "Not Allowed";
    if (!closed && code !== "Limiting Burning Allowed in Accordance by Local Ordinance Only") {
      throw new Error(`Carbon County: unrecognized burn status for ${name}`);
    }
    const municipality = name === "Lower Towamensing Twp" ? "Lower Towamensing Township" : name;
    return [{
      fips: COUNTY.fips, county: COUNTY.name, state: META.state, sourceId: META.id,
      scope: META.scope, scopeNote: `${municipality}, outdoor open burning`, status: closed ? "ban" : "restricted",
      label: closed ? "Outdoor open burning listed as not allowed" : "Outdoor open burning limited by local ordinance",
      note: `Carbon County's map shows ${closed ? "outdoor open burning is not allowed" : "outdoor open burning is limited by local ordinance"} in ${municipality}. Check with the municipality for details and exceptions.`,
      sourceName: META.sourceName, sourceUrl: URL, officialUrl: MAP, checked, sourceUpdated: null, since: null, expires: null,
    }];
  });
}

export const paCarbonMunicipalStatus: ActiveSource = {
  ...META, mode: "positive-only", coverage: "restrictions", reportingFips: [COUNTY.fips],
  cadence: { kind: "daily", zone: US_ZONES.Eastern, hours: [6, 12, 18] },
  staleMs: 24 * 60 * 60 * 1000,
  async fetch({ now }) {
    return { rows: parseCarbonBurnStatus(JSON.parse(await getText(URL)), now) };
  },
};
