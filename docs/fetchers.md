# Burn-ban sources

The [coverage audit](research/coverage/burn-ban-coverage-sources-2026-11-23.md) and its [445-source inventory](research/coverage/sources.json) describe candidate publishers and observed access. The [registry](../src/worker/sources/registry.ts) tracks the publishers implemented in the Worker and known manual sources. California's [CARB PFIRS adapter](../src/worker/sources/ca/pfirs.ts) is the reference for HTML and sub-county decisions.

## Add a state

1. Pick the strongest official source from the inventory. Check the stack, data shape, extraction hint, and fetch outcome. Confirm who can issue or lift an order, its activity and geographic boundaries, its dates, and whether an empty response establishes anything. For an HTML-only area, have one Sol subagent investigate the publisher and its available public inputs before moving to the next area.
2. Choose a helper from the table below. Try the official public GET, endpoint, or embed. Record a reproducible access block and keep that source manual. A stable scoped fallback can still cover part of the state.
3. Capture a dated fixture in `src/worker/sources/<st>/fixtures/`. Keep the publisher's table, headings, codes, encoding and dates intact. Trim unrelated navigation or scripts if needed. Record the exact request URL and the capture time in the fixture directory. Keep transient cookies and account data out of fixtures.
4. Write a small parser that validates required rows, fields, scope, and freshness before returning `CountyStatus[]`. Test the real fixture, a stale or changed page, an unknown value, and any mapped partial geography. Add the parser and representative fixture to `scripts/bench-sources.ts`.
5. Register the parser in `src/worker/sources/registry.ts` with its own stable ID, stack, strongest scope, mode, coverage, source and official URLs, and cadence. Use local daily hours such as `{ kind: "daily", zone: US_ZONES.Eastern, hours: [9] }` for daily publications. A fetch can return validators after successful parsing and return `notModified` on HTTP 304. Time-dependent parsers should also evaluate effective dates and local schedules when response bytes stay the same.
6. Match `src/data/states.json` to the registered coverage. Use `live` for operational countywide reports and `restrictions` for scoped or activity-specific reports. Use `positive-only` when omissions leave status unconfirmed. Add the official public link and a short description of who issues orders.
7. Run the checks below. For a terminal check, dispatch the hourly cron locally and verify both the coverage response and a representative county result after the merge delay.

```sh
state=mi
fixture_url='https://www2.dnr.state.mi.us/burnpermits/'
mkdir -p "src/worker/sources/$state/fixtures"
curl --fail --location --max-time 20 \
  --user-agent 'isthereaburnban.com status checker (+https://isthereaburnban.com/developers/)' \
  -o "src/worker/sources/$state/fixtures/status.html" "$fixture_url"
bun test
bunx tsc --noEmit
bun run bench:sources
bun run check-links
```

Set `state` and `fixture_url` for the publisher you are adding. The link checker deduplicates state and registry URLs and external anchors and iframes in `dist/` HTML when present. It reports access blocks separately and exits nonzero for other HTTP failures, DNS, and TLS failures.

### Scope and dates

Give each town, city, fire or air district, tribal authority, or land manager a `scope: "part"` row with a precise `scopeNote`. Multiple part rows can share a county FIPS. The merge preserves those rows in `orders` and references them in `note`. A county or statewide answer supplies the main status. With local evidence alone, a ban or active restriction produces a scoped `restricted` summary. A local permissive day leaves countywide status `unknown`. A statewide or countywide source can also report `restricted` for limits on specific activities.

`checked` records the last successful check. Use `sourceUpdated` for a publisher timestamp, `since` for an effective date supplied by the publisher, and `expires` for a stated end. The merge records its own observations in `firstSeenAt` and `statusChangedAt`. Optional `validFrom` and `validUntil` UTC instants guard short-lived decisions. Dated upcoming local reports can appear in notes before activation. A failure keeps the last verified rows through the freshness window. Stale data become unknown and missing evidence gives no permission to burn.

Use `reportingFips` for a positive-only source with a verified county footprint so an outage can appear on those county results, including before a first successful poll. A reviewed statutory fallback keeps its own review dates and local validity window. The last live check remains separate, and a confirmed change in the publisher's rule suspends the fallback pending verification.

