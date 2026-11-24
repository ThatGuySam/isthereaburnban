# North Carolina source captures

All requests used the site's status-checker User-Agent and were captured on November 24, 2026. HTML fixtures keep the publisher's headings, dates and relevant body or list markup. Navigation, scripts and unrelated statutory sections were removed. The newsroom's first page uses no page parameter. Its second page uses Drupal's zero-based `page=1`.

| Fixture | Capture UTC | Exact request URL |
| --- | --- | --- |
| `newsroom-2026-11-24.html` | 11:52:25 | https://www.ncagr.gov/divisions/nc-forest-service/newsroom |
| `newsroom-page-2-2026-11-24.html` | 11:53:15 | https://www.ncagr.gov/divisions/nc-forest-service/newsroom?page=1 |
| `issue-2026-03-28.html` | 11:52:29 | https://www.ncagr.gov/news/press-releases/2026/03/28/statewide-burn-ban-issued-north-carolina-due-hazardous-forest-fire-conditions |
| `partial-lift-2026-05-02.html` | 11:54:29 | https://www.ncagr.gov/news/press-releases/2026/05/02/states-ban-open-burning-lifted-81-north-carolina-counties-conditions-improve-recent-rain |
| `final-lift-2026-05-07.html` | 11:52:28 | https://www.ncagr.gov/news/press-releases/2026/05/07/state-issued-burn-ban-lifted-all-north-carolina-counties-fire-danger-moderates-following-recent |
| `expansion-2023-11-08.html` | 12:01:03 | https://www.ncagr.gov/news/press-releases/2023/11/08/burn-ban-expanded-add-16-more-counties-western-nc |
| `issue-2021-05-24.html` | 12:01:04 | https://www.ncagr.gov/news/press-releases/2021/05/24/burn-ban-issued-26-north-carolina-counties-due-hazardous-forest-fire-conditions |
| `article-78-2026-11-24.html` | 11:52:25 | https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/ByArticle/Chapter_106/Article_78.html |
| `deq-hours-2026-11-24.html` | 11:52:24 | https://www.deq.nc.gov/about/divisions/air-quality/air-quality-compliance/open-burning |

## What the inventory showed

| Inventory source | Observation on November 24 |
| --- | --- |
| Online Burning Permit System | HTTP 200. The classic ASP application has 100 choices. Selecting a county opens the relevant permit process. The initial form has a commented-out Brunswick and Duplin toggle and no dated status field. |
| NCFS April 24 Granicus govDelivery bulletin | HTTP 200. The statewide order was active when published, with local authorities governing the area near dwellings. |
| Mecklenburg lift and issue notices | Both HTTP 200. The local and state March 28 orders together applied at all distances, with an exception for contained cooking. The May 8 county notice lifted the local order and the separate parks order. |
| Burke County April 6 PDF | HTTP 200. The April 6 update repeated the state order and Burke's separate ban within 100 feet. The county published a May 3 lift covering both. |
| Chatham County permit page | Akamai HTTP 403. The indexed page lists permit agents. Chatham also announced a historical May 8 lift. |
| NC DEQ open-burning guidance | HTTP 200. Standing material, hours, air-quality, and permitting rules. |
| Greensboro operational permit PDF | Akamai HTTP 403. The city's indexed permit guidance covers bonfires and land clearing and prohibits yard-waste burning. |
| NCFS open-burning permits and rules | HTTP 200. Standing permit requirements, protected woodland, high-hazard county and land-clearing rules. |
| NCFS May 8 PDF map | HTTP 200. Dated lift map for the final 19 counties, following the May 3 lift for the other 81. |
| NCFS April 14 press release | HTTP 200. Reaffirmed the March order. The April 27 advisory also reaffirmed it. |
| NCFS May 7 press release | HTTP 200. The effective time for the final 19 counties was May 8 at 8 a.m. Eastern. |
| Sampson County March 31 notice | HTTP 200. The order applied to otherwise uncovered parts of unincorporated Sampson County until the state's order was rescinded. The state lifted it in Sampson on May 3. |
| Buncombe County rules | Cloudflare HTTP 403. The indexed page explains standing air-quality rules and points to the local air agency. |

The [filtered Drupal RSS feed](https://www.ncagr.gov/press-release-terms/nc-forest-service/feed) returned ten entries, covering July 11 through the September 23 voluntary caution. Its page parameter returned the same entries. The [dated NCFS ArcGIS layer](https://services6.arcgis.com/3Sj1fiIDvQtFfbvg/arcgis/rest/services/BurnBan20190530/FeatureServer/1) still shows 18 Yes and 82 blank flags with a May 30, 2019 edit stamp. The [wildfire viewer](https://ncfspublic.firesponse.com/) publishes incidents. Neither map establishes a statewide all-clear today.

The [air-quality forecast discussion](https://airquality.climate.ncsu.edu/discussion/) and the [November 24 KML lookup](https://airquality.climate.ncsu.edu/oper/dashboard/scripts/getForecastKMLPath.php?date=2026-11-24) were current. The lookup returned [the map issued November 23 at 2:49 p.m. Eastern](https://airquality.climate.ncsu.edu/layers/aqi_forecasts/files/2026-11-24/AQ_forecast_20261123_1449.kml). All 100 county flags and two ridgetop forecast zones had `Burn Ban:No`. The KML showed affirmative flags in Gaston and Mecklenburg on [September 17](https://airquality.climate.ncsu.edu/oper/dashboard/scripts/getForecastKMLPath.php?date=2026-09-17). On [July 17](https://airquality.climate.ncsu.edu/oper/dashboard/scripts/getForecastKMLPath.php?date=2026-07-17), it flagged nine Triad counties while the [discussion](https://airquality.climate.ncsu.edu/discussion/?issued=2026-07-17+15%3A49%3A55&view=past) described other timed action days. The daily map lacks hours. Use official forecast discussions and local air-quality advisories for the activity and time.

The [approved air-quality rule](https://files.nc.gov/oah/documents/2023-10/Volume-38-Issue-07-October-2-2023.pdf?VersionId=vBo8iK1kqp_NSyD.UViwWQhdnI6TrkEi) specifies residential yard waste, land clearing and right-of-way maintenance conditions in 15A NCAC 02D .1903(b)(1) and (2). The [NCFS July notice](https://www.ncagr.gov/news/press-releases/2026/07/01/new-hanover-and-pender-counties-now-considered-high-hazard-open-burning-under-new-rules) corroborates the 2026 additions of New Hanover and Pender to the high-hazard counties in § 106-942.

Other local references include the [Burke lift](https://www.burkenc.org/m/newsflash/home/detail/1682), [Chatham lift](https://www.chathamcountync.gov/Home/Components/News/News/17451/), [Greensboro fire permit guidance](https://www.greensboro-nc.gov/departments/fire/inspections-permits/fire-permits-and-plan-reviews), and the [state fire marshal directory](https://www.ncosfm.gov/nc-fire-department-rescue-ems-directory-including-fdid).
