import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import type { ActiveSource } from "../types";
import { fetchSource } from "./http";

type Decision = Pick<CountyStatus, "status" | "label" | "note"> &
  Partial<Pick<CountyStatus, "since" | "sourceUpdated" | "validUntil">>;

type Bulletin = Pick<ActiveSource, "id" | "state" | "stack" | "sourceName" | "sourceUrl" | "officialUrl" | "cadence"> & {
  staleMs: number;
  county: string;
  accept?: string;
  scopeNote?: string;
  read(input: Response, now: Date): Promise<Decision | undefined>;
};

/** Poll an issuing authority's dedicated county status bulletin. Missing decisions stay unknown. */
export function countyStatusBulletin({ county: name, accept = "text/html", read, scopeNote, staleMs, ...publisher }: Bulletin) {
  const county = countyByName(publisher.state, name);
  if (!county) throw new Error(`${publisher.id}: unknown county ${name}`);
  const { fips, name: countyName } = county;

  async function parse(input: Response, now: Date): Promise<CountyStatus[]> {
    const decision = await read(input, now);
    if (scopeNote && (!decision || decision.status === "none" || decision.status === "unknown")) return [];
    return [{
      fips, county: countyName, state: publisher.state,
      ...(scopeNote ? { scope: "part", scopeNote } : { scope: "county" }),
      sourceId: publisher.id, sourceName: publisher.sourceName,
      sourceUrl: publisher.sourceUrl, officialUrl: publisher.officialUrl,
      checked: now.toISOString(), expires: null, since: null, sourceUpdated: null,
      ...(decision ?? {
        status: "unknown", label: "Countywide status unconfirmed",
        note: "Check the county's current bulletin and local burning rules.",
      }),
    }];
  }

  const source: ActiveSource = {
    ...publisher, ...(scopeNote
      ? { scope: "part", mode: "positive-only", coverage: "restrictions", reportingFips: [fips] }
      : { scope: "county", mode: "full", coverage: "live", expectedFips: [fips] }),
    staleMs,
    async fetch({ now }) {
      const reply = await fetchSource(publisher.sourceUrl, {
        headers: { accept }, maxBytes: 500_000, maxResponseAgeMs: staleMs,
      });
      if (reply.notModified) throw new Error(`${publisher.id}: unexpected 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
  return { source, parse };
}