### Stack groups

| Inventory stack or shape | Shared helper | Sources and use |
| --- | --- | --- |
| Every HTTP publisher | `http.ts` | User agent, deadlines, bounded bodies, validators, retry backoff, and typed access blocks |
| FeatureServer and MapServer | `arcgis.ts` | OK, TX, FL, IN, LA, IA, NJDEP divisions, ODF regulated-use areas, AK permit zones, ND declarations, WY county layers and Dickinson County, KS fire districts. Read coded domains or subtypes, edit stamps, and all pages. |
| Dashboard, Experience, WebMap | `arcgis.ts` | Southwest interagency Experience, Florida and Montana dashboards. Follow item data to operational layers and select the layers that establish status. |
| Google My Maps KML | `kml.ts` | Eagle County's unincorporated areas. Verify the publisher's legend and named placemarks before interpreting outline colors. |
| CivicPlus/CivicEngage, Granicus and municipal portals | `civicplus.ts`, `html.ts`, `county-bulletin.ts` | Pima, Angel Fire, Placer and Greenwich notices, Puget Sound status table, Boulder GovDelivery, and Washington county banners and alert cards. Pair issue and lift notices by authority and effective date. |
| eCode360 municipal codes | `ecode360.ts`, `local-calendar.ts` | New York local ordinances. Verify the numbered sections in the published code and link directly to the ordinance. |
| Apptegy news listings | `apptegy.ts`, `dates.ts` | Gatlinburg permit notices. Check the archive dates and article body for the issuing authority and explicitly covered days. |
| WordPress | `wordpress.ts`, `html.ts` | Faulkner homepage and REST search, Mississippi Ninja Tables, WV Forestry and SC Forestry. Check that the REST content type actually carries status. |
| Drupal, Sitecore, Liferay and other HTML | `html.ts`, `dates.ts` | CAL FIRE, CARB PFIRS, Vermont FPR, NC Forest Service. Stream tables and heading blocks with HTMLRewriter in Workers. The fallback runs in Bun. |
| ASP.NET WebForms, MVC and DNN | `aspnet.ts`, `html.ts` | Michigan township lookup, Alabama Forestry and LRAPA's Syncfusion advisory grids. Prefer a direct GET. Read literal grid JSON without executing scripts. |
| Public HTML forms with first-party sessions | `form-session.ts`, `html.ts` | Montana county permit status and county FAQs. Submit the public county selector, check the exact redirect, and read the matching county page. Keep session cookies in memory for that fetch. |
| SharePoint | `sharepoint.ts`, `html.ts` | Kentucky current list, Maryland DNR, Oregon DEQ and Sacramento Metro AQMD. Use the rendered list or the public `_api/web/lists` endpoint where available. |
| JSON, GeoJSON, CSV, RSS and Atom | `feeds.ts`, `dates.ts` | Wisconsin DNR, Texas UTF-16 RSS, Maine class days, Minnesota CGI, Idaho DEQ, Tennessee fiResponse. Verify the schema, date and explicit codes. |
| County or district status roster | `county-bulletin.ts`, `html.ts` | Olympic Region Clean Air Agency, Kittitas fire districts, and regional and district status panels. Require each named area once and keep restrictions scoped to the issuing jurisdiction. |
| Public Firestore document and calendar query | `firestore.ts`, `dates.ts` | Georgia Burn Permits. Confirm the local fire authority uses the program, request only status fields and query the local day. An empty calendar leaves the countywide status unknown. |
| EPA AirNow reporting area file | `airnow.ts`, `dates.ts` | Delaware Action Days. Use the issuing agency's dated forecast and explicit Action Day flag. Map reporting areas to their verified scope. |
| PDF, signed order, map or workbook | `pdf.ts` for PDFs | Pennsylvania DCNR, Faulkner orders, Missouri SEMA. The manual PDF helper records Last-Modified and SHA-256. Use publisher HTML or a structured export for automated status. XLSX needs its own implementation and timing. |
| Statute or standing seasonal rule | `calendar.ts`, `dates.ts` | NY brush, GA EPD's 54 counties, OH unincorporated areas, VA 4 p.m., WV fire seasons, MD woodland limits and KS April limits. The presets are available for future state registrations. |
| Forecast or hazard tied to an explicit rule | `feeds.ts` or `arcgis.ts` plus the issuer's rule | ND declaration triggers, Maine town permits. Forecast alone is context. Federal and tribal supplements use their own scope. |

