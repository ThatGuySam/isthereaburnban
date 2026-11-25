# Wisconsin DNR burn permit fixture

The unmodified JSON response contains 72 county records. The request completed at 2026-11-24 05:22:14 UTC (November 23, 11:22 p.m. Central Standard Time). [Exact GET for `permits-2026-11-24.json`](https://apps.dnr.wi.gov/forestryapps/burnrestriction/json/).

The CSV and ArcGIS county attributes corroborated the permit text and edit times. The Nov. 18–23 timestamps are county edit times. The web map's “Data as of” clock uses the visitor's time and refreshes every five minutes. The parser uses only records edited on the current Central calendar day through local midnight. Some protection areas have an earlier edit even though the text says “today.” [DNR text lookup and exports](https://apps.dnr.wi.gov/forestryapps/burnrestriction), [CSV](https://apps.dnr.wi.gov/forestryapps/burnrestriction/csv/), [attribute query](https://dnrmaps.wi.gov/arcgis/rest/services/FR_WIS_BURN/FR_WIS_BURN_MAP_EXT/MapServer/13/query?where=1%3D1&outFields=*&returnGeometry=false&f=json).

The fixture includes 31 permit-limit records, 12 summer and fall permit exemptions and 29 local referrals. Vilas qualifies its limits by snow cover. Oconto distinguishes its northern and southern townships. The map's `NO_BURN_FLAG` is set on some routine hours and size restrictions and is unsafe as a closure code.

## Local status panels

Captured by curl at 06:00 UTC on November 25, 2026 (the November 24 county pass crossed Central midnight). The fixtures retain the status sections and omit unrelated page content.

- `burlington-fire.html` from [Town of Burlington Fire Department](https://www.townofburlingtonwi.gov/fire-department/). The current status is a text block. The earlier town lift notice corroborates the clear panel.
- `somerset-permits.html` from [Somerset Fire & Rescue burning permits](https://somersetfirerescue.com/burning-permits/). The original Elementor markup includes both alternatives. The Advanced Elementor visibility class suppresses the ban panel in this capture.

## Local standing rules

Captured from 06:02 to 06:23 UTC on November 25, 2026. Each filename under
`local/` matches the rule ID in [local-rules.ts](../local-rules.ts), which records
the exact request URL, publisher and selected region. HTML fixtures retain the
publisher's selected content. PDF fixtures are the original public documents
because verification compares their byte hashes. These snapshots are used
to verify local rules and their geographic boundaries.

## Official notice feeds

- `clinton-orders.json` was captured at about 06:14 UTC on November 25 from the [Town of Clinton WordPress search](https://tn.clinton.wi.gov/wp-json/wp/v2/posts?search=burn+ban&per_page=100&_fields=id%2Cdate_gmt%2Ctitle%2Clink%2Ccontent). It includes the countywide March 1 and March 17, 2024 notices, and both matching cancellations.
- `menomonee-safety.xml` is the [CivicPlus Safety Strategies RSS feed](https://www.menomoneefalls.gov/RSSFeed.aspx?ModID=1&CID=Safety-Strategies-16) captured at 06:13 UTC on November 25. The feed had no active items. The `menomonee-current-article.html` and `menomonee-archive-ban.html` excerpts show the markup of a [published Safety Strategies article](https://www.menomoneefalls.gov/m/newsflash/home/detail/1787) and the [archived March 2025 village ban](https://www.menomoneefalls.gov/CivicAlerts.aspx?AID=1678&ARC=3296).
