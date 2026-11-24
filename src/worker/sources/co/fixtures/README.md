# Colorado source captures

Direct GETs on November 24, 2026 used the public status-checker user agent. The times below are UTC. The capture window was November 23 Mountain time. CDPHE's advisory ran across both dates. Navigation, unrelated widgets and scripts were trimmed while preserving the current status blocks and publisher dates.

| Fixture | Captured (UTC) | Request |
| --- | --- | --- |
| `douglas-status-2026-11-24.json` | 06:41:03 | `https://dcsheriff.net/wp-json/wp/v2/pages/5828?_fields=id,slug,status,link,modified_gmt,content,title` |
| `el-paso-status-2026-11-24.json` | 06:41:45 | `https://epcsheriffsoffice.com/wp-json/wp/v2/pages/108?_fields=id,slug,status,link,modified_gmt,content,title` |
| `boulder-status-2026-11-24.html` | 06:40:25 | `https://bouldercounty.gov/safety/fire/fire-restrictions/` |
| `arapahoe-status-2026-11-24.html` | 06:41:44 | `https://files.arapahoeco.gov/your_county/county_departments/sheriffs_office/how_do_i/learn_about_the_burn_ban.php` |
| `estes-status-2026-11-24.html` | 06:45:59 | `https://www.estesvalleyfire.org/fire-restrictions-bans` |
| `larimer-aegis-2026-11-24.json` | 06:45:59 | `https://www.arcgis.com/sharing/rest/content/items/4cdd565d89044505b9e41042222e4e7c/data?f=pjson` |
| `denver-air-2026-11-24.html` | 06:40:26 | `https://www.colorado.gov/airquality/advisory.aspx` |

- The WordPress fixtures preserve the published page metadata and rendered status HTML. Boulder uses the public HTML because the REST rendition adds raw page-builder shortcodes. The Arapahoe fixture retains the header and the status table's text and color. The parser reads the text and effective date.
- The Estes Valley page links its active signed order. The September 3 order took effect September 4 at 8 a.m. Mountain time and stays in effect until lifted or changed. The district boundary falls in Larimer County. [Signed order](https://www.estesvalleyfire.org/files/fb3961042/2026.09.03+EVFPD+Burn+Restriction.pdf), [Colorado fire district geometry](https://services3.arcgis.com/DgjqnJA1rgO92Soi/arcgis/rest/services/Fire_Protection_Districts/FeatureServer/0).
- The Larimer Experience fixture keeps the Fire Danger page label, published timestamp, county overview and the three elevation-zone status widgets. The Denver air fixture keeps the advisory heading and forecast, including the publisher's effective and recheck times. The indoor rule covers the AIR program area at or below 7,000 feet in seven named counties. [Colorado Regulation 4](https://www.sos.state.co.us/CCR/GenerateRulePdf.do?fileName=5+CCR+1001-6&ruleVersionId=7102).
