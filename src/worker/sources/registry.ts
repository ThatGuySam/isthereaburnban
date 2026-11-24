import { ADAPTERS } from "../adapters";
import { parse as parseFl } from "../adapters/fl";
import { parse as parseIa } from "../adapters/ia";
import { parse as parseIn } from "../adapters/in";
import { parse as parseLa } from "../adapters/la";
import { parse as parseOk } from "../adapters/ok";
import { azAreaASummer } from "./az/area-a";
import { azGrandCanyonFire } from "./az/grand-canyon";
import { azPimaWildfire } from "./az/pima";
import { pfirs } from "./ca/pfirs";
import { coArapahoeFire, coBoulderFire, coDouglasFire, coElPasoFire, coEstesFire, coLarimerFire } from "./co/county-status";
import { coDenverAir } from "./co/denver-air";
import { gaEpdNonSummer, gaEpdSummer } from "./ga/epd";
import { gaGwinnett } from "./ga/gwinnett";
import { kyForestryCountyBans } from "./ky/county-bans";
import { kySeasonal } from "./ky/seasonal";
import type { ArcgisResponse } from "./lib/arcgis";
import { fetchSource } from "./lib/http";
import { miPermits } from "./mi/permits";
import { mnRestrictions } from "./mn/restrictions";
import { njRestrictions } from "./nj/restrictions";
import { nwsFireWeather } from "./nws/alerts";
import { ohSeasonal } from "./oh/seasonal";
import { orLrapaHeating, orLrapaOutdoor } from "./or/lrapa";
import { orOdfPublicUse } from "./or/odf";
import { orWillametteBackyard } from "./or/willamette";
import type { ActiveSource, Source } from "./types";
import { waEcologyAir } from "./wa/ecology-air";
import { waKingFireSafety } from "./wa/king-fire-safety";
import { waPugetSoundAir } from "./wa/puget-sound";
import { wiPermits } from "./wi/permits";

const ARCGIS_PARSERS = new Map([
  ["fl", parseFl], ["ia", parseIa], ["in", parseIn], ["la", parseLa], ["ok", parseOk],
]);

