import { ADAPTERS } from "../adapters";
import { parse as parseFl } from "../adapters/fl";
import { parse as parseIa } from "../adapters/ia";
import { parse as parseIn } from "../adapters/in";
import { parse as parseLa } from "../adapters/la";
import { parse as parseOk } from "../adapters/ok";
import { pfirs } from "./ca/pfirs";
import type { ArcgisResponse } from "./lib/arcgis";
import { fetchSource } from "./lib/http";
import { miPermits } from "./mi/permits";
import { njRestrictions } from "./nj/restrictions";
import type { ActiveSource, Source } from "./types";

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
  {
    id: "ca-calfire", state: "CA", scope: "part", stack: "Sitecore / HTML table", mode: "manual", cadence: null,
    sourceName: "CAL FIRE", sourceUrl: "https://burnpermit.fire.ca.gov/current-burn-status/",
    officialUrl: "https://burnpermit.fire.ca.gov/current-burn-status/",
    error: "Akamai Access Denied (HTTP 403) from the verification host on 2026-11-23.",
  },
];
