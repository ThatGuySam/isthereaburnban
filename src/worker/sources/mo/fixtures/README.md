# Missouri captures

The requests below returned HTTP 200 on November 24, 2026. The JSON and PDFs retain the response bytes. The EPA HTML retains the approval table and the links used by the parser.

| Fixture | Capture time (UTC) | Request |
| --- | --- | --- |
| `show-me-fire-active-2026-11-24.json` | 12:15:56 | [Active county reports](https://api.showmefire.org/api/burn-bans/active) |
| `epa-sip-2026-11-24.html` | 12:16:52 | [EPA Missouri SIP chapter 6](https://www.epa.gov/air-quality-implementation-plans/missouri-sip-chapter-6-air-quality-standards-definitions-sampling) |
| `epa-open-burning-2026-11-24.pdf` | 12:15:46 | [10 CSR 10-6.045](https://www.epa.gov/sites/default/files/2017-09/documents/10-6045.pdf) |
| `epa-definitions-2026-11-24.pdf` | 12:15:47 | [10 CSR 10-6.020](https://www.epa.gov/system/files/documents/2025-11/10-csr-10-6.020-definitions-and-common-reference-tables.pdf) |

Show Me Fire's public map page reads the same active-report endpoint. The daily map stamp was November 23 at 7:00 a.m. Central. The ArcGIS equivalent also had one active row and 114 inactive placeholders. Its edit epoch matches the JSON's UTC database timestamp. The report form requires proof for staff review. Dallas's public record has no signed-order link. [Public map](https://showmefire.org/burn-bans) · [Submission and review policy](https://showmefire.org/forms/burn-ban) · [ArcGIS query](https://api.showmefire.org/arcgis/rest/services/BurnBans/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=json)

The EPA rule's yard-waste provision is 10 CSR 10-6.045(3)(A)5.D on page 3. The metro boundary is 10 CSR 10-6.020(2)(S)23 on page 68 and includes Franklin, Jefferson, St. Charles and St. Louis counties and the independent City of St. Louis. The unincorporated exception applies within the four counties. The approval page links both reviewed copies. The fetcher checks the listings and both document hashes before calculating the Central-time rule.


## County pass captures

Each GET below returned HTTP 200 on November 24, 2026. HTML excerpts retain the panel or local code section the parser reads. Signed ordinance PDFs retain the response bytes. The scope for the two cities that cross Cape Girardeau and Scott counties comes from their Census governmental-unit maps. Marceline identifies Linn and Chariton counties on its city profile. [Cape Girardeau](https://www2.census.gov/geo/pvs/bas/bas24maps/st29_mo/incplace/p2911242_cape_girardeau/BAS24P12900011242.pdf) · [Scott City](https://www2.census.gov/geo/pvs/bas/bas24maps/st29_mo/incplace/p2966368_scott_city/BAS24P12900066368.pdf) · [Marceline](https://marcelinemo.us/home/profile.html)

| Fixture | Capture time (UTC) | Public GET |
| --- | --- | --- |
| `cape-girardeau-day-2026-11-24.html` | 22:13:03 | [Publisher](https://www.cityofcapegirardeau.org/departments/fire/fire-prevention/burning-regulations/) |
| `lake-ozark-day-2026-11-24.html` | 22:24:56 | [Publisher](https://www.lofpd.com/business-resources) |
| `mountain-view-alerts-2026-11-24.html` | 22:13:01 | [Publisher](https://www.mountainviewmo.gov/AlertCenter.aspx) |
| `rule-albany-2026-11-24.html` | 22:26:06 | [City of Albany](https://ecode360.com/29273602) |
| `rule-aurora-2026-11-24.html` | 22:16:19 | [City of Aurora](https://ecode360.com/41252206) |
| `rule-battlefield-2026-11-24.html` | 22:13:03 | [Battlefield Fire Protection District](https://battlefieldfire.gov/community-risk-reduction/open-burning/) |
| `rule-bloomfield-2026-11-24.html` | 22:26:21 | [City of Bloomfield](https://ecode360.com/41808875) |
| `rule-bolivar-2026-11-24.html` | 22:26:18 | [City of Bolivar](https://ecode360.com/31771255) |
| `rule-canton-2026-11-24.html` | 22:16:13 | [City of Canton](https://ecode360.com/27580851) |
| `rule-cape-girardeau-2026-11-24.html` | 22:13:03 | [City of Cape Girardeau](https://www.cityofcapegirardeau.org/departments/fire/fire-prevention/burning-regulations/) |
| `rule-carrollton-2026-11-24.html` | 22:16:07 | [Town of Carrollton](https://ecode360.com/31003586) |
| `rule-central-jackson-2026-11-24.html` | 22:13:04 | [Central Jackson County Fire Protection District](https://cjcfpd.org/burn-permit/) |
| `rule-columbia-2026-11-24.html` | 22:14:07 | [City of Columbia](https://www.como.gov/fire/permits-and-planning/open-burning/) |
| `rule-cuba-2026-11-24.html` | 22:35:48 | [City of Cuba](https://ecode360.com/34815468) |
| `rule-farmington-2026-11-24.html` | 22:17:52 | [City of Farmington](https://ecode360.com/29074450) |
| `rule-forsyth-2026-11-24.html` | 22:19:09 | [City of Forsyth](https://forsythmo.gov/services/) |
| `rule-fredericktown-2026-11-24.html` | 22:26:11 | [City of Fredericktown](https://ecode360.com/30753357) |
| `rule-gallatin-2026-11-24.html` | 22:26:04 | [City of Gallatin](https://ecode360.com/37345910) |
| `rule-green-ridge-2026-11-24.html` | 22:19:09 | [City of Green Ridge](https://ecode360.com/43271442) |
| `rule-hermann-2026-11-24.html` | 22:26:05 | [City of Hermann](https://ecode360.com/28615612) |
| `rule-independence-2026-11-24.html` | 22:16:04 | [City of Independence](https://www.independencemo.gov/fire-department/public-education-independence-fire-department/open-burn-and-cooking-fire-policy-and-regulations) |
| `rule-joplin-2026-11-24.html` | 22:13:03 | [City of Joplin](https://www.joplinmo.gov/safety-enforcement/fire-department/burn-permit) |
| `rule-kearney-2026-11-24.html` | 22:13:05 | [Unincorporated Clay County in the Kearney Fire & Rescue Protection District](https://www.kearneyfire.org/burn-permit-in-kearney-mo/) |
| `rule-kennett-2026-11-24.html` | 22:30:42 | [City of Kennett](https://ecode360.com/32640150) |
| `rule-lake-ozark-2026-11-24.html` | 22:24:56 | [Lake Ozark Fire Protection District](https://www.lofpd.com/business-resources) |
| `rule-lebanon-2026-11-24.html` | 22:16:07 | [City of Lebanon](https://www.lebanonmissouri.org/193/Open-Burning-Information) |
| `rule-leeton-2026-11-24.html` | 22:17:46 | [City of Leeton](https://ecode360.com/45356882) |
| `rule-lexington-2026-11-24.html` | 22:16:16 | [City of Lexington](https://ecode360.com/28523097) |
| `rule-lockwood-2026-11-24.html` | 22:19:10 | [City of Lockwood](https://ecode360.com/30254775) |
| `rule-louisiana-2026-11-24.html` | 22:17:49 | [City of Louisiana](https://ecode360.com/28116858) |
| `rule-marceline-2026-11-24.html` | 22:35:47 | [City of Marceline](https://ecode360.com/30213406) |
| `rule-marshfield-2026-11-24.html` | 22:30:41 | [City of Marshfield](https://ecode360.com/29587589) |
| `rule-maryville-2026-11-24.html` | 22:30:39 | [City of Maryville](https://ecode360.com/39371472) |
| `rule-maysville-2026-11-24.html` | 22:16:09 | [City of Maysville](https://ecode360.com/31639109) |
| `rule-milan-2026-11-24.html` | 22:26:22 | [City of Milan](https://ecode360.com/33058876) |
| `rule-mound-city-2026-11-24.html` | 22:31:46 | [Mound City](https://ecode360.com/32392925) |
| `rule-nevada-2026-11-24.pdf` | 22:31:46 | [City of Nevada](https://www.nevadamo.gov/DocumentCenter/View/2597) → [final URL](https://www.nevadamo.gov/DocumentCenter/View/2597/Ord-8748?bidId=) |
| `rule-new-london-2026-11-24.html` | 22:26:19 | [City of New London](https://ecode360.com/29550173) |
| `rule-ozark-district-2026-11-24.html` | 22:13:06 | [Ozark Fire Protection District](https://www.ozarkfire.org/openburningrequirements) |
| `rule-palmyra-2026-11-24.html` | 22:26:13 | [City of Palmyra](https://ecode360.com/28355550) |
| `rule-platte-city-2026-11-24.html` | 22:16:06 | [Platte City](https://ecode360.com/38631098) |
| `rule-poplar-bluff-2026-11-24.html` | 22:16:11 | [City of Poplar Bluff](https://ecode360.com/28996145) |
| `rule-raymore-2026-11-24.html` | 22:16:20 | [City of Raymore](https://ecode360.com/39639875) |
| `rule-richmond-2026-11-24.html` | 22:16:08 | [City of Richmond](https://www.cityofrichmond.net/FormCenter/Police-5/Burn-Permit-Request-47) |
| `rule-rock-port-2026-11-24.html` | 22:17:48 | [City of Rock Port](https://ecode360.com/29774605) |
| `rule-rogersville-2026-11-24.html` | 22:17:45 | [City of Rogersville](https://ecode360.com/33550838) |
| `rule-rolla-2026-11-24.html` | 22:19:08 | [City of Rolla](https://ecode360.com/50344632) |
| `rule-savannah-2026-11-24.html` | 22:30:44 | [City of Savannah](https://ecode360.com/28518688) |
| `rule-scott-city-2026-11-24.html` | 22:17:50 | [Scott City](https://ecode360.com/29172656) |
| `rule-sikeston-2026-11-24.html` | 22:26:17 | [City of Sikeston](https://ecode360.com/27667061) |
| `rule-st-joseph-2026-11-24.html` | 22:13:05 | [City of St. Joseph](https://www.ci.st-joseph.mo.us/m/faq) |
| `rule-stockton-2026-11-24.html` | 22:26:00 | [City of Stockton](https://ecode360.com/29836523) |
| `rule-sunrise-2026-11-24.html` | 22:19:06 | [Sunrise Beach Fire Protection District](https://sbfpd.org/burn-permits/) |
| `rule-tipton-2026-11-24.html` | 22:42:53 | [City of Tipton](https://ecode360.com/35244517) |
| `rule-trenton-2026-11-24.html` | 22:26:08 | [City of Trenton](https://ecode360.com/28490198) |
| `rule-troy-2026-11-24.html` | 22:16:08 | [City of Troy](https://ecode360.com/28046574) |
| `rule-warrensburg-2026-11-24.html` | 22:24:44 | [City of Warrensburg](https://warrensburg-mo.gov/438/Controlled-Burns) |
| `rule-warrenton-2026-11-24.html` | 22:26:23 | [City of Warrenton](https://ecode360.com/28699411) |