/** The scheduled publishers and known manual sources. Candidates stay in the research inventory. */
export const SOURCES: readonly Source[] = [
  ...ADAPTERS.map((adapter) => ({
    id: adapter.id, state: adapter.state, mode: adapter.mode,
    sourceName: adapter.sourceName, sourceUrl: adapter.sourceUrl, officialUrl: adapter.officialUrl,
    keepRowLinks: adapter.keepRowLinks,
    scope: "county" as const, coverage: "live" as const,
    stack: adapter.id === "ms" ? "WordPress / Ninja Tables" : adapter.id === "tx" ? "ArcGIS / UTF-16 text" : "ArcGIS",
    cadence: { kind: "hourly" } as const,
    async fetch({ now, validators }) {
      const parse = ARCGIS_PARSERS.get(adapter.id);
      // TX has a fallback feed. MS recalculates active orders on the local calendar.
      if (!parse) return { rows: await adapter.fetch() };
      const reply = await fetchSource(adapter.sourceUrl, { validators, headers: { accept: "application/json" } });
      if (reply.notModified) return reply;
      const json = await reply.response.json<ArcgisResponse>();
      return { rows: parse(json, now.toISOString()), validators: reply.validators };
    },
  } satisfies ActiveSource)),
  nwsFireWeather,
  pfirs,
  miPermits,
  njRestrictions,
  wiPermits,
  mnRestrictions,
  ohSeasonal,
  gaGwinnett,
  gaEpdSummer,
  gaEpdNonSummer,
  azPimaWildfire,
  azGrandCanyonFire,
  azAreaASummer,
  waEcologyAir,
  waPugetSoundAir,
  waKingFireSafety,
  coArapahoeFire,
  coBoulderFire,
  coDouglasFire,
  coElPasoFire,
  coEstesFire,
  coLarimerFire,
  coDenverAir,
  orLrapaOutdoor,
  orLrapaHeating,
  orWillametteBackyard,
  orOdfPublicUse,
  kyForestryCountyBans,
  kySeasonal,
  {
    id: "ky-louisville-open-burning", state: "KY", scope: "part", stack: "HTML / Cloudflare", mode: "manual", cadence: null,
    sourceName: "Louisville Metro Air Pollution Control District",
    sourceUrl: "https://louisvilleky.gov/government/air-pollution-control-district/open-burning-louisville",
    officialUrl: "https://louisvilleky.gov/government/air-pollution-control-district/open-burning-louisville",
    error: "The metro burning and burn-plan guidance returned a Cloudflare challenge (HTTP 403) on 2026-11-24.",
  },
  {
    id: "or-odf-edit-view", state: "OR", scope: "part", stack: "ArcGIS FeatureServer", mode: "manual", cadence: null,
    sourceName: "Oregon Department of Forestry",
    sourceUrl: "https://gis.odf.oregon.gov/odfags/rest/services/Hosted/Fire_Restriction_Edit_View/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=json",
    officialUrl: "https://gisapps.odf.oregon.gov/firerestrictions/pfr.html",
    error: "The edit view in the map config returned ArcGIS error 499 Token Required on 2026-11-24. The map reads a separate public view.",
  },
  {
    id: "or-hillsboro-open-burning", state: "OR", scope: "part", stack: "Granicus / Vision HTML", mode: "manual", cadence: null,
    sourceName: "City of Hillsboro Fire & Rescue",
    sourceUrl: "https://www.hillsboro-oregon.gov/our-city/departments/fire/community-risk-reduction/burning-and-air-quality",
    officialUrl: "https://www.hillsboro-oregon.gov/our-city/departments/fire/community-risk-reduction/burning-and-air-quality",
    error: "The city burning rules and summer burn-ban notice returned HTTP 403 Access Denied on 2026-11-24.",
  },
  {
    id: "co-dfpc-fire", state: "CO", scope: "part", stack: "Drupal / HTML directory", mode: "manual", cadence: null,
    sourceName: "Colorado Division of Fire Prevention and Control",
    sourceUrl: "https://dfpc.colorado.gov/firerestriction",
    officialUrl: "https://dfpc.colorado.gov/firerestriction",
    error: "The directory returned CloudFront HTTP 403 on 2026-11-24. It directs users to local fire authorities and federal land managers.",
  },
  {
    id: "co-rocky-mountain-fire", state: "CO", scope: "part", stack: "ArcGIS Dashboard / WebMap", mode: "manual", cadence: null,
    sourceName: "Rocky Mountain Area Coordination Center",
    sourceUrl: "https://www.arcgis.com/sharing/rest/content/items/f0a56c48c00a4adfa7ceadba4fbdebe9/data?f=json",
    officialUrl: "https://www.arcgis.com/apps/dashboards/407bde860acc492bb53c972275bfbd33",
    error: "Colorado county boundaries carry no order status. The dashboard includes separate land-manager layers and Wyoming county orders.",
  },
  {
    id: "co-sable-altura", state: "CO", scope: "part", stack: "WordPress REST / Popup Maker", mode: "manual", cadence: null,
    sourceName: "Sable Altura Fire Protection District",
    sourceUrl: "https://sablealturafire.org/wp-json/wp/v2/popups/3229",
    officialUrl: "https://sablealturafire.org/fireprevention/",
    error: "The district's Arapahoe County Stage 1 text appears next to older no-ban artwork. Confirm the order with the district.",
  },
  {
    id: "wa-dnr-fdra", state: "WA", scope: "part", stack: "ArcGIS MapServer", mode: "manual", cadence: null,
    sourceName: "Washington DNR",
    sourceUrl: "https://gis.dnr.wa.gov/site3/rest/services/Public_Wildfire/WADNR_PUBLIC_WD_WildfireDanger/MapServer/1",
    officialUrl: "https://dnr.wa.gov/wildfire-resources/outdoor-burning/burn-restrictions",
    error: "Fire danger polygons do not establish order boundaries. Code 4 carries free-text exceptions and this layer exposes no report edit date.",
  },
  {
    id: "wa-everett-fire", state: "WA", scope: "part", stack: "CivicPlus / HTML", mode: "manual", cadence: null,
    sourceName: "Everett Fire Department",
    sourceUrl: "https://www.everettwa.gov/2332/Outdoor-Burning",
    officialUrl: "https://www.everettwa.gov/2332/Outdoor-Burning",
    error: "The outdoor burning page returned a Cloudflare challenge (HTTP 403) on 2026-11-24.",
  },
  {
    id: "wa-south-county-fire", state: "WA", scope: "part", stack: "Granicus / Vision HTML", mode: "manual", cadence: null,
    sourceName: "South County Fire Regional Fire Authority",
    sourceUrl: "https://www.southsnofire.org/about-us/divisions/fire-marshal/burn-bans-and-regulations",
    officialUrl: "https://www.southsnofire.org/about-us/divisions/fire-marshal/burn-bans-and-regulations",
    error: "The burn bans and regulations page returned Akamai Access Denied (HTTP 403) on 2026-11-24.",
  },
  {
    id: "az-dffm-trust-lands", state: "AZ", scope: "part", stack: "ArcGIS FeatureServer", mode: "manual", cadence: null,
    sourceName: "Arizona Department of Forestry and Fire Management",
    sourceUrl: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/AZ_DFFM_Fire_Restrictions_2_view/FeatureServer/0",
    officialUrl: "https://dffm.az.gov/newsroom/fire-restrictions",
    error: "The layer retains stages superseded by DFFM's July 2026 rescission. The agency's fire restrictions page returned a Cloudflare challenge.",
  },
  {
    id: "az-coconino-emergency-management", state: "AZ", scope: "part", stack: "CivicPlus / HTML", mode: "manual", cadence: null,
    sourceName: "Coconino County Emergency Management",
    sourceUrl: "https://www.coconino.az.gov/2595/Fire-Restriction-Information",
    officialUrl: "https://www.coconino.az.gov/2595/Fire-Restriction-Information",
    error: "The county fire restrictions page returned a Cloudflare challenge (HTTP 403) on 2026-11-24.",
  },
  {
    id: "ga-gfc-viewer", state: "GA", scope: "part", stack: "fiResponse / JSON", mode: "manual", cadence: null,
    sourceName: "Georgia Forestry Commission",
    sourceUrl: "https://georgiafc.firesponse.com/burn-permit/api/burnrestriction/all/public?levels=PUBLIC&levels=PRIVATE_PUBLIC",
    officialUrl: "https://georgiafc.firesponse.com/public/",
    error: "Public map summary provides area labels without dates or order types. The restriction type catalog returned HTTP 401.",
  },
  {
    id: "ca-calfire", state: "CA", scope: "part", stack: "Sitecore / HTML table", mode: "manual", cadence: null,
    sourceName: "CAL FIRE", sourceUrl: "https://burnpermit.fire.ca.gov/current-burn-status/",
    officialUrl: "https://burnpermit.fire.ca.gov/current-burn-status/",
    error: "Akamai Access Denied (HTTP 403) from the verification host on 2026-11-23.",
  },
];
