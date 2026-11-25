# Wisconsin DNR burn permit fixture

The unmodified JSON response contains 72 county records. The request completed at 2026-11-24 05:22:14 UTC (November 23, 11:22 p.m. Central Standard Time). [Exact GET for `permits-2026-11-24.json`](https://apps.dnr.wi.gov/forestryapps/burnrestriction/json/).

The CSV and ArcGIS county attributes corroborated the permit text and edit times. The Nov. 18–23 timestamps are county edit times. The web map's “Data as of” clock uses the visitor's time and refreshes every five minutes. The parser uses only records edited on the current Central calendar day through local midnight. Some protection areas have an earlier edit even though the text says “today.” [DNR text lookup and exports](https://apps.dnr.wi.gov/forestryapps/burnrestriction), [CSV](https://apps.dnr.wi.gov/forestryapps/burnrestriction/csv/), [attribute query](https://dnrmaps.wi.gov/arcgis/rest/services/FR_WIS_BURN/FR_WIS_BURN_MAP_EXT/MapServer/13/query?where=1%3D1&outFields=*&returnGeometry=false&f=json).

The fixture includes 31 permit-limit records, 12 summer and fall permit exemptions and 29 local referrals. Vilas qualifies its limits by snow cover. Oconto distinguishes its northern and southern townships. The map's `NO_BURN_FLAG` is set on some routine hours and size restrictions and is unsafe as a closure code.

## Local status panels

Captured by curl at 06:00 UTC on November 25, 2026 (the November 24 county pass crossed Central midnight). The fixtures retain the status sections and omit unrelated page content.

- `burlington-fire.html` from [Town of Burlington Fire Department](https://www.townofburlingtonwi.gov/fire-department/). The current status is a text block. The earlier town lift notice corroborates the clear panel.
- `somerset-permits.html` from [Somerset Fire & Rescue burning permits](https://somersetfirerescue.com/burning-permits/). The original Elementor markup includes both alternatives. The Advanced Elementor visibility class suppresses the ban panel in this capture.
