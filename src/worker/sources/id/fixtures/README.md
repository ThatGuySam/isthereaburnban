# Idaho publisher captures

All captures used public GET requests on November 24, 2026. The ArcGIS files preserve the publisher's complete JSON responses. The DEQ and statute fixtures keep the original date, codes, headings, and legal text. They omit navigation and scripts.

| Fixture | Request | Captured (UTC) |
| --- | --- | --- |
| `idl-layer-2026-11-24.json` | [IDL Fire Restriction Zones metadata](https://gis1.idl.idaho.gov/arcgis/rest/services/Portal/FireRestrictions/MapServer/1?f=json) | 08:31:13 |
| `idl-zones-2026-11-24.json` | [IDL ordered zone attributes](https://gis1.idl.idaho.gov/arcgis/rest/services/Portal/FireRestrictions/MapServer/1/query?where=1%3D1&outFields=OBJECTID%2CName%2CStage%2CRstrct_Are%2Clast_edited_date%2CDateEnacted%2CDateRescinded%2CShape.STArea%28%29&returnGeometry=false&f=json&orderByFields=OBJECTID+ASC&resultOffset=0&resultRecordCount=1000) | 08:31:14 |
| `deq-coeur-dalene-2026-11-24.html` | [DEQ Coeur d'Alene forecast](https://www2.deq.idaho.gov/air/AQIPublic/Forecast?siteId=2) | 08:28:55 |
| `section-38-115-2026-11-24.html` | [Idaho Code § 38-115](https://legislature.idaho.gov/statutesrules/idstat/Title38/T38CH1/SECT38-115/) | 08:26:46 |

The [IDL finder](https://www.idl.idaho.gov/fire-management/fire-restrictions-finder/) embeds a [dashboard](https://gis1.idl.idaho.gov/portal/apps/dashboards/f272389828ac47fe8f884d5ec5841c5a) whose [configuration](https://gis1.idl.idaho.gov/portal/sharing/rest/content/items/f272389828ac47fe8f884d5ec5841c5a/data?f=json) points to layer 1 of the MapServer. All 25 rows showed `None`. The most recent edit was September 11, 2026 at 07:00 UTC.

DEQ's November 23 forecast showed Yellow / Conditional for outdoor burning November 24 and 25 and Green / No Restrictions November 26. The county map's Kootenai feature agreed for all three days. The corresponding wood-heating rows were Green. DEQ names Kootenai County as a participant in the daily advisory program. The district's rules specify Yellow/Red restrictions by activity and direct residents to the Kootenai County option on the DEQ hotline. [DEQ local ordinances](https://www2.deq.idaho.gov/air/AQIPublic/Ordinance/Index/1) · [District rules](https://kootenaifire.com/burn-permits/) · [Recreational or cooking fires](https://kootenaifire.com/recreational-cooking-fire-regulations/)

## IDL county intersections

To regenerate `../idl-zone-counties.json`, project the IDL polygons from WGS84 and the 2025 Census county polygons from NAD83 to EPSG:5070. Repair invalid geometries before intersection. Retain each Idaho county with at least 1 km² of intersection to omit small slivers from mismatched boundary lines. Join each polygon to the ordered attributes by `OBJECTID`, `Name`, and `Rstrct_Are`. Record those fields as `id`, `name`, and `area`, the attribute `Shape.STArea()` as `shapeArea`, and the sorted county FIPS codes as `countyFips`. The Worker checks the inventory and area values before applying the crosswalk. The 25 zones intersect all 44 Idaho counties at this threshold. Use the issuing agency's map for a specific location. [IDL geometry captured at 08:28:50 UTC](https://gis1.idl.idaho.gov/arcgis/rest/services/Portal/FireRestrictions/MapServer/1/query?where=1%3D1&outFields=OBJECTID%2CName%2CRstrct_Are&returnGeometry=true&outSR=4326&f=geojson) · [Census boundaries captured at 08:28:51 UTC](https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip)

The IDL geometry SHA-256 was `c7c1ea7c766cedbd87f05093edfce4480539d05751fbd33bb8705bf5dc61a686`. The Census county file SHA-256 was `aa976c00b181939755d0da757f4c7c2dc0103c3b3b4530fb2a91c2bb62fc777c`.

The seasonal rule groups counties by their local time zones. Idaho County crosses the Salmon River time-zone boundary and uses a scoped window for each side. [49 CFR § 71.9](https://www.govinfo.gov/app/details/CFR-2024-title49-vol1/CFR-2024-title49-vol1-sec71-9)

## Idaho county pass

These publisher responses were captured on 2026-11-26 UTC. HTML fixtures omit scripts, styles, and form inputs. The Sandpoint fixture retains the city's published statutory notice. The unmodified PDFs are checked by byte digest.

| Fixture | Request URL | UTC capture |
| --- | --- | --- |
| `id-ammon-permits-2026-11-26.html.gz` | <https://www.bcfd1.us/burn-permit/> | 06:26:57 |
| `id-arco-permits-2026-11-26.pdf` | <https://cityofarco.municipalimpact.com/documents/263/8.12_-_Garbage_and_Refuse.pdf> | 06:27:00 |
| `id-bannock-emergency-burn-status-2026-11-26.html.gz` | <https://www.bannockcounty.gov/oem/> | 06:26:57 |
| `id-blackfoot-registration-2026-11-26.html.gz` | <https://www.cityofblackfoot.org/435/Controlled-Burn-Guidelines> | 06:26:58 |
| `id-boise-city-2026-11-26.pdf` | <https://www.cityofboise.org/media/19124/openburningregulations.pdf> | 06:28:17 |
| `id-bonneville-announcement-2026-11-26.html.gz` | <https://www.bonnevillecountyidaho.gov/county-news/burn-ban-in-effect> | 06:26:57 |
| `id-bonneville-county-orders-2026-11-26.html.gz` | <https://www.bonnevillecountyidaho.gov/page/resolutions> | 06:28:17 |
| `id-cascade-winter-permits-2026-11-26.html.gz` | <https://www.cascadefireid.gov/burn-permits> | 06:27:01 |
| `id-central-fire-registration-2026-11-26.html.gz` | <https://www.centralfiredistrict.com/register-a-controlled-burn/> | 06:29:56 |
| `id-coeur-dalene-fire-status-2026-11-26.html.gz` | <https://www.cdaid.org/government/departments/fire/> | 06:31:01 |
| `id-fort-hall-fire-notice-2026-11-26.pdf` | <https://www.sbtribes.com/wp-content/uploads/2025/05/2026-Fire-Permit-4.pdf> | 06:28:19 |
| `id-franklin-permit-season-2026-11-26.html.gz` | <https://franklincountyfiredistrict.com/> | 06:27:00 |
| `id-gem-fire-2-orders-2026-11-26.html.gz` | <https://www.gemfire2.org/burnban> | 06:26:57 |
| `id-idaho-city-open-burning-2026-11-26.pdf` | <https://idahocity.municipalimpact.com/documents/170/Burn_Permit..pdf> | 06:44:04 |
| `id-jerome-city-permits-2026-11-26.html.gz` | <https://www.ci.jerome.id.us/210/Fire-Burn-Permit> | 06:26:59 |
| `id-lewiston-open-burning-2026-11-26.pdf` | <https://www.cityoflewiston.org/DocumentCenter/View/163/Open-Burning-Versus-Recreational-Fires-PDF> | 06:29:56 |
| `id-madison-registration-2026-11-26.html.gz` | <https://fdmadison.org/register-a-controlled-burn/> | 06:26:58 |
| `id-moscow-yard-waste-2026-11-26.html.gz` | <https://www.ci.moscow.id.us/m/faq?cat=19> | 06:36:54 |
| `id-mountain-home-permits-2026-11-26.html.gz` | <https://www.mountain-home.us/174/Fire-Department> | 06:28:19 |
| `id-nampa-permits-2026-11-26.html.gz` | <https://nampafire.org/> | 06:26:58 |
| `id-nez-perce-reservation-permits-2026-11-26.html.gz` | <https://farr.npterwmairquality.org/> | 06:27:01 |
| `id-north-blaine-permits-2026-11-26.html.gz` | <https://www.northblainecountyfire.com/permits> | 06:29:56 |
| `id-northern-lakes-fire-status-2026-11-26.html.gz` | <https://northernlakesfire.com/> | 06:29:57 |
| `id-payette-city-permits-2026-11-26.html.gz` | <https://payettefiredepartment.com/> | 06:36:55 |
| `id-pocatello-permits-2026-11-26.html.gz` | <https://pocatello.gov/204/Licenses-Permits> | 06:26:57 |
| `id-rupert-open-burning-2026-11-26.html.gz` | <https://rupert-idaho.com/departments/fire#permits> | 06:26:59 |
| `id-sandpoint-open-burning-2026-11-26.html.gz` | <https://hagadonenewsnetwork.com/news/2026/may/26/7-legals-for-may-26-2026/> | 06:45:59 |
| `id-st-maries-permits-2026-11-26.html.gz` | <https://www.stmariesfire.com/burn-permit> | 06:27:00 |
| `id-teton-burn-permits-2026-11-26.html.gz` | <https://www.tetoncountyfire.org/burn-permit-information> | 06:31:00 |
| `id-twin-falls-city-permits-2026-11-26.html.gz` | <https://www.tfid.org/734/Online-Burn-Permits> | 06:26:58 |
| `id-washington-season-2026-11-26.pdf` | <https://www.co.washington.id.us/DocumentCenter/View/2027/Open-Burning> | 06:29:54 |
| `id-weiser-burn-notice-2026-11-26.html.gz` | <https://www.weiserfiredistrict.com/> | 06:27:02 |
| `id-wendell-open-burning-2026-11-26.pdf` | <https://storage.googleapis.com/juniper-media-library/234/2025/04/Burn-Permit.pdf> | 06:42:26 |
