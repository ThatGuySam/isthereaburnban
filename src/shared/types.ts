// Shared contract between the data Worker, the API, the MCP tools and the Astro pages.
// Keep this file the single source of truth for status shapes.

/**
 * ban          - source reports an active burn ban for this county
 * restricted   - partial / activity-specific / permit restrictions (e.g. ozone alert, permits required)
 * none         - feed reports no temporary order within its defined reporting scope
 * unknown      - county status is unconfirmed. NEVER show "Nope" for this.
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
  label: string; // normalized human-readable description
  since: string | null; // issuer-provided effective date or timestamp
  firstSeenAt?: string | null; // when we first recorded a report for this county
  statusChangedAt?: string | null; // when we last observed a change to the published answer
  expires: string | null; // ISO date if the source gives one (MS)
  sourceUpdated: string | null; // ISO, source's own update/edit time if exposed
  checked: string | null; // last successful source check, if known
  lastAttemptedAt?: string; // latest attempt for this report's source, when available
  sourceCheckFailed?: true; // a failed latest attempt can coexist with an earlier report
  sourceName: string; // "Oklahoma Forestry Services"
  sourceUrl: string; // retrieved publication, when available
  officialUrl: string; // issuing order, agency report, or official directory
  note?: string; // scope caveat, e.g. "County bans cover unincorporated areas"
  scope?: "county" | "part" | "state";
  scopeNote?: string;
  standing?: true; // ongoing, activity-specific rule
  scopedBan?: true; // explicit ban in part of the county
  sourceId?: string;
  validFrom?: string; // start instant for a dated or scheduled decision
  validUntil?: string; // instant after which short-lived decisions are unconfirmed
  /** Broader report when a scoped order supplies the headline. */
  countywide?: Pick<CountyStatus, "status" | "label" | "checked" | "sourceId" | "sourceName" | "sourceUpdated" | "officialUrl">;
  orders?: ScopedOrder[];
  alerts?: FireWeatherAlert[];
};

export type ScopedOrder = Pick<CountyStatus, "status" | "label" | "note" | "since" | "expires" |
  "sourceId" | "sourceName" | "sourceUpdated" | "officialUrl" | "validFrom" | "validUntil" | "standing" | "scopedBan"> & {
  sourceUrl?: string;
  checked: string;
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
  checked: string; // compatibility alias for the source check time
  lastAttemptedAt?: string | null;
  lastSuccessfulAt?: string | null;
  error?: string;
  counties: number; // distinct counties with a mapped report
  bans: number;
  /** Full feeds can supply explicit negatives within their scope. Positive-only omissions stay unknown. */
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

/** A revision-pinned map of known county answers. An omitted FIPS is unknown. */
export type MapStatus = {
  revision: string;
  expiresAt: number; // UTC epoch milliseconds
  counties: Partial<Record<string, Exclude<BanStatus, "unknown">>>;
};

export type PlaceStatus = BanStatus | "depends";

export type LookupResult = {
  answer: PlaceStatus;
  generated: string | null; // publication time, if we looked up county status
  query: { zip?: string; lat?: number; lon?: number; fips?: string; city?: string; state?: string; here?: true };
  /** set for city= lookups: the matched incorporated place and its page (or its county page when it has none) */
  place?: { name: string; state: string; url: string; counties: string[]; localRulesUrl?: string };
  /** true if a ZIP touches more than one county; UI should ask the user to pick */
  ambiguous: boolean;
  /** An approximate result contains county candidates pending confirmation. */
  approximate: boolean;
  matchedZip?: string;
  approximationReason?: string;
  results: (CountyStatus & { url: string })[]; // url = canonical county page path, e.g. /us/ok/tulsa-county/
  disclaimer: string;
};
