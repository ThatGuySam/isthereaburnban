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

`checked` records the last successful check. Use `sourceUpdated` for a publisher timestamp and `since` or `expires` for dates actually supplied by the issuer. Optional `validFrom` and `validUntil` UTC instants guard short-lived decisions. Dated upcoming local reports can appear in notes before activation. A failure keeps the last verified rows through the freshness window. Stale data become unknown and missing evidence gives no permission to burn.

### Stack groups

| Inventory stack or shape | Shared helper | Sources and use |
| --- | --- | --- |
| Every HTTP publisher | `http.ts` | User agent, deadlines, bounded bodies, validators, retry backoff, and typed access blocks |
| FeatureServer and MapServer | `arcgis.ts` | OK, TX, FL, IN, LA, IA, NJDEP divisions, AK permit zones, ND declarations, and WY county layers. Read coded domains, edit stamps, and all pages. |
| Dashboard, Experience, WebMap | `arcgis.ts` | Southwest interagency Experience, Florida and Montana dashboards. Follow item data to operational layers and select the layers that establish status. |
| CivicPlus/CivicEngage, Granicus and municipal portals | `civicplus.ts`, `html.ts` | Pima, Angel Fire, Placer and Greenwich notices, Puget Sound status table, Boulder govDelivery. Pair issue and lift notices by authority and effective date. |
| WordPress | `wordpress.ts`, `html.ts` | Faulkner homepage and REST search, Mississippi Ninja Tables, WV Forestry and SC Forestry. Check that the REST content type actually carries status. |
| Drupal, Sitecore, Liferay and other HTML | `html.ts`, `dates.ts` | CAL FIRE, CARB PFIRS, Vermont FPR, NC Forest Service. Stream tables and heading blocks with HTMLRewriter in Workers. The fallback runs in Bun. |
| ASP.NET WebForms and DNN | `aspnet.ts`, `html.ts` | Michigan township lookup and Alabama Forestry. Prefer a direct GET before same-origin navigation postbacks. |
| SharePoint | `sharepoint.ts`, `html.ts` | Kentucky current list, Maryland DNR, Oregon DEQ and Sacramento Metro AQMD. Use the rendered list or the public `_api/web/lists` endpoint where available. |
| JSON, GeoJSON, CSV, RSS and Atom | `feeds.ts`, `dates.ts` | Wisconsin DNR, Texas UTF-16 RSS, Maine class days, Minnesota CGI, Idaho DEQ, Tennessee fiResponse. Verify the schema, date and explicit codes. |
| PDF, signed order, map or workbook | `pdf.ts` for PDFs | Pennsylvania DCNR, Faulkner orders, Missouri SEMA. The manual PDF helper records Last-Modified and SHA-256. Use publisher HTML or a structured export for automated status. XLSX needs its own implementation and timing. |
| Statute or standing seasonal rule | `calendar.ts`, `dates.ts` | NY brush, GA EPD's 54 counties, OH unincorporated areas, VA 4 p.m., WV fire seasons, and MD woodland limits. The presets are available for future state registrations. |
| Forecast or hazard tied to an explicit rule | `feeds.ts` or `arcgis.ts` plus the issuer's rule | ND declaration triggers, Maine town permits. Forecast alone is context. Federal and tribal supplements use their own scope. |

## Refresh and deploy

The hourly cron posts a source message for each due publisher and a merge message delayed by two minutes. The consumer handles one message at a time. Source fetchers compare normalized hashes and write `source:<id>` and `source:<id>:hash` only on a changed revision. D1 keeps small source health and validator records. A merge checks the current revision signature and validity windows before loading rows. A visible-revision check guards against delayed KV reads. D1 commits the publication checkpoint, transition rows, and pending alert run together. The same run ID reaches the existing notification claim after retry. Provider delivery still follows the existing delivery semantics, including the Web Push claim before transport.

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

The deploy lead creates the queue and applies the D1 migration before deploying the configured Worker.

```sh
bunx wrangler queues create isthereaburnban-sources
bunx wrangler d1 migrations apply isthereaburnban --remote
bun run deploy
```

The current cadence schedules 194 polls and 24 merges on a normal day. If every poll changes, that is 412 KV writes and about 654 queue operations before retries. Registry tests budget two KV writes per changed poll and one per hourly publication, so future registrations need cadences that fit the free allocation. Keep an eye on the 2 MB D1 checkpoint size as the snapshot gains scoped orders. The 51-area timing exceeds the 7 ms review threshold in the benchmark. Recheck the production merge CPU before enabling that much coverage. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Queues limits](https://developers.cloudflare.com/queues/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

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
10. Oregon — `feeds.ts` and `wordpress.ts` for LRAPA's Lane County advisory.
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
