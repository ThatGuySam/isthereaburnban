# Montana publisher fixtures

Captured November 24, 2026 with the project User-Agent. JSON fixtures are the exact public GET response bodies. HTML fixtures retain the publisher's status table, notices and permit-season headings. Unrelated markup, navigation and scripts are omitted.

| Fixture | Capture time (UTC) | Request |
| --- | --- | --- |
| `deq-fall-2026-11-24.json` | 09:25:36 | [DEQ fall decision query](https://gis.mtdeq.us/hosting/rest/services/Hosted/Montana_Open_Burning_Restrictions/FeatureServer/0/query?where=1%3D1&outFields=objectid%2Carea_name%2Crestrictions%2Carea_notes%2Clast_edited_date&returnGeometry=false&f=json) |
| `dnrc-layer-2026-11-24.json` | 09:25:36 | [DNRC active layer metadata](https://services2.arcgis.com/DRQySz3VhPgOv7Bo/arcgis/rest/services/Fire_Restrictions_by_Jurisdiction_Update_-_Read_Only_view/FeatureServer/3?f=json) |
| `dnrc-orders-2026-11-24.json` | 09:25:38 | [DNRC active stage and closure query](https://services2.arcgis.com/DRQySz3VhPgOv7Bo/arcgis/rest/services/Fire_Restrictions_by_Jurisdiction_Update_-_Read_Only_view/FeatureServer/3/query?where=RestrictionType+IN+%28%27Stage+1%27%2C%27Stage+2%27%2C%27Closures%27%29&outFields=OBJECTID%2CNAME_1%2CAreaSubUnit%2CJurisdictionalUnitAgency%2CJurisdictionalUnitName%2CLandownerCategory%2CRestrictionType%2CRestriction_Document%2CEditDate&returnGeometry=false&f=json) |
| `gallatin-2026-11-24.html` | 09:22:37 | [Gallatin County status](https://www.readygallatin.com/residents/open-burning/) |
| `missoula-2026-11-24.html` | 09:22:41 | [Missoula County notice and seasons](https://www.missoulacounty.gov/9652) |

DEQ's [public map](https://gis.mtdeq.us/portal/apps/instant/sidebar/index.html?appid=f6169ce9ad4a43098e1c89a909ea07e4) points to the [web map](https://gis.mtdeq.us/portal/sharing/rest/content/items/d2885b22c14d4ee0a874088d334249cd/data?f=json) and the [fall layer's coded domain](https://gis.mtdeq.us/hosting/rest/services/Hosted/Montana_Open_Burning_Restrictions/FeatureServer/0?f=json). Edits were logged November 23 around 3:06–3:17 p.m. Mountain time and 16 rows named Tuesday. The other five rows delegated to local agencies.

DNRC layer 3 is the layer used for active restrictions by DEQ's map. The live query filtered to the same stages and closures as the map. An unfiltered query on layers 2 and 3 returned the same 531 jurisdiction records and gave no statewide answer. The last edit was October 29.

Gallatin's table was dated November 20. The tests use that date for the three closures and November 24 to verify expiration. The table was checked against the [permit portal](https://gallatinburnpermits.com/), [district map](https://www.arcgis.com/sharing/rest/content/items/910dd95bf08f4c2db29d4deaded97c02/data?f=json) and [fire control ordinance](https://www.readygallatin.com/wp-content/uploads/2026/06/CRN04000-1.pdf). Missoula's November 1 notice confirms both regular-season closures. The displayed daily forecast is separate from those recurring rules.
