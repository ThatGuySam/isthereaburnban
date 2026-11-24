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