### National fire weather

The `nws-fire-weather` source runs in the hourly queue. It requests the NWS active CAP GeoJSON feed with a comma-separated event filter and the developer contact in its User-Agent. Fire-danger Special Weather Statements are identified from their fire-specific headlines. The queue stores these reports separately from burn status, and the Worker projects current `alerts` onto county rows for the API and MCP. Verified weather-triggered rules appear as scoped restrictions with their own citation. The status history and notification queue use the underlying burn-status records.

The crosswalk is a checked-in build input. Regenerate it after an NWS boundaries release using `uv run --no-project scripts/build-nws-zone-counties.py`. The script verifies the pinned inputs, intersects fire-weather zones with county geometry, and uses the NWS correlation file for public forecast zones. It also joins the Census boundary for Kalawao County, which the NWS groups with Maui. The Worker uses SAME county codes where available and UGC county or zone codes for the remaining mapping. [NWS API](https://www.weather.gov/documentation/services-web-api), [NWS fire zones](https://www.weather.gov/gis/firezones), [NWS zone-county correlation](https://www.weather.gov/gis/ZoneCounty), [Census boundary files](https://www.census.gov/geographies/mapping-files/2025/geo/carto-boundary-file.html).

## Snapshot architecture

The hourly cron posts jobs for due publishers and a merge coordinator delayed by two minutes. Small Montana publishers with a shared cadence use bounded group messages to fit the daily queue budget. The queue consumer runs one job at a time and checkpoints each publisher's normalized hash, health, validators and changed payload in D1. A retry skips any publisher already checked for the slot. NWS has a national health record and state-level payload hashes, so a change in one alert area can leave other states alone. The coordinator compares each state's source hashes, health and effective-date boundaries with the last published signatures. It schedules one invocation per dirty state, including during a 51-area rebuild.

Each state job reuses the existing merge rules and journals its shard, transition rows and pending notices together in D1. National active-list jobs join prepared state fragments. The final catalog points at the published revisions and carries the national generation time, source health, scoped-order check times and sitemap lastmod dates. Retries resume the same cursor and reuse the same notification run ID. Email grouping and the existing Web Push claim before transport also apply to these runs.

| Binding | Published data and readers |
| --- | --- |
| `KV` | `snapshot:v2:<ST>` holds a state shard. County and city pages, status API and MCP lookups, and state sitemaps use the relevant shard. Border ZIPs can use more than one. |
| `KV` | `snapshot:v2:index` is the small catalog for coverage, the sitemap index, and revision checks for all shards. `snapshot:v2:active` serves the paged national bans API, MCP, and the fire-weather API. The map endpoint reads revision-pinned state shards in batches and returns only per-FIPS statuses and a short expiry. Date, health and weather changes are checked at read time. |
| `DB` | Stores source heads and normalized payloads, the resumable publication cursor, and the last three revisions of each state. A reader can fetch the exact revision from D1 when KV is unavailable or returns another revision. If a cached catalog predates the retained revisions, the request retries using the committed D1 catalog. State staging records the combined UTF-8 byte count in `snapshot_state.encoded_bytes` and splits rows starting at 1.75 MB. |
| `SOURCE_QUEUE` | Carries source polls, the merge coordinator and publication continuations. Keep the consumer at one concurrent invocation. |

`CountyStatus`, `SourceHealth`, and `LookupResult` define the public contract in `src/shared/types.ts`. `Snapshot` is the v1 working shape and rollout fallback. `StateSnapshot`, `SnapshotIndex`, and `ActiveProjection` describe the internal v2 formats in `src/worker/snapshot-v2.ts`. The Worker caches completed reads for up to 60 seconds in each isolate. [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/)

## Refresh and deploy

On a fresh queue-backed deployment, coverage is available while the first refresh is pending. Without a queue binding, `refresh(env)` runs the registered sources sequentially for local development and tests. For example, apply the local migration and run Wrangler in a separate process.

```sh
bunx wrangler d1 migrations apply isthereaburnban --local
bunx wrangler dev --local
```

In the Wrangler Local Explorer, use the scheduled request for the hourly cron, then allow the queue to process the delayed merge.

```sh
curl -fsS -X POST -H 'Content-Type: application/json' \
  -d '{"cron":"7 * * * *"}' \
  'http://localhost:8787/cdn-cgi/local/explorer/api/local/scheduled?worker=isthereaburnban-preview'
curl -fsS 'http://localhost:8787/api/v1/coverage'
```

For an existing environment, apply migration `0004_state_snapshots.sql` before deploying the Worker. The configured queue is reused. The first hourly run reads legacy source revisions as needed, drains any pending v1 notification run and rebuilds all 51 shards. Until v2 is published, readers can serve `snapshot:v1`. Verify the first v2 catalog and check CPU time for the source, publication and read invocations in Cloudflare before adding more sources.

```sh
bunx wrangler d1 migrations apply isthereaburnban --remote
bun run deploy
```

For a new environment, create the configured queue first with `bunx wrangler queues create isthereaburnban-sources`.

A full 51-area rebuild uses 53 KV writes in the queue tests, one per state plus the national projection and catalog. A single dirty state uses three writes. Unchanged hours use zero snapshot writes. At 53 writes each hour for 30 days, the publication baseline would be 38,160 writes before retries and operational writes, against 1 million writes included monthly on Workers Paid across the account. [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)

`bun run bench:sources` reports fixture parsing, legacy aggregate CPU, the highest state merge and cold-read p95, and a full rebuild summed across individual jobs. The regression test caps the 120-source fixture at 4 ms p95 per state merge and 2 ms p95 per shard read. The timings exclude Cloudflare binding and runtime overhead. National API and MCP pages default to 50 reports with a maximum of 100. Benchmarks report cold page reads and the largest combined encoded state row. The D1 row limit is 2 MB. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [KV limits](https://developers.cloudflare.com/kv/platform/limits/) · [Queues limits](https://developers.cloudflare.com/queues/platform/limits/) · [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

The v1 compatibility data reflect the cutover point. Rolling back to a v1-only Worker after new source heads have been written requires reconciling those D1 heads with their older KV payloads and preserving notification claims.

## Pipeline operations

The authenticated ops dashboard shows source check times, scheduled due times, roster counts, pending slots, dead letters, and automatic delivery backlog. Provision the `isthereaburnban-sources-dlq` Cloudflare queue before deploying the consumer configuration. The consumer stores exhausted messages in D1. Use **Replay** on the dashboard after correcting the underlying failure. Replays use the original source slot or publication ID.

Operational alerts open after a full feed misses two scheduled checks, or a previously verified full feed falls below its expected roster. They go to canary devices registered on the ops dashboard and to `OPS_ALERT_EMAIL` if configured with Resend. They respect the alert pause. The dashboard records incidents even when a notification recipient has yet to be configured.

### California verification

On November 23 Pacific time, the local cron and delayed merge loaded all seven existing sources and mapped CARB's November 24 decisions to 31 California counties. The Lake County page displayed the upcoming agricultural and prescribed burn day and left countywide status unconfirmed. CAL FIRE returned an Akamai 403 and its listing remains manual. PFIRS polls after Pacific midnight and again after the deadline for deferred morning decisions. [CARB PFIRS](https://ssl.arb.ca.gov/pfirs/cb3/cb3.php), [CARB decision rules](https://ww2.arb.ca.gov/our-work/programs/agricultural-prescribed-burning/about).

The fixture benchmark measured 1.20 ms p95 for CARB, 3.25 ms for merging and encoding the current inputs, and 10.27 ms for parsing, merging and encoding a synthetic snapshot for all 51 state and district areas. These are Bun wall timings without network or production Worker overhead. The nationwide projection needs profiling before rollout.

## State order after California

1. Michigan — `aspnet.ts` and `arcgis.ts` for township permits and county summaries.
2. New Jersey — `arcgis.ts` for NJDEP division-level recreational and agricultural flags.
3. Wisconsin — `feeds.ts` for DNR JSON and CSV with permit scope.
4. Minnesota — `feeds.ts` and `html.ts` for CGI codes, dates, and legend.
5. Ohio — `calendar.ts` for the unincorporated-area daytime rule.
6. Georgia — `html.ts` and `dates.ts` for Gwinnett, then `calendar.ts` for the EPD counties.
7. Arizona — `civicplus.ts` and `html.ts` for Pima, then `arcgis.ts` for interagency orders.
8. Washington — `civicplus.ts` and `html.ts` for Puget Sound and King County, then `arcgis.ts` for DNR.
9. Colorado — `wordpress.ts` and `html.ts` for Douglas County and Boulder notices.
10. Oregon — `arcgis.ts` for ODF's public regulated-use view, `aspnet.ts` for LRAPA's Lane County grids and `html.ts` for the Willamette Valley bulletin.
11. Kentucky — `sharepoint.ts` for the positive-only current list.
12. Pennsylvania — `html.ts` and `pdf.ts` for DCNR's linked map and freshness check.
13. Idaho — `feeds.ts` and `arcgis.ts` for DEQ GeoJSON and land stages.
14. Alaska — `arcgis.ts` for DNR permit zones.
15. Utah — `arcgis.ts` for dated FFSL order polygons.
16. Montana — `html.ts` for Gallatin's district table, then `arcgis.ts` for DNRC.
17. Wyoming — `arcgis.ts` for county and state-land layers.
18. North Dakota — `arcgis.ts` and `feeds.ts` for effective declarations and rule inputs.
19. Nevada — `html.ts` for Truckee Meadows pile burning, then `arcgis.ts` for land-manager stages.
20. Arkansas — `wordpress.ts`, `html.ts` and `pdf.ts` for Faulkner orders and lifts.
21. South Carolina — `wordpress.ts` and `pdf.ts` for SCFC event notices.
22. North Carolina — `html.ts` and `dates.ts` for dated NCFS issue and lift notices.
23. Missouri — `pdf.ts` for SEMA change detection and a separate XLSX parser for DFS.
24. Tennessee — `html.ts` and `dates.ts` for county notices while verifying a current statewide feed.
25. New York — `calendar.ts` for DEC's brush-burning rule, `html.ts` for temporary orders.
26. Virginia — `calendar.ts` for the 4 p.m. rule, `wordpress.ts` for DOF notices.
27. West Virginia — `calendar.ts` for spring and fall, `wordpress.ts` for notices.
28. Maryland — `calendar.ts` and `sharepoint.ts` for forestry limits and local orders.
29. Vermont — `html.ts` for FPR's state-issued restrictions.
30. New Mexico — `civicplus.ts` and `html.ts` for Angel Fire, then `arcgis.ts` for verified orders.
31. Delaware — `calendar.ts` and `wordpress.ts` for the DNREC season and notices.
32. Massachusetts — `calendar.ts` and `html.ts` for the state season and town list.
33. Maine — `feeds.ts` and `html.ts` for class days paired with verified town triggers.
34. Connecticut — `html.ts` and `civicplus.ts` for permits and town notices.
35. Illinois — `civicplus.ts` and `html.ts` for county and district rules.
36. Kansas — `calendar.ts` and `html.ts` for the Sedgwick April rule and district guidance.
37. Alabama — `aspnet.ts`, `html.ts` and `calendar.ts` for Forestry orders and Jefferson County.
38. New Hampshire — `civicplus.ts` and `html.ts` for town permits and orders.
39. Nebraska — `html.ts` and `pdf.ts` for Governor orders and local permit rules.
40. Rhode Island — `html.ts` and `civicplus.ts` for DEM notices and town rules.
41. South Dakota — `html.ts` and `dates.ts` for county commission notices.
42. Hawaiʻi — `wordpress.ts`, `html.ts` and `pdf.ts` for county notices and DOH rules.
43. District of Columbia — `html.ts` and `pdf.ts` for activity and permit rules.
