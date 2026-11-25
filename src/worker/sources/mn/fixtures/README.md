# Minnesota DNR burning restrictions

The JSON is the unmodified response to [the MapServer CGI GET](https://maps.dnr.state.mn.us/cgi-bin/mapserv/burning_restrictions?mode=nquery), captured at 2026-11-24 05:31:57 UTC (November 23, 11:31:57 p.m. Central). HTTP 200, JSON UTF-8. There were no ETag or Last-Modified response headers.

The [official map page](https://www.dnr.state.mn.us/forestry/fire/firerating_restrictions.html) calls this URL for its table. It uses the zero-based position in the `burning_restrictions` array to look up `status`. The `legOrder` field sorts the legend. The legend fixture is that exact array, extracted from the HTML at 2026-11-24 05:31:59 UTC.

| Feed code | Map meaning |
| --- | --- |
| 0 | No data |
| 1 | Variance permits only |
| 2 | Permits required |
| 3 | No open burning, campfires allowed |
| 4 | Elevated restrictions, including no open burning |
| 5 | No permit required |
| 6 | Agency-approved permits only |

The official table displays each `last_update` as provided. The page's overall date is generated in the visitor's browser. The downloadable map was dated November 23, and a point query near Ely returned the same November 23 noon timestamp as the northern St. Louis County row. The adapter interprets these timezone-free area timestamps in Central time and uses a 48-hour freshness window per area. The [permit administration directory](https://apps.dnr.state.mn.us/burning-permits/admin_areas) corroborates the split permit areas, including Polk East and Roseau East.

## County pass

These responses were captured on November 24, 2026 Central time. The timestamps below are UTC. HTML fixtures are gzip-compressed with scripts, styles and input controls removed. The reviewed text yields the same fingerprint in the fixture and the original response. The PDF fixtures are the publisher's bytes. The International Falls and Wadena fixtures contain the public response's content type and strong ETag, confirmed with HEAD after review of the PDF body.

| Fixture | Request | Captured UTC |
| --- | --- | --- |
| `rule-anoka-nowthen-2026-11-24.pdf` | [Published source](https://www.cityofnowthen.gov/DocumentCenter/View/328/Open-Burning-Regulations) | 2026-11-25T04:44:10.274Z |
| `rule-beltrami-bemidji-2026-11-24.pdf` | [Published source](https://www.ci.bemidji.mn.us/vertical/sites/%7BDC40720D-A823-4643-91CD-6456402D11F6%7D/uploads/Recreational_Fire_Requirements.pdf) | 2026-11-25T04:48:41.976Z |
| `rule-big-stone-ortonville-2026-11-24.pdf` | [Published source](https://mnortonville.com/wp-content/uploads/2026/01/Ortonville09.pdf) | 2026-11-25T04:48:42.265Z |
| `rule-blue-earth-2026-11-24.html.gz` | [Published source](https://mn-blueearthcounty.civicplus.com/429/Permits) | 2026-11-25T04:40:49.378Z |
| `rule-brown-2026-11-24.pdf` | [Published source](https://www.browncountymn.gov/DocumentCenter/View/671/-Brown-County-Open-Burning-Ordinance-PDF) | 2026-11-25T04:38:25.650Z |
| `rule-carver-chaska-2026-11-24.html.gz` | [Published source](https://www.chaskamn.gov/478/Recreational-Fires) | 2026-11-25T04:48:41.938Z |
| `rule-clay-moorhead-2026-11-24.html.gz` | [Published source](https://www.moorheadmn.gov/emergency-services/fire/recreational-outdoor-fires/) | 2026-11-25T04:47:03.196Z |
| `rule-cottonwood-windom-2026-11-24.html.gz` | [Published source](https://www.windommn.gov/government/departments/fire_rescue/notification_of_open_burning.php) | 2026-11-25T04:49:48.956Z |
| `rule-crow-wing-baxter-2026-11-24.html.gz` | [Published source](https://www.brainerdmn.gov/498/Recreational-Fires) | 2026-11-25T04:48:42.992Z |
| `rule-dakota-burnsville-2026-11-24.html.gz` | [Published source](https://www.burnsvillemn.gov/2110/PrescribedOpen-Burn-Permit) | 2026-11-25T04:37:49.315Z |
| `rule-faribault-2026-11-24.html.gz` | [Published source](https://www.faribaultcountymn.gov/1315/Permits) | 2026-11-25T04:38:26.285Z |
| `rule-fillmore-rushford-village-2026-11-24.pdf` | [Published source](https://www.rushfordvillagemn.gov/wp-content/uploads/Ord_16_Outdoor_Burning.pdf) | 2026-11-25T04:47:04.139Z |
| `rule-goodhue-red-wing-2026-11-24.html.gz` | [Published source](https://www.redwingmn.gov/197/Open-Burning) | 2026-11-25T04:48:43.096Z |
| `rule-hennepin-minneapolis-2026-11-24.html.gz` | [Published source](https://www.minneapolismn.gov/resident-services/public-safety/prevent-prepare/fire-safety/recreational-fires/) | 2026-11-25T04:37:49.121Z |
| `rule-itasca-grand-rapids-2026-11-24.html.gz` | [Published source](https://cityofgrandrapidsmn.com/fire/page/burning-permits) | 2026-11-25T04:48:44.367Z |
| `rule-jackson-2026-11-24.html.gz` | [Published source](https://jacksoncountymn.gov/index.asp?SEC=4611DEF7-9719-4207-9765-1425E40E4B4A) | 2026-11-25T04:37:49.326Z |
| `rule-kanabec-mora-2026-11-24.pdf` | [Published source](https://www.ci.mora.mn.us/sites/g/files/vyhlif6086/f/pages/ac-891_leaf_burning_permitfillable.pdf) | 2026-11-25T04:48:44.079Z |
| `rule-koochiching-international-falls-2026-11-24.json` | [Published source](https://www.ci.international-falls.mn.us/wp-content/uploads/2022/07/Guide-for-Recreational-Fires.pdf) | 2026-11-25T04:48:44.836Z |
| `rule-le-sueur-new-prague-2026-11-24.html.gz` | [Published source](https://newpraguemn.gov/faqs) | 2026-11-25T04:57:52.151Z |
| `rule-leech-lake-2026-11-24.pdf` | [Published source](https://www.llojibwe.org/drm/environmental/content/drm_burnOrdiance2-23-06.pdf) | 2026-11-25T04:53:18.795Z |
| `rule-lyon-minneota-2026-11-24.pdf` | [Published source](https://minneota.com/Title%2009_General%20Regulations.pdf) | 2026-11-25T04:57:52.518Z |
| `rule-mcleod-2026-11-24.html.gz` | [Published source](https://www.mcleodcountymn.gov/government/sheriff_s_office/burning_information.php) | 2026-11-25T04:39:37.830Z |
| `rule-mille-lacs-milaca-2026-11-24.pdf` | [Published source](https://cityofmilaca.org/documents/556/Chapter_93_Fire_Prevention__Burning_Regulations.pdf) | 2026-11-25T04:48:44.902Z |
| `rule-morrison-little-falls-2026-11-24.html.gz` | [Published source](https://www.cityoflittlefalls.com/197/Recreational-Fires) | 2026-11-25T05:05:39.259Z |
| `rule-mower-2026-11-24.html.gz` | [Published source](https://www.co.mower.mn.us/202/Environmental-Services) | 2026-11-25T04:39:39.010Z |
| `rule-nicollet-2026-11-24.html.gz` | [Published source](https://www.nicolletcountymn.gov/295/Burning-Permits) | 2026-11-25T04:37:48.138Z |
| `rule-olmsted-rochester-2026-11-24.html.gz` | [Published source](https://www.rochestermn.gov/law-emergency-services/fire-rescue-services/fire-permits-inspections/) | 2026-11-25T04:47:03.268Z |
| `rule-otter-tail-fergus-falls-2026-11-24.html.gz` | [Published source](https://fergusfallsmn.gov/firepermits) | 2026-11-25T04:48:45.318Z |
| `rule-pennington-thief-river-falls-2026-11-24.pdf` | [Published source](https://trfmn.gov/DocumentCenter/View/628/Leaf-Burning-Rules-and-Recreational-Fires-PDF) | 2026-11-25T04:48:45.043Z |
| `rule-pipestone-city-2026-11-24.pdf` | [Published source](https://cms3.revize.com/revize/pipestonecomn/Document%20Center/Government/Department/Sheriff/City%20Ordinance/Pipestone/Open_Burning_and_Air_Pollution_Control.pdf) | 2026-11-25T04:57:52.133Z |
| `rule-pope-2026-11-24.pdf` | [Published source](https://www.popecountymn.gov/wp-content/uploads/2024/02/Ordinance-201302-Open-Burning-Ordinance.pdf) | 2026-11-25T04:40:48.237Z |
| `rule-ramsey-gem-lake-2026-11-24.pdf` | [Published source](https://gemlakemn.org/wp-content/uploads/2021/12/Ordinance-No.-77-Fire-Code-Updated-2021.pdf) | 2026-11-25T04:39:40.250Z |
| `rule-red-lake-2026-11-24.pdf` | [Published source](https://www.redlakecounty.gov/Documents/Departments/Sheriff/Red%20Lake%20County%20Burning%20Ordinance/County_Burning_Ordinance_Adopted_2013(1).pdf) | 2026-11-25T04:40:48.088Z |
| `rule-redwood-falls-2026-11-24.html.gz` | [Published source](https://ci.redwood-falls.mn.us/environment/burning-in-the-city-limits/) | 2026-11-25T04:48:47.049Z |
| `rule-renville-2026-11-24.pdf` | [Published source](https://www.renvillecountymn.gov/wp-content/uploads/2024/06/RenvilleCty_Ordinances-OpenBurn-Adopted01082013.pdf) | 2026-11-25T04:37:48.043Z |
| `rule-rice-northfield-2026-11-24.html.gz` | [Published source](https://nafrs.org/burn-permit) | 2026-11-25T04:38:25.792Z |
| `rule-scott-spring-lake-2026-11-24.pdf` | [Published source](https://springlaketownship.com/wp-content/uploads/bsk-pdf-manager/2021/04/Burn-Permit.pdf) | 2026-11-25T04:39:39.090Z |
| `rule-sibley-2026-11-24.html.gz` | [Published source](https://www.sibleycounty.gov/304/Burn-Permits) | 2026-11-25T04:39:37.853Z |
| `rule-st-cloud-2026-11-24.pdf` | [Published source](https://ci.stcloud.mn.us/DocumentCenter/View/8069/Recreational--Agricultural-Burning-Permit-Application?bidId=) | 2026-11-25T04:47:03.109Z |
| `rule-todd-long-prairie-2026-11-24.pdf` | [Published source](https://www.longprairie.net/media/userfiles/subsite_150/files/Ordinances/Chapter_11_-_Environmental_Control_and_Public_Safety.pdf) | 2026-11-25T04:48:46.279Z |
| `rule-wadena-city-2026-11-24.json` | [Published source](https://core-docs.s3.us-east-1.amazonaws.com/documents/asset/uploaded_file/4343/CW/3645260/Large_Bonfire_Application.pdf) | 2026-11-25T04:48:46.690Z |
| `rule-waseca-2026-11-24.pdf` | [Published source](https://www.wasecacounty.gov/DocumentCenter/View/5836/burning-info) | 2026-11-25T04:40:47.864Z |
| `rule-washington-stillwater-township-2026-11-24.html.gz` | [Published source](https://stillwatertownshipmn.gov/burning-permits) | 2026-11-25T04:40:48.005Z |
| `rule-watonwan-st-james-2026-11-24.html.gz` | [Published source](https://www.ci.stjames.mn.us/401/Applications-Permits-Licenses) | 2026-11-25T04:48:46.408Z |
| `rule-white-earth-2026-11-24.pdf` | [Published source](https://www.whiteearth.com/media/pages/divisions/judicial-services/codes-ordinances/a602a508f8-1727297530/conservation.code.pdf) | 2026-11-25T04:53:19.463Z |
| `rule-wilkin-2026-11-24.html.gz` | [Published source](https://wilkincounty.gov/index.asp?DE=9A42DF54-90AC-4A2A-9DE5-DCB15DC5C823&SEC=E0B98302-C15D-4A22-B6BD-68C8B18D2958) | 2026-11-25T04:37:49.320Z |
| `rule-winona-city-2026-11-24.html.gz` | [Published source](https://winonamn.gov/494/Permits) | 2026-11-25T04:57:52.097Z |
| `rule-wright-buffalo-2026-11-24.html.gz` | [Published source](https://www.ci.buffalo.mn.us/200/Recreational-Fires-Fire-Pits-Burn-Bans) | 2026-11-25T04:48:47.540Z |
| `rule-yellow-medicine-2026-11-24.html.gz` | [Published source](https://www.co.ym.mn.gov/index.asp?SEC=99024F6B-DE05-4B09-96C3-2F1FD13D9376) | 2026-11-25T04:40:48.153Z |
| `olmsted-news-2026-11-24.html.gz` | [Sheriff's Office News](https://www.olmstedcounty.gov/government/county-departments/sheriffs-office/sheriffs-office-news) | 2026-11-25T04:37:48+00:00 |
| `olmsted-ban-2026-11-24.html.gz` | [Sheriff's Office News](https://www.olmstedcounty.gov/government/county-departments/sheriffs-office/sheriffs-office-news/burn-ban-olmsted-county-effective-immediately) | 2026-11-25T04:37:49+00:00 |
| `olmsted-lift-2026-11-24.html.gz` | [Sheriff's Office News](https://www.olmstedcounty.gov/government/county-departments/sheriffs-office/sheriffs-office-news/burn-ban-olmsted-county-ended-800-am-thursday-september-7-2023) | 2026-11-25T04:38:25+00:00 |
