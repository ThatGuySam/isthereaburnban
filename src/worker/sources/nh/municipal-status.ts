import { countyByName } from "../../counties";
import { fluentBurnDecision } from "../lib/fluent-burn-permits";
import { fetchSource } from "../lib/http";
import type { ActiveSource } from "../types";

const STATE = "NH";
const STALE_MS = 3 * 60 * 60 * 1_000;
const hillsborough = countyByName(STATE, "Hillsborough");
if (!hillsborough) throw new Error("Missing Hillsborough County, NH");
const { fips, name: county } = hillsborough;

const municipalities = [
  {
    id: "nh-nashua-burn-status",
    sourceName: "Nashua Fire Rescue",
    url: "https://nashuanh.burnpermits.com/",
    scopeNote: "City of Nashua",
    title: "City of Nashua New Hampshire Burn Permits",
    openMessage: /^The fire danger is low and burning is permitted\.$/i,
    fixture: "nashua-permit-status-2026-11-26.html",
  },
  {
    id: "nh-hudson-burn-status",
    sourceName: "Hudson Fire Department",
    url: "https://hudsonnh.burnpermits.com/",
    scopeNote: "Town of Hudson",
    title: "Town of Hudson, NH Burn Permits",
    openMessage: /^Category 1 fires are allowed all day\. Categories 2 and 3 are only allowed between 5:00pm and 9:00am\.$/i,
    fixture: "hudson-permit-status-2026-11-26.html",
  },
];

export const nhMunicipalStatus = municipalities.map(({ id, sourceName, url, scopeNote, title, openMessage, fixture }) => {
  const publisher = { id, state: STATE, sourceName, sourceUrl: url, officialUrl: url, scope: "part" } satisfies
    Pick<ActiveSource, "id" | "state" | "sourceName" | "sourceUrl" | "officialUrl" | "scope">;

  async function parse(input: Response | string, now: Date) {
    if (await fluentBurnDecision(input, { title, openMessage }) === "allowed") return [];
    return [{
      fips, county, state: STATE, scope: publisher.scope, scopeNote, status: "ban" as const,
      label: "Municipal open-burning suspension",
      note: "The fire department's permit portal says open burning is suspended. See the portal for current details.",
      sourceId: id, sourceName, sourceUrl: url, officialUrl: url,
      checked: now.toISOString(), sourceUpdated: null, since: null, expires: null,
    }];
  }

  const source: ActiveSource = {
    ...publisher, stack: "Fluent BurnPermits.com / ColdFusion HTML",
    mode: "positive-only", coverage: "restrictions", reportingFips: [fips], staleMs: STALE_MS,
    cadence: { kind: "hourly" }, pollGroup: "hourly-fire-status",
    async fetch({ now }) {
      const reply = await fetchSource(url, {
        headers: { accept: "text/html", "cache-control": "no-cache" }, redirect: "error",
        maxBytes: 150_000, maxResponseAgeMs: STALE_MS, attempts: 1,
      });
      if (reply.notModified) throw new Error(`${id}: unexpected 304 response`);
      return { rows: await parse(reply.response, now) };
    },
  };
  return { source, parse, fixture };
});
