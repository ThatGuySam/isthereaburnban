# Kentucky publisher captures

| Fixture | Exact request | Capture (UTC) |
| --- | --- | --- |
| `county-burn-bans-2026-11-24.json` | [Kentucky Forestry SharePoint Pages REST](<https://eec.ky.gov/Natural-Resources/Forestry/wildland-fire-management/_api/web/lists/getbytitle('Pages')/items?%24select=Id%2CTitle%2CFileLeafRef%2CModified%2CMain_x0020_Content&%24filter=FileLeafRef+eq+%27County-Burn-Bans.aspx%27>) | 2026-11-24 07:31:07 |
| `county-burn-bans-empty-2026-07-22.html` | [Archived Kentucky Forestry County Burn Bans](https://web.archive.org/web/20260722172423id_/https://eec.ky.gov/Natural-Resources/Forestry/wildland-fire-management/Pages/County-Burn-Bans.aspx) | 2026-07-22 17:24:23 archive capture, replayed 2026-11-24 07:33:30 |
| `krs-149.400-2026-11-24.pdf` | [Kentucky General Assembly, KRS 149.400](https://apps.legislature.ky.gov/law/Statutes/statute.aspx?id=1898) | 2026-11-24 07:30:08 |

The SharePoint GET used `Accept: application/json;odata=nometadata`. The response preserves the original Pages item, rich-text field, zero-width characters and UTC `Modified` value. The archive fixture keeps the empty list and its original heading and description. The statute PDF is unchanged from the publisher response. Its SHA-256 pins the statute that was reviewed for the scheduled rule.

The statewide publisher labels both November orders with bare names. Grayson is a city in Carter County as well as a county name. The November 18 Grayson County order corroborates the label in the November 20 SharePoint edition. The signed Edmonson order was issued November 20 and excepts established campground campfires. The edit stamp dates the SharePoint page. [Grayson County order text as quoted by K105](https://www.k105.com/2026/11/19/grayson-co-under-an-open-burning-burn-ban/), [signed Edmonson order](https://www.edmonsonvoice.com/uploads/3/7/6/7/37671151/screenshot-2026-11-20-154148_orig.png).

The name ambiguity list is the intersection of county names with the state's complete incorporated-city points layer. Central Time counties follow the federal boundary and the Kentucky county map. [Kentucky city points](https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_City_Points_WGS84WM/MapServer/0/query?where=1%3D1&outFields=NAME&returnGeometry=false&f=json), [49 CFR 71.5(c)](https://www.ecfr.gov/current/title-49/subtitle-A/part-71/section-71.5), [Kentucky county time-zone map](https://www.chfs.ky.gov/agencies/dph/dpqi/dcpb/HLWD%20MAP%20updated%2002-10-2025%20%281%29.pdf).
