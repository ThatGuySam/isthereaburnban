# Pennsylvania publisher captures

| Fixture | Capture (UTC) | Request |
| --- | --- | --- |
| `carroll-valley-news-2026-11-24.html` | 2026-11-24 08:10:52 | [Borough News & Announcement HTML](https://www.carrollvalley.gov/m/newsflash?cat=5) |
| `state-forest-fires-2026-11-24.html` | 2026-11-24 08:10 | [17 Pa. Code § 21.118 HTML](https://www.pacodeandbulletin.gov/secure/pacode/data/017/chapter21/s21.118.html) |

The CivicPlus fixture preserves the active borough news list. Navigation, the duplicated carousel and scripts were trimmed. The original notice is dated November 20 and says outdoor open burning is banned until further notice. The public RSS channel also carries the notice. The HTML list lets the parser check the category's article count and watch for a later lift. For an order without an end date, the site asks for fresh borough confirmation after 14 Eastern calendar days. [Original notice](https://www.carrollvalley.gov/CivicAlerts.aspx?AID=16), [CivicPlus RSS channel](https://www.carrollvalley.gov/RSSFeed.aspx?ModID=1&CID=5).

The spring adapter pins the reviewed rule text and applies it to the parts of 51 counties where DCNR manages state forest land. On November 24 around 08:13 UTC the DCNR ArcGIS query returned 693 records, including 691 Bureau of Forestry state forest polygons (`SubType=1`, `LandManager=BOF`). The GeoJSON SHA-256 was `132c30716d65356cd63d2d1c1af4022af1df5f4e05d6d0f8a5fa9aa44b4ba9b5`. The July 2026 PennDOT county ZIP SHA-256 was `ff25d6267e22c23761b44d57b117c8f35a64c29d1e84f6916f81fc208ab6b373`. Reproject the forest geometry from WGS84 to the county layer's EPSG:3857, repair invalid polygons and select counties where forest polygons overlap their 50 m inward buffers by a positive area. Use county FIPS with the Pennsylvania prefix `42`. Northampton appears in the current feature service and DCNR's Delaware State Forest guide. [Exact forest geometry request](https://maps.dcnr.pa.gov/agsprod/rest/services/BOF/StateForests/FeatureServer/0/query?where=SUBTYPE%3D1&outFields=OBJECTID%2CSUBTYPE%2CDistrictName%2CSF_Name%2CLandManager&outSR=4326&geometryPrecision=6&f=geojson), [PennDOT county ZIP](https://www.pasda.psu.edu/download/padot/boundary_layers/PaCounty2026_07.zip), [Delaware State Forest](https://www.pa.gov/agencies/dcnr/recreation/where-to-go/state-forests/find-a-forest/delaware).

For the manual source, DCNR's AEM page points to eLibrary document 8921989. The direct PDF returned HTTP 200 around 08:10 UTC without a Last-Modified or ETag header. The PDF SHA-256 was `913dfa708c9696aa8ec32071a71c49abad29127cdd4070e9f4830ed9f28084c3`. Its own date and time read November 1, 2026 at 06:41 Eastern. Use that printed date to judge freshness. Active county bans are marked by color. [DCNR page](https://www.pa.gov/agencies/dcnr/programs-and-services/community-outreach-and-development/wildfire/burn-bans), [iframe viewer](https://elibrary.dcnr.pa.gov/GetDocument?docId=8921989&DocName=County%20Burn%20Bans.pdf), [direct PDF request](https://elibrary.dcnr.pa.gov/PDFProvider.ashx?action=PDFStream&docID=8921989&docName=County+Burn+Bans&nativeExt=pdf).

## County pass captures

These GET requests used the project status-checker User-Agent. Times are UTC. The text fixtures preserve the selected publisher headings, fields and rule wording. The PDFs preserve the publisher bytes. The WebCAD capture keeps the refresh stamp and burn-ban group, with the adjacent group header retained to test the boundary. Other dispatch entries and transient page state were removed.

| Fixture in `local/` | Capture (UTC) | Request |
| --- | --- | --- |
| `air-basin-definitions.html` | 2026-11-25 19:29:55 | [Publisher GET](https://www.pacodeandbulletin.gov/secure/pacode/data/025/chapter121/s121.1.html) |
| `air-basin-rule.html` | 2026-11-25 19:29:56 | [Publisher GET](https://www.pacodeandbulletin.gov/secure/pacode/data/025/chapter129/s129.14.html) |
| `allegheny-open-burning.html` | 2026-11-25 19:29:12 | [Publisher GET](https://www.alleghenycounty.us/Services/Health-Department/Air-Quality/Resident-Information/Open-Burning) |
| `altoona-burn-permit.html` | 2026-11-25 19:37:06 | [Publisher GET](https://www.altoonapa.gov/departments/fire/guide-to-recreational-fires) |
| `bedford-borough-burning.html` | 2026-11-25 19:31:16 | [Publisher GET](https://www.bedboro.com/burning/) |
| `bloomsburg-burning.html` | 2026-11-25 19:33:20 | [Publisher GET](https://ecode360.com/37004592) |
| `bradford-city-burn-permit.html` | 2026-11-25 19:33:18 | [Publisher GET](https://ecode360.com/49551437) |
| `butler-township-burning.html` | 2026-11-25 19:33:15 | [Publisher GET](https://butlertwp.org/fire/burning-regulations/) |
| `carbon-status.json` | 2026-11-25 19:34:50 | [Publisher GET](https://gis.carboncounty.com/arcgis/rest/services/Burn_Ban_Zones/FeatureServer/1/query?where=1%3D1&outFields=MUNINAME%2CBurn_Status&returnGeometry=false&f=json) |
| `chambersburg-burning.html` | 2026-11-25 19:46:49 | [Publisher GET](https://ecode360.com/10693403) |
| `clarion-burning.html` | 2026-11-25 19:31:30 | [Publisher GET](https://ecode360.com/27387108) |
| `dubois-burning.html` | 2026-11-25 19:37:05 | [Publisher GET](https://ecode360.com/14005685) |
| `duncannon-burning.html` | 2026-11-25 19:43:21 | [Publisher GET](https://ecode360.com/13964629) |
| `east-stroudsburg-burning.html` | 2026-11-25 19:31:20 | [Publisher GET](https://ecode360.com/12386954) |
| `harris-township-burning.html` | 2026-11-25 19:31:18 | [Publisher GET](https://harristownship.org/open-burning-regulations/) |
| `hermitage-burn-permit.html` | 2026-11-25 19:33:17 | [Publisher GET](https://www.hermitage.net/179/Burning-Regulations) |
| `honesdale-burning.pdf` | 2026-11-25 19:37:11 | [Publisher GET](https://ecode360.com/HO1505/laws/LF2487570.pdf) |
| `huntingdon-burning.html` | 2026-11-25 19:31:25 | [Publisher GET](https://ecode360.com/31386164) |
| `indiana-borough-burning.html` | 2026-11-25 19:33:22 | [Publisher GET](https://ecode360.com/26868512) |
| `kelly-township-burning.html` | 2026-11-25 19:43:22 | [Publisher GET](https://ecode360.com/44776582) |
| `lewistown-burning.html` | 2026-11-25 19:33:26 | [Publisher GET](https://ecode360.com/28668919) |
| `lock-haven-burning.html` | 2026-11-25 19:33:17 | [Publisher GET](https://www.lockhavenpa.gov/residents/open-burning) |
| `loyalsock-burning.html` | 2026-11-25 19:33:19 | [Publisher GET](https://ecode360.com/13036035) |
| `mahoning-montour-burning.html` | 2026-11-25 19:33:30 | [Publisher GET](https://ecode360.com/12423811) |
| `meadville-burning.pdf` | 2026-11-25 19:33:20 | [Publisher GET](https://cms2.revize.com/revize/meadvillepa/Document_Center/Fire/Burning_Ordinance.pdf?t=202404181223440) |
| `milford-borough-burning.html` | 2026-11-25 19:52:29 | [Publisher GET](https://ecode360.com/32395021) |
| `north-lebanon-burning.pdf` | 2026-11-25 19:37:10 | [Publisher GET](https://northlebanontwppa.gov/wp-content/uploads/2026/09/NLT-Ordinance_Ch-7-Fire-Prevention-and-Fire-Protection_Part-2-Open-Burning.pdf) |
| `oil-city-burn-permit.html` | 2026-11-25 19:31:18 | [Publisher GET](https://www.oilcity.org/departments/fire) |
| `philadelphia-open-fires.pdf` | 2026-11-25 19:29:12 | [Publisher GET](https://www.phila.gov/media/20190205124637/AMS-Regulation-I-II-III-Combined-__-2_5_19.pdf) |
| `pike-webcad.html` | 2026-11-25 19:55:46 | [Publisher GET](https://webcad.pikepa.org/pages/public/liveincidents.aspx) |
| `port-royal-burning.pdf` | 2026-11-25 19:37:07 | [Publisher GET](https://portroyalborough.org/document/ordinance-august-2nd-2023/) |
| `punxsutawney-burning.html` | 2026-11-25 19:31:27 | [Publisher GET](https://ecode360.com/11592461) |
| `selinsgrove-burning.html` | 2026-11-25 19:31:26 | [Publisher GET](https://ecode360.com/44137497) |
| `somerset-borough-burning.html` | 2026-11-25 19:52:27 | [Publisher GET](https://www.somersetborough.com/faq.html) |
| `sunbury-burning.html` | 2026-11-25 19:31:23 | [Publisher GET](https://ecode360.com/28785032) |
| `tamaqua-burning.html` | 2026-11-25 19:37:07 | [Publisher GET](https://ecode360.com/30183329) |
| `towanda-burning.html` | 2026-11-25 19:33:23 | [Publisher GET](https://ecode360.com/14272148) |
| `tunkhannock-burning.pdf` | 2026-11-25 19:33:18 | [Publisher GET](https://tunkboro.gov/wp-content/uploads/2023/03/94-3-Burning-Ordinance.pdf) |
| `warren-city-burning.html` | 2026-11-25 19:31:29 | [Publisher GET](https://ecode360.com/16100836) |
| `wellsboro-burning.html` | 2026-11-25 19:33:28 | [Publisher GET](https://ecode360.com/32634334) |
| `west-kittanning-burning.html` | 2026-11-25 19:33:19 | [Publisher GET](https://westkittanningpa.com/resident-information/) |

Honesdale’s signed Ordinance 732 replaces the leaf-burning hours still displayed in the codified § 175-3. The two air-basin fixtures preserve the operative text and every air-basin definition, including the inner and outer zones. The Carbon FeatureServer capture keeps the full queried roster without geometry.
