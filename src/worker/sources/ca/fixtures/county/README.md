# California county fixtures

Captured on November 25, 2026. Times below are UTC. The dates in forecast filenames identify the report's target date where the publisher provides one. HTML captures retain the decision tables, notice language or reviewed rule text and the selectors needed to read them. Navigation, scripts, forms and unrelated subtrees were dropped from excerpts. The CARB rule pages, JSON bodies and PDFs are publisher responses.

## Decision publishers

| Fixture | Captured UTC | Request |
| --- | --- | --- |
| butte-2026-11-25.html | 20:09:48 | [Butte County AQMD open burning](https://www.bcaqmd.org/open-burning) |
| colusa-2026-11-25.html | 20:09:47 | [Colusa County APCD](https://countyofcolusaca.gov/461/Air-Pollution-Control-District) |
| eldor-2026-11-25.html | 20:08:52 | [El Dorado County burn day](https://www.eldoradocounty.ca.gov/Services/Burn-Day) |
| sierra-ag-2026-11-25.html | 20:09:47 | [Feather River AQMD, Streamline host](https://fraqmd.specialdistrict.org/burn-day-status) |
| imperial-2026-11-25.html | 20:09:48 | [Imperial County APCD](https://apcd.imperialcounty.org/) |
| mendo-2026-11-25.json | 20:09:47 | [Mendocino status endpoint](https://mcaqmd.org/wp-json/mcaqmd-burn/v1/status) |
| placer-2026-11-25.json | 20:10:24 | [Placer layer attribute query](https://services9.arcgis.com/NENkjkswKTzMfG3A/arcgis/rest/services/Burn_Day_Status_Public/FeatureServer/0/query?where=1%3D1&outFields=AreaName%2CareaDescription%2CstatusDateToday%2CburnStatusToday%2CstatusDateTomorrow%2CburnStatusTomorrow&returnGeometry=false&f=json) |
| no-portola-2026-11-25.html | 20:18:49 | [Greater Portola hub redirect](https://www.myairdistrict.com/greater-portola-area-hub) |
| sac-history-2026-11-25.json | 20:30:49 | [Sacramento 2026–2027 season-history data](https://sonomatech-production.s3.amazonaws.com/sacramento/airquality_org/cbyb-widget/burncheckHistoric_2026-2027.txt) |
| sbcfire-2026-11-25.html | 20:10:55 | [San Bernardino County Fire status](https://sbcfire.org/openburningstatus/) |
| coast-2026-11-25.json | 20:11:18 | [South Coast AQMD layer attribute query](https://services2.arcgis.com/I4NVzmfP3kyPvlVg/arcgis/rest/services/Burn_No_Burn_V2/FeatureServer/0/query?where=1%3D1&outFields=Burn%2CForecast&returnGeometry=false&f=json) |
| tehama-now-2026-11-25.html | 20:11:18 | [Tehama daily decision](https://www.tehcoapcd.net/todays-burn-day-decision/) |
| valley-2026-11-24.json | 20:10:23 | [Valley Air first forecast](https://valleyair.org/aqinfo/WebPageForecast00.json) |
| valley-2026-11-25.json | 20:10:26 | [Valley Air second forecast](https://valleyair.org/aqinfo/WebPageForecast01.json) |
| ventura-2026-11-25.html | 20:09:31 | [Ventura County APCD forecast redirect](https://www.vcapcd.org/Forecast.aspx) |
| yolo-2026-11-25.html | 20:09:47 | [Yolo-Solano AQMD homepage](https://www.ysaqmd.org/) |

Placer's Experience configuration identifies the public decision layer and its metadata identifies the status codes. The query returns epoch milliseconds at Pacific midnight. The three fixed city rows carry no daily dates and have a separate reviewed rule. [Experience item data](https://www.arcgis.com/sharing/rest/content/items/572b2af789e94b2f888c5e0c2b88a589/data?f=json) · [Layer metadata](https://services9.arcgis.com/NENkjkswKTzMfG3A/arcgis/rest/services/Burn_Day_Status_Public/FeatureServer/0?f=pjson)

South Coast's public map separates the forecast designation from the exempt polygon. Its home page specifies basin boundaries, fuels and exceptions. The observed designation was permissive. [South Coast web map](https://scaqmd-online.maps.arcgis.com/sharing/rest/content/items/83c9a5b8c56447c2adcc0d8dfc3e2d42/data?f=json) · [Program and scope](https://www.aqmd.gov/home/programs/community/community-detail?title=check-before-you-burn)

Valley Air's widget scripts load the same two data files for both forecast tables. Each row embeds its own date. The first file still targeted November 24 at capture, and the second targeted November 25. Wood-burning code and hazard-reduction code produce separately scoped rows with their respective public links. [Wood-burning declarations](https://valleyair.org/air-quality-information/residential-wood-smoke-reduction-program/) · [Hazard-reduction declarations](https://valleyair.org/compliance/hazard-reduction-burning/daily-burn-declarations/)

Sacramento's season-history JSON ties each code to a Pacific calendar date. The publisher's tally maps 6 to legal, 7 to discouraged, 8 to Stage 1 and 9 to Stage 2. The current forecast widget's JSONP orders entries by relative day. The adapter reads the date-keyed history. [Program and stages](https://www.airquality.org/ProgramCoordination/Pages/Check-Before-You-Burn.aspx) · [Season-history widget script](https://s3-us-west-1.amazonaws.com/sonomatech-production/sacramento/airquality_org/cbyb-widget/script.js) · [Category labels](https://sonomatech-production.s3.amazonaws.com/sacramento/airquality_org/cbyb-widget/templates/seasonTally.html)

## Standing rule publishers

| Fixture | Captured UTC | Request |
| --- | --- | --- |
| bay-status-rule.html | 20:10:24 | [Bay Area Open Burn Status](https://www.baaqmd.gov/permits/open-burn) |
| south-rule.pdf | 20:22:14 | [South Coast Rule 444](https://www.aqmd.gov/docs/default-source/rule-book/rule-iv/rule-444.pdf) |
| nocopermits-rule.html | 20:16:10 | [North Coast Unified Standard Burn Permits](https://www.ncuaqmd.org/standard-burn-permits) |
| greatbasin-rule.html | 20:17:13 | [Great Basin Unified Open Outdoor Burning](https://gbuapcd.org/PermittingAndRules/Burning/) |
| mbard-rule.html and mbard-permits-rule.html | 20:09:47 | [Monterey Bay Burn Permits](https://www.mbard.org/burn-permits) |
| sac-rule-rule.html | 20:17:13 | [Sacramento rural yard burning](https://www.airquality.org/residents/outdoor-burning/open-burning-(rural-yard-burning)) |
| sierra-faq-rule.html | 20:22:14 | [Northern Sierra Burning FAQ](https://www.nsaqmdca.gov/burning-faq) |
| sierra-rule.html | 20:08:51 | [Northern Sierra Burn Day Status](https://www.nsaqmdca.gov/burn-day-status) |
| shasta-rule.html | 20:08:51 | [Shasta County Fire Burn Permits](https://shastacountyfire.org/burn-permits/) |
| siskiyou-now-rule.html | 20:17:13 | [Siskiyou County Burn Day Information](https://www.siskiyoucounty.gov/airpollution/page/burn-day-information) |
| modoc-rule.html | 20:16:10 | [Modoc Rule 4.3](https://ww2.arb.ca.gov/sites/default/files/classic/technology-clearinghouse/rules/RuleID1721.html) |
| eldor-rule.html | 20:08:52 | [El Dorado County burn day and permits](https://www.eldoradocounty.ca.gov/Services/Burn-Day) |
| lake-fire-rule.html | 20:22:14 | [South Lake County Fire residential permit](https://www.southlakecountyfire.org/residential-burn-permit) |
| ss-slo-rule.html | 20:22:14 | [San Luis Obispo County burn program](https://www.slocleanair.org/rules-regulations/burning.php) |
| santa-barbara-rule.html | 20:10:24 | [Santa Barbara County Fire permit burning](https://sbcfire.com/permit-burning/) |
| amador-303-rule.html | 20:24:49 | [Amador Rule 303](https://ww2.arb.ca.gov/sites/default/files/classic/technology-clearinghouse/rules/RuleID29.html) |
| calaveras-rule.html | 20:11:19 | [Calaveras APCD old domain redirect](https://ema.calaverasgov.us/Air-Pollution-Control/Burn-Day-Permits-and-Information) |
| tuol-wuk-rule.html | 20:24:49 | [Mi-Wuk Sugar Pine Fire permit guidance](https://www.mwspfire.us/burn-permits-required) |
| mariposa-handout.pdf | 20:24:50 | [Mariposa hazard-reduction handout](https://www.mariposacounty.gov/DocumentCenter/View/97105/APCD-Hazard-Reduction-Burning-Handout-V1-12-22-2023?bidId=) |
| glenn-rule-rule.html | 20:24:49 | [Glenn Article II](https://ww2.arb.ca.gov/sites/default/files/classic/technology-clearinghouse/rules/RuleID1127.html) |
| lassen-form.pdf | 20:24:49 | [Lassen APCD residential burning brochure](https://www.lassenair.org/DocumentCenter/View/243/Residential-Waste-Brochure-PDF) |
| sd-city-rule.html | 20:24:49 | [City of San Diego recreational fires](https://www.sandiego.gov/fire/community-risk-reduction/policies/recreational-fires) |
| placer-rule.html | 20:08:52 | [Placer County residential burn days](https://www.placerair.org/1671/Burn-Days) |

The crosswalk uses publisher boundaries. Bay Area jurisdiction includes southwestern Solano and southern Sonoma. Yolo-Solano covers Yolo and northeastern Solano. Great Basin Unified covers Alpine, Inyo and Mono. Valley Air covers seven complete counties plus the San Joaquin Valley basin portion of Kern, with separate declarations for some park and mountain areas. [CARB California air districts](https://ww2.arb.ca.gov/california-air-districts) · [Bay Area jurisdiction](https://www.baaqmd.gov/en/about-the-air-district) · [Great Basin background](https://gbuapcd.org/District/Background/)
