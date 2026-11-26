# Washington fixtures

The captures are dated in UTC. It was still November 23 in Washington.

| File | Capture time (UTC) | Request URL |
| --- | --- | --- |
| `ecology-burn-bans-2026-11-24.html` | 2026-11-24 06:23:13 | [Washington Ecology burn bans](https://ecology.wa.gov/air-climate/air-quality/smoke-fire/burn-bans) |
| `puget-status-2026-11-24.html` | 2026-11-24 06:23:13 | [Puget Sound Clean Air status grid](https://secure.pscleanair.org/AirQuality/BurnBan) |
| `king-fire-safety-2026-11-24.html` | 2026-11-24 06:34:10 | [King County Sitecore content host](https://cd.kingcounty.gov/en/dept/local-services/governance-leadership/local-government-for-unincorporated-king-county/fire-safety) |

All returned HTTP 200 to the fetcher user agent in `docs/fetchers.md`. Ecology's excerpt retains the current heading, policy text, both dated stage tables, and the adjacent reservation table. King County's excerpt retains the jurisdiction summary and the entire current-status block. Puget Sound retains the entire response. Line endings are normalized for Git. Tests simulate active Puget Sound and King County stages using the publisher's [grid CSS codes](https://secure.pscleanair.org/AirQuality/css/BurnBan/BurnBans.css) and [fire safety stage labels](https://kingcounty.gov/en/dept/local-services/governance-leadership/local-government-for-unincorporated-king-county/fire-safety).

## County pass

All requests below returned HTTP 200 to the fetcher user agent. Times are UTC on November 26, 2026. The excerpts retain the publisher’s rule or current status markup and leave out unrelated navigation, scripts and forms. Reviewed PDF fixtures retain the full publisher document. The Benton raw fixture shows the pre-publication notice. Tests use the publisher’s observed November 25 Residential and Agricultural heading labels to exercise a no-burn decision.

### Current status captures

Files in `county-status/`.

| File | Capture time (UTC) | Request URL |
| --- | --- | --- |
| `orcaa-status.html` | 2026-11-26 08:25:19 | [Olympic Region Clean Air Agency](https://www.orcaa.org/burning/county-burning-restrictions/) |
| `swcaa-clark.html` | 2026-11-26 08:26:31 | [Southwest Clean Air Agency](https://www.swcleanair.gov/burning/bycounty.asp?county=Clark) |
| `swcaa-cowlitz.html` | 2026-11-26 08:26:32 | [Southwest Clean Air Agency](https://www.swcleanair.gov/burning/bycounty.asp?county=Cowlitz) |
| `swcaa-lewis.html` | 2026-11-26 08:26:33 | [Southwest Clean Air Agency](https://www.swcleanair.gov/burning/bycounty.asp?county=Lewis) |
| `swcaa-skamania.html` | 2026-11-26 08:26:34 | [Southwest Clean Air Agency](https://www.swcleanair.gov/burning/bycounty.asp?county=Skamania) |
| `swcaa-wahkiakum.html` | 2026-11-26 08:26:35 | [Southwest Clean Air Agency](https://www.swcleanair.gov/burning/bycounty.asp?county=Wahkiakum) |
| `yakima-air.html` | 2026-11-26 08:26:31 | [Yakima Regional Clean Air Agency](https://www.yakimacleanair.org/) |
| `northwest-air.html` | 2026-11-26 08:25:19 | [Northwest Clean Air Agency](https://nwcleanairwa.gov/resources/outdoor-ag-burns/burn-ban-information/) |
| `spokane-current-burn-restrictions.html` | 2026-11-26 08:25:21 | [Spokane Regional Clean Air Agency](https://spokanecleanair.org/burning/burn-restrictions/) |
| `kittitas-fire-districts.html` | 2026-11-26 08:25:23 | [Kittitas County Fire Marshal](https://www.co.kittitas.wa.us/cds/firemarshal/burn-ban.aspx) |
| `kitsap-fire-safety.html` | 2026-11-26 08:26:33 | [Kitsap County Fire Marshal](https://www.kitsap.gov/dcd/Pages/Burn-Ban-Information.aspx) |
| `snohomish-fire-safety.html` | 2026-11-26 08:25:22 | [Snohomish County Fire Marshal](https://www.snohomishcountywa.gov/1144/Outdoor-Burning-Information) |
| `okanogan-fire-safety.html` | 2026-11-26 08:25:28 | [Okanogan County Emergency Management](https://www.okanogancounty.gov/406/Burn-Ban-Information) |
| `pierce-fire-safety.html` | 2026-11-26 08:26:33 | [Pierce County Fire Marshal](https://www.piercecountywa.gov/AlertCenter.aspx?CID=54) |
| `island-county-fire-safety.xml` | 2026-11-26 08:35:23 | [Island County Fire Marshal](https://islandcountywa.gov/RSSFeed.aspx?CID=Burn-Ban-Updates-10&ModID=1) |
| `klickitat-county-zones.html` | 2026-11-26 08:40:57 | [Klickitat County Emergency Management](https://www.klickitatcounty.gov/1242) |
| `san-juan-island-permit-status.html` | 2026-11-26 08:27:57 | [San Juan Island Fire & Rescue](https://permits.sjifire.org/) |
| `shaw-island-permit-status.html` | 2026-11-26 08:27:57 | [Shaw Island Fire & EMS](https://permits.shawfire5.org/) |
| `lopez-island-permit-status.html` | 2026-11-26 08:40:57 | [Lopez Island Fire and EMS](https://permits.stationworks.app/agency/lopezfire) |
| `orcas-island-permit-status.html` | 2026-11-26 08:40:57 | [Orcas Island Fire & Rescue](https://permits.orcasfire.org/) |
| `benton-daily-burn-decision.html` | 2026-11-26 08:25:19 | [Benton Clean Air Agency](https://bentoncleanair.org/burning/todays-burn-decision/) |

### Reviewed rule captures

Files in `local-rules/`.

| File | Capture time (UTC) | Request URL |
| --- | --- | --- |
| `adams-district-5-permit.html` | 2026-11-26 08:25:25 | [Adams County Fire Marshal](https://www.co.adams.wa.gov/514/Outdoor-Burning) |
| `adams-summer.html` | 2026-11-26 08:25:25 | [Adams County](https://ecode360.com/49342812) |
| `asotin-controlled-burning.html` | 2026-11-26 08:32:10 | [City of Asotin](https://ecode360.com/46244400) |
| `benton-urban-debris.html` | 2026-11-26 08:25:22 | [Benton Clean Air Agency](https://bentoncleanair.org/burning/outdoor-burning/) |
| `chelan-urban-debris.html` | 2026-11-26 08:32:08 | [Chelan County Fire Marshal](https://www.co.chelan.wa.us/news/article/open-burning) |
| `chelan-summer.html` | 2026-11-26 08:25:23 | [Chelan County Fire Marshal](https://www.co.chelan.wa.us/fire-prevention-and-investigation/pages/fire-danger-restrictions) |
| `clallam-summer.html` | 2026-11-26 08:25:23 | [Clallam County Fire Marshal](https://www.clallamcountywa.gov/884/Burning-Restrictions) |
| `clark-outdoor-permits.html` | 2026-11-26 08:25:22 | [Clark County Fire Marshal](https://clark.wa.gov/community-development/outdoor-burning) |
| `cowlitz-outdoor-permits.html` | 2026-11-26 08:26:00 | [Cowlitz County Fire Marshal](https://www.co.cowlitz.wa.us/570/Burn-Permits-Burn-Bans) |
| `southwest-summer.html` | 2026-11-26 08:26:00 | [Cowlitz County Fire Marshal](https://www.co.cowlitz.wa.us/570/Burn-Permits-Burn-Bans) |
| `columbia-garfield-urban.pdf` | 2026-11-26 08:26:01 | [Washington Ecology Eastern Regional Office](https://apps.ecology.wa.gov/publications/documents/0602017k.pdf) |
| `douglas-mansfield-debris.html` | 2026-11-26 08:25:27 | [Douglas County Fire District 5](https://dcfd5.org/open-burning/) |
| `ferry-pend-oreille-stevens-urban.pdf` | 2026-11-26 08:32:09 | [Washington Ecology Eastern Regional Office](https://apps.ecology.wa.gov/publications/documents/0502016ne.pdf) |
| `franklin-ag-permits.html` | 2026-11-26 08:25:27 | [Franklin County Planning and Building](https://www.franklincountywa.gov/292/Outdoor-Burn-Program) |
| `grant-urban-debris.html` | 2026-11-26 08:25:27 | [Grant County Fire Marshal](https://www.grantcountywa.gov/230/Outdoor-Burning-Regulations) |
| `grant-summer.html` | 2026-11-26 08:25:27 | [Grant County Fire Marshal](https://www.grantcountywa.gov/230/Outdoor-Burning-Regulations) |
| `grays-harbor-yard-waste-permit.html` | 2026-11-26 08:33:37 | [Olympic Region Clean Air Agency](https://www.orcaa.org/burning/outdoor-burning/) |
| `olympic-urban-debris.html` | 2026-11-26 08:25:19 | [Olympic Region Clean Air Agency](https://www.orcaa.org/burning/county-burning-restrictions/) |
| `northwest-urban-debris.html` | 2026-11-26 08:25:21 | [Northwest Clean Air Agency](https://nwcleanairwa.gov/resources/outdoor-ag-burns/) |
| `puget-urban-yard-waste.html` | 2026-11-26 08:25:22 | [Puget Sound Clean Air Agency](https://pscleanair.gov/328/Outdoor-Burning) |
| `kittitas-valley-burning.html` | 2026-11-26 08:36:11 | [Kittitas Valley Fire & Rescue](https://www.kvfr.org/burn-regulations) |
| `klickitat-white-salmon-permits.html` | 2026-11-26 08:35:23 | [West Klickitat Regional Fire Authority](https://www.westklickitatfire.gov/can-i-have-a-fire) |
| `lewis-open-burning-permits.html` | 2026-11-26 08:25:24 | [Lewis County Community Development](https://burnpermit.lewiscountywa.gov/) |
| `lincoln-residential-notice.html` | 2026-11-26 08:25:26 | [Lincoln County](https://lincolncountywa.com/294/Burning-Information) |
| `okanogan-city-permit.html` | 2026-11-26 08:32:11 | [City of Okanogan](https://ecode360.com/46670171) |
| `okanogan-county-season.html` | 2026-11-26 08:25:28 | [Okanogan County Emergency Management](https://www.okanogancounty.gov/406/Burn-Ban-Information) |
| `skamania-burn-permits.html` | 2026-11-26 08:33:37 | [Southwest Clean Air Agency](https://www.swcleanair.gov/burning/burnpermits.asp) |
| `snohomish-residential-permits.html` | 2026-11-26 08:25:22 | [Snohomish County Fire Marshal](https://www.snohomishcountywa.gov/1144/Outdoor-Burning-Information) |
| `spokane-land-clearing.html` | 2026-11-26 08:25:22 | [Spokane Regional Clean Air Agency](https://spokanecleanair.org/burning/outdoor-burning/) |
| `wahkiakum-burn-notice.html` | 2026-11-26 08:25:25 | [Wahkiakum County Building and Planning](https://www.co.wahkiakum.wa.us/494/Burn-Permits) |
| `walla-walla-residential-permits.html` | 2026-11-26 08:25:27 | [Walla Walla County Fire District 5](https://www.wwcfd5.org/burn-information) |
| `whitman-pullman-yard-waste.pdf` | 2026-11-26 08:28:01 | [Pullman Fire Department](https://cms3.revize.com/revize/pullman/Fire/Burn%20Ban%20Flyer.pdf) |
| `yakima-residential-burning.pdf` | 2026-11-26 08:32:09 | [Yakima Regional Clean Air Agency](https://www.yakimacleanair.org/site/files/file_manager/page/shared/Outdoor%20Burning.pdf) |
| `yakima-summer.pdf` | 2026-11-26 08:28:00 | [Yakima County Fire Marshal](https://selahwa.gov/DocumentCenter/View/1889/Annual-Burn-Restriction-Press-Release-June-2026-PDF) |
