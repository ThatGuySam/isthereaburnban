// Shared contract between the data Worker, the API, the MCP tools and the Astro pages.
// Keep this file the single source of truth for status shapes.

/**
 * ban          - source reports an active burn ban for this county
 * restricted   - partial / activity-specific / permit restrictions (e.g. ozone alert, permits required)
 * none         - source covers this county and reports no ban (only from a fresh, complete feed)
 * unknown      - no feed for this state, feed failed, stale, or field is null. NEVER show "Nope" for this.
 */
export type BanStatus = "ban" | "restricted" | "none" | "unknown";

export type FireWeatherAlert = {
  event: string;
  headline: string;
  onset: string | null;
  expires: string | null; // CAP message expiry
  ends: string | null; // expected end of the weather event
  url: string;
  sender: string;
};

export type CountyStatus = {
  fips: string; // 5-digit county FIPS, string with leading zeros
  state: string; // "OK"
  county: string; // "Tulsa County"
  status: BanStatus;
  label: string; // human label from the source, e.g. "County Burn Ban", "Governor's Burn Ban"
  since: string | null; // ISO date the ban started (source), or when we first saw this status
  expires: string | null; // ISO date if the source gives one (MS)
  sourceUpdated: string | null; // ISO, source's own update/edit time if exposed
  checked: string; // ISO time our cron last fetched this source successfully
  sourceName: string; // "Oklahoma Forestry Services"
  sourceUrl: string; // machine endpoint we read
  officialUrl: string; // human official page to link ("Read the official order/map")
  note?: string; // scope caveat, e.g. "County bans cover unincorporated areas"
  scope?: "county" | "part" | "state";
  scopeNote?: string;
  sourceId?: string;
  validFrom?: string; // start instant for a dated or scheduled decision
  validUntil?: string; // instant after which short-lived decisions are unconfirmed
  /** Broader report when a scoped order supplies the headline. */
  countywide?: Pick<CountyStatus, "status" | "label" | "checked" | "sourceName" | "sourceUpdated" | "officialUrl">;
  orders?: ScopedOrder[];
  alerts?: FireWeatherAlert[];
};

export type ScopedOrder = Pick<CountyStatus, "status" | "label" | "note" | "since" | "expires" |
  "sourceId" | "sourceName" | "sourceUpdated" | "officialUrl" | "checked" | "validFrom" | "validUntil"> & {
  sourceUrl?: string;
  scope: "part" | "county" | "state";
  scopeNote: string;
};

/** Snapshot-only timing for local restrictions that can outlast the warning. */
export type FireWeatherOrder = ScopedOrder & { retainAfter?: string; carried?: true };

export type FireWeatherReport = {
  fips: string;
  alerts: FireWeatherAlert[];
  orders?: Omit<FireWeatherOrder, "checked">[];
};

export type SourceHealth = {
  id: string; // "ok", "tx", ...
  state: string;
  ok: boolean;
  checked: string; // ISO
  error?: string;
  counties: number; // distinct counties with a mapped report
  bans: number;
  /** "full" = negatives are trustworthy; "positive-only" = absence means unknown, not none */
  mode: "full" | "positive-only" | "manual";
  scope?: CountyStatus["scope"];
  officialUrl?: string;
  product?: "fire-weather";
};

export type SnapshotData = {
  generated: string; // ISO
  /** keyed by 5-digit FIPS; counties missing here are "unknown" */
  counties: Record<string, CountyStatus>;
  sources: SourceHealth[];
  /** fips -> ISO time the status last changed (persisted across snapshots, used for sitemap lastmod) */
  changed: Record<string, string>;
  /** Normalized source revisions used to publish this snapshot. */
  sourceVersions?: Record<string, string>;
  /** Weather evidence used to decorate county results at read time. */
  fireWeather?: Record<string, { alerts: FireWeatherAlert[]; orders?: FireWeatherOrder[] }>;
};

/** Legacy aggregate and the merge engine's working shape. */
export type Snapshot = SnapshotData & { version: 1 };

export type Coverage = "live" | "restrictions" | "directory";

export type StateDirectoryEntry = {
  abbr: string;
  name: string;
  coverage: Coverage; // live = we have a county status feed; restrictions = permit/danger/land-manager feed; directory = link only
  publisher: string; // "Oklahoma Forestry Services"
  officialUrl: string; // human page
  extraUrls?: { label: string; url: string }[];
  notes: string; // one or two plain sentences on who issues bans there and at what level
};

export type LookupResult = {
  query: { zip?: string; lat?: number; lon?: number; fips?: string; city?: string; state?: string };
  /** set for city= lookups: the matched incorporated place and its page (or its county page when it has none) */
  place?: { name: string; state: string; url: string; counties: string[] };
  /** true if a ZIP touches more than one county; UI should ask the user to pick */
  ambiguous: boolean;
  /** true if the ZIP was not in Census ZCTA data and we used the nearest ZIP */
  approximate: boolean;
  results: (CountyStatus & { url: string })[]; // url = canonical county page path, e.g. /us/ok/tulsa-county/
  disclaimer: string;
};
