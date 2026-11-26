# Alaska county source captures

Curl captured the public responses on November 26, 2026 UTC with the site status checker's user agent. HTML fixtures retain the selected source content, with unrelated navigation, scripts, and forms removed. PDF headers come from HEAD. The gzip fixture expands to the complete Whittier PDF response body. The reporting replay uses November 24 for the standing rules and North Pole relay. Juneau’s later fixture is tested on its own publication clock.

| Fixture | Request | Captured UTC |
| --- | --- | --- |
| `akutan-outdoor-waste.headers.json` | [DCRA copy of the Akutan Municipal Code](https://www.commerce.alaska.gov/web/Portals/4/pub/LGS/Code_library/Akutan%20Municipal%20Code.pdf) | 10:38 |
| `unalaska-burn-permit.html` | [Unalaska Public Safety](https://www.unalaska.gov/publicsafety/page/burn-permits) | 10:30:53 |
| `anchorage-clean-air.html` | [Anchorage Clean Air Ordinance](https://ecode360.com/49391708) | 10:32:53 |
| `valdez-open-fires.html` | [Valdez Fire Department](https://www.valdezak.gov/300/Open-Fires) | 10:31:20 |
| `whittier-open-burning.pdf.gz` | [Whittier Ordinance 2024-001](https://mcclibraryfunctions.azurewebsites.us/api/ordinanceDownload/17040/1276304/pdf) | 10:33:30 |
| `chitina-campfire-rings.html` | [Ahtna visitor rules for the Deyighił’aaden Cultural District](https://www.ahtna.com/lands/chitina/) | 10:41:17 |
| `anderson-brush-season.html` | [Anderson Chapter 6.12](https://anderson.govoffice.com/index.asp?DE=B569B699-8C46-4D1B-9478-837E6ADF5348&SEC=92B5E379-4A07-4C2F-83B9-002F33418204) | 10:43:51 |
| `denali-park-winter-fires.headers.json` | [Denali Superintendent’s Compendium](https://home.nps.gov/locations/alaska/upload/Denali-Superintendents-Compendium.pdf) | 10:44 |
| `dillingham-open-burning.html` | [Dillingham Chapter 11.12](https://ecode360.com/47493138) | 10:31:41 |
| `haines-fire-service-permit.html` | [Haines Borough Code §15.08.080](https://hainesborough.borough.codes/HBC/15.08.080) | 10:44:32 |
| `hoonah-outdoor-waste.html` | [Hoonah Code §13.08.050](https://hoonah-ak.elaws.us/code/coor_title13_ch13.08_sec13.08.050) | 10:44:33 |
| `pelican-outdoor-waste.html` | [Pelican Code §8.04.090](https://ecode360.com/44321935#44321940) | 10:52:35 |
| `juneau-burn-permit.html`, `juneau-residential-winter.html` | [Capital City Fire/Rescue permit information](https://juneau.org/fire/burn-permit-info) | 10:30:44 |
| `juneau-woodsmoke-alert.html` | [Juneau air quality advisory](https://juneau.org/lands/air-quality) | 10:30:58 |
| `homer-burn-permit.html` | [Homer Volunteer Fire Department](https://www.cityofhomer-ak.gov/fire/burn-permits) | 10:31:20 |
| `kenai-burn-permit.html` | [City of Kenai FAQ](https://www.kenai.city/faqs) | 10:31:20 |
| `ketchikan-burn-permit.html` | [Ketchikan Fire Department](https://www.ketchikan.gov/kfd-services) | 10:32:04 |
| `kodiak-road-burn-permit.html` | [Kodiak Island Borough fire protection](https://www.kodiakak.us/124/Burn-Permit-Regulations) | 10:31:20 |
| `houston-open-burning.html` | [Houston Chapter 8.10](https://ecode360.com/49190287) | 10:31:21 |
| `utqiagvik-bonfires.html` | [Utqiaġvik Chapter 8.18](https://ecode360.com/47619695) | 10:32:35 |
| `petersburg-burn-permit.html` | [Petersburg Fire Department](https://www.petersburgak.gov/publicsaf/webform/burn-permit-required-open-burning) | 10:32:05 |
| `craig-open-burning.html` | [Craig Chapter 8.06](https://ecode360.com/51901371) | 10:45:45 |
| `sitka-burn-permit.html` | [Sitka Fire Department](https://www.cityofsitka.com/Government/City-Departments/Fire-Department/Burn-Permits) | 10:32:35 |
| `skagway-burn-permit.html` | [Skagway Fire Department](https://www.sgyfire.org/burn-permits) | 10:33:41 |
| `wrangell-open-burning.html` | [Wrangell Fire Code §18.16.060](https://ecode360.com/46986927) | 10:44:33 |
| `fairbanks-air-alert.html` | [NWS Fairbanks AQA product](https://forecast.weather.gov/product.php?issuedby=AFG&product=AQA&site=NWS) | 10:33:46 |
| `fairbanks-air-alert-scheduled.html`, `fairbanks-air-alert-cancelled.html`, `fairbanks-air-alert-overlap.html` | [Iowa State’s archive of NWS AQAAFG products](https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py?pil=AQAAFG&sdate=2025-10-01&edate=2026-04-01&fmt=text&limit=300&dl=1) | 10:42:27 |

The NWS relay carried the November 24 North Pole Stage 2 order through November 26 at 2 p.m. AKST. Its headline and DEC message body agree on that time. The archived November 12, November 26 and December 10, 2025 products preserve a scheduled start, a cancellation, and two headline windows with a stage decision assigned to only one. The archive text is wrapped in the NWS page’s `<pre>` selector for replay. [DEC order](https://dec.alaska.gov/Applications/Air/airtoolsweb/Home/ViewAttachment/17257061/YN4AtuRrYsePCxSnISINIQ2)

Juneau’s GravityView card displayed the green icon at November 25, 08:52:48 local time. Juneau describes the meanings of the red and green assets in public WordPress media metadata. The red asset expressly declares an air emergency. The green card did not publish a restriction. [Asset catalog](https://juneau.org/wp-json/wp/v2/media?search=burn_status&per_page=30&_fields=source_url,alt_text,title)

The Denali compendium distinguishes the 1980 additions from the former Mount McKinley park. Subtract the NPS former-park KML polygon from its current park-and-preserve outline and intersect the result with Census county-equivalent polygons. Denali and Matanuska-Susitna boroughs contain the additions. The sliver along the Yukon–Koyukuk boundary is below 0.5% of either area and is excluded. The NPS outlines were captured November 26 at 10:55 UTC. The park outline SHA-256 was `9af0bb5a309fdcd31f9b7408ddbaa37d7fa6b3bb01f0acf28870a54aded61544` and the former park outline was `54a8fc4ccf1a6e859ba6cc134b41ea6dda076b364c973f6e6c4a01db91fba716`. The county archive matches the statewide pass’s pinned SHA-256. [Current park outline](https://home.nps.gov/dena/planyourvisit/upload/Park-Outline-Denali-NP.kmz) · [Former park outline](https://home.nps.gov/dena/planyourvisit/upload/Former-Mt-McKinley-National-Park.kmz) · [Census geometry](https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip)

## Nixle

The live Wire pages had no current burn notice. Historical issues and lifts exercise the format. The expiry badge describes the availability of the web message. A restriction based on Nixle can expire from the map when the evidence ages out.

| Fixture prefix | Request | Captured UTC |
| --- | --- | --- |
| `nixle-haines-current-wire` | [Haines Police Wire](https://local.nixle.com/haines-borough-police-department) | 10:37:06 |
| `nixle-haines-issue-wire` | [Haines archive, page 3](https://local.nixle.com/haines-borough-police-department?page=3) | 10:37:14 |
| `nixle-haines-lift-wire` | [Haines archive, page 2](https://local.nixle.com/haines-borough-police-department?page=2) | 10:37:13 |
| `nixle-haines-issue-notice` | [Permit suspension](https://nixle.us/HJESZ) | 10:37:25 |
| `nixle-haines-lift-notice` | [Burning permitted subject to permits](https://nixle.us/HJXMM) | 10:38:47 |
| `nixle-haines-campfires-notice` | [Campfire ban](https://nixle.us/HJNPR) | 10:38:49 |
| `nixle-haines-correction-notice` | [Permit suspension correction](https://nixle.us/HHJF5) | 10:37:28 |
| `nixle-haines-contextual-correction-notice` | [Permit suspension context](https://nixle.us/HHJE3) | 10:38:33 |
| `nixle-skagway-current-wire` | [Skagway Police Wire](https://local.nixle.com/skagway-police-department) | 10:37:29 |
| `nixle-skagway-issue-wire` | [Skagway archive, page 4](https://local.nixle.com/skagway-police-department?page=4) | 10:37:59 |
| `nixle-skagway-lift-wire` | [Skagway archive, page 3](https://local.nixle.com/skagway-police-department?page=3) | 10:37:58 |
| `nixle-skagway-issue-notice` | [Municipal burn ban](https://nixle.us/HJKY3) | 10:38:09 |
| `nixle-skagway-lift-notice` | [Municipal burn ban lift](https://nixle.us/HK237) | 10:38:10 |
| `nixle-skagway-unexpired-road-notice` | [Unexpired road notice for HTML shape](https://nixle.us/HWDD3) | 10:43:15 |
