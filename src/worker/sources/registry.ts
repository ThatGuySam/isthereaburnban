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
import { gaEpdNonSummer, gaEpdSummer } from "./ga/epd";
import { gaGwinnett } from "./ga/gwinnett";
import type { ArcgisResponse } from "./lib/arcgis";
import { fetchSource } from "./lib/http";
import { miPermits } from "./mi/permits";
import { mnRestrictions } from "./mn/restrictions";
import { njRestrictions } from "./nj/restrictions";
import { ohSeasonal } from "./oh/seasonal";
import type { ActiveSource, Source } from "./types";
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
