# Oregon publisher captures

All captures used public GET requests. The LRAPA fixtures retain the visible date, advisory note and complete Syncfusion grid with its literal JSON. The Willamette fixtures retain the publication body inside its original `pre` element. Navigation, unrelated scripts and ASP.NET anti-forgery fields were omitted. Line endings were normalized to LF.

| Fixture | Request URL | Captured (UTC) |
| --- | --- | --- |
| `lrapa-outdoor-2026-11-24.html` | [LRAPA current outdoor advisory](https://aqi.lrapa-or.gov/BybBlckMstRcnt/Index) | 2026-11-24 07:05:58 |
| `lrapa-wood-heating-2026-11-24.html` | [LRAPA current home wood heating advisory](https://aqi.lrapa-or.gov/HwhBlckMstRcnt/Index) | 2026-11-24 07:05:59 |
| `willamette-2026-11-23.html` | [Willamette Valley current bulletin](https://smkmgt.com/burn.php) | 2026-11-24 07:04:18 |
| `willamette-2026-11-21-22.html` | [Willamette Valley November 20 afternoon bulletin](https://smkmgt.com/archives/burn_advisories/2026_1120_1450_PST_Burn_Advisory.htm) | 2026-11-24 07:10:19 |
| `odf-layer-2026-11-24.json` | [ODF public regulated-use layer metadata](https://gis.odf.oregon.gov/odfags/rest/services/Hosted/Fire_Industrial_Fire_Precaution_Level_View/FeatureServer/0?f=json) | 2026-11-24 07:19:08 |
| `odf-areas-2026-11-24.json` | [ODF public regulated-use attributes](https://gis.odf.oregon.gov/odfags/rest/services/Hosted/Fire_Industrial_Fire_Precaution_Level_View/FeatureServer/0/query?where=1%3D1&outFields=regusearea%2Cdistrict%2CSHAPE__Area%2Creguseineffect%2Cdebrisburning%2Copenfire%2Copenfireother%2Copenfirewoodburning&returnGeometry=false&f=json) | 2026-11-24 07:19:09 |

The outdoor advisory was issued at 7 p.m. Pacific on November 23 for November 24. The wood heating advisory was issued at 2 p.m. Pacific on November 23 and took effect at 4 p.m. that day. Its November 24 heading denotes the day on which the advisory expires at 4 p.m. A November 24 Willamette bulletin had yet to be published when captured.

The ODF metadata fixture retains the layer name, edit stamp and code domains used by the parser. The attribute query preserves all 61 rows. All 61 had zero regulated-use, debris-burning and campfire codes. The layer reported its last edit on November 20 at 18:06 UTC.

## ODF county intersections

The map's current [application configuration](https://gisapps.odf.oregon.gov/firerestrictions/config.json) declares an industrial precautions portal item. The [public map code](https://gisapps.odf.oregon.gov/firerestrictions/app/shared.js) uses that item for public identify requests. Its [public restriction panel](https://gisapps.odf.oregon.gov/firerestrictions/app/pfrMain.js) displays debris-burning codes and gates campfire and temporary-dwelling rules on regulated-use status.

To regenerate `../odf-areas.json`, download both geometry queries in Oregon's equal-area units (EPSG:5070). Make the geometries valid, intersect each regulated-use polygon with the county polygons, and retain counties with at least 1 km² of overlap to omit small boundary slivers. Record the district ID and original `SHAPE__Area` for each area. The Worker checks both fields before using the mapping. The 61 areas intersect 35 counties at this threshold. For an address, consult the ODF map and district proclamation. [ODF polygons captured 2026-11-24 07:17:10 UTC](https://gis.odf.oregon.gov/odfags/rest/services/Hosted/Fire_Industrial_Fire_Precaution_Level_View/FeatureServer/0/query?where=1%3D1&outFields=regusearea%2Cdistrict%2CSHAPE__Area&returnGeometry=true&outSR=5070&f=geojson), [Oregon county boundaries captured 2026-11-24 07:17:04 UTC](https://gis.wrd.state.or.us/server/rest/services/adm/Counties_WGS84/FeatureServer/0/query?where=1%3D1&outFields=fips_code&returnGeometry=true&outSR=5070&f=geojson).
