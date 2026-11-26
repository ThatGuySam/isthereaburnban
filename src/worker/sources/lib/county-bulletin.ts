import type { CountyStatus } from "../../../shared/types";
import { countyByName } from "../../counties";
import type { ActiveSource } from "../types";
import { atLocalTime, localClock, parseLocalDateTime, parseUsDate, shiftDay } from "./dates";
import { matchHtmlStatus } from "./html";
import { fetchSource } from "./http";

type Decision = Pick<CountyStatus, "status" | "label" | "note"> &
  Partial<Pick<CountyStatus, "expires" | "since" | "sourceUpdated" | "validFrom" | "validUntil">>;
type ScopedDecision = Decision & {
  county: string;
  scopeNote: string;
  officialUrl?: string;
  status: "ban" | "restricted";
};

type LocalOrderWindow =
  | { kind: "dates"; from: string; through: string }
  | { kind: "times"; from: string; until: string };

/** Read an explicitly bounded local order. Whole-day orders include the final named date. */
export function datedLocalOrder(
  window: LocalOrderWindow, zone: string, now: Date,
): Pick<CountyStatus, "since" | "expires" | "validFrom" | "validUntil"> | undefined {
  let validFrom: string | null;
  let validUntil: string | null;
  let expires: string | null;
  if (window.kind === "dates") {
    const start = parseUsDate(window.from);
    expires = parseUsDate(window.through);
    validFrom = start && atLocalTime(start, 0, zone);
    validUntil = expires && atLocalTime(shiftDay(expires, 1), 0, zone);
  } else {
    validFrom = parseLocalDateTime(window.from, zone);
    validUntil = parseLocalDateTime(window.until, zone);
    expires = validUntil && localClock(new Date(Date.parse(validUntil) - 1), zone).date;
  }
  if (!validFrom || !validUntil || validUntil <= validFrom) throw new Error("Invalid local order dates");
  const checked = now.toISOString();
  if (checked < validFrom || checked >= validUntil) return;
  return { validFrom, validUntil, since: localClock(new Date(validFrom), zone).date, expires };
}

type Bulletin = Pick<ActiveSource, "id" | "state" | "stack" | "sourceName" | "sourceUrl" | "officialUrl" | "cadence" | "pollGroup"> & {
  staleMs: number;
  county: string;
  accept?: string;
  maxBytes?: number;
  scopeNote?: string;
  read(input: Response, now: Date): Promise<Decision | undefined>;
};

/** Poll an issuing authority's dedicated county status bulletin. Missing decisions stay unknown. */
export function countyStatusBulletin({
  county: name, accept = "text/html", maxBytes = 500_000, read, scopeNote, staleMs, ...publisher
}: Bulletin) {
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
        headers: { accept }, maxBytes, maxResponseAgeMs: staleMs,
      });
      if (reply.notModified) throw new Error(`${publisher.id}: unexpected 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
  return { source, parse };
}

type HtmlDecision = readonly [pattern: RegExp, decision?: Decision];

/** Read one explicit decision within an issuer's HTML status panel. */
export function htmlStatusBulletin({
  section, blocks, decisions, ...publisher
}: Omit<Bulletin, "read"> & {
  section: string;
  blocks: string;
  decisions: readonly HtmlDecision[];
}) {
  return countyStatusBulletin({
    ...publisher,
    async read(input) {
      const { status } = await matchHtmlStatus(input, {
        section, blocks, choices: decisions.map(([pattern, decision]) => [decision, pattern]),
      });
      return status;
    },
  });
}

type ScopedBulletin = Omit<Bulletin, "county" | "read" | "scopeNote"> & {
  counties: readonly string[];
  read(input: Response, now: Date): Promise<readonly ScopedDecision[]>;
};

/** Poll a bulletin with several air districts, fire districts or other limited jurisdictions. */
export function scopedStatusBulletin({
  counties: names, accept = "text/html", maxBytes = 500_000, read, staleMs, ...publisher
}: ScopedBulletin) {
  const counties = new Map(names.map((name) => {
    const county = countyByName(publisher.state, name);
    if (!county) throw new Error(`${publisher.id}: unknown county ${name}`);
    return [name, county];
  }));

  async function parse(input: Response, now: Date): Promise<CountyStatus[]> {
    const decisions = await read(input, now);
    const checked = now.toISOString();
    return decisions.map(({ county: name, officialUrl, ...decision }) => {
      const county = counties.get(name);
      if (!county) throw new Error(`${publisher.id}: unexpected county ${name}`);
      return {
        ...decision, county: county.name, fips: county.fips, state: publisher.state, scope: "part",
        sourceId: publisher.id, sourceName: publisher.sourceName, sourceUrl: publisher.sourceUrl,
        officialUrl: officialUrl ?? publisher.officialUrl, checked,
        expires: decision.expires ?? null, since: decision.since ?? null, sourceUpdated: decision.sourceUpdated ?? null,
      };
    });
  }

  const source: ActiveSource = {
    ...publisher, staleMs, scope: "part", mode: "positive-only", coverage: "restrictions", keepRowLinks: true,
    reportingFips: [...counties.values()].map(({ fips }) => fips),
    async fetch({ now }) {
      const reply = await fetchSource(publisher.sourceUrl, {
        headers: { accept }, maxBytes, maxResponseAgeMs: staleMs,
      });
      if (reply.notModified) throw new Error(`${publisher.id}: unexpected 304`);
      return { rows: await parse(reply.response, now) };
    },
  };
  return { source, parse };
}

/** Require every named area exactly once before interpreting any decisions. */
export function namedStatusRows<T extends string>(
  rows: readonly (readonly string[])[], names: readonly T[], width: number,
): ReadonlyMap<T, readonly string[]> {
  const expected = new Map<string, T>(names.map((name) => [name, name]));
  const found = new Map<T, readonly string[]>();
  for (const [name, ...values] of rows) {
    const key = expected.get(name);
    if (key === undefined || found.has(key) || values.length !== width - 1 || values.some((value) => !value)) {
      throw new Error(`Unexpected status row for ${name ?? "unnamed area"}`);
    }
    found.set(key, values);
  }
  if (found.size !== expected.size) throw new Error("Incomplete status roster");
  return found;
}
