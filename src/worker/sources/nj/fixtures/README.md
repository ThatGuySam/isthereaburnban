# New Jersey Forest Fire Service ArcGIS fixtures

These are unmodified attribute-only responses from the NJDEP Fire Danger Dashboard service. The capture date is November 24 in New Jersey (Eastern Standard Time).

| File | UTC capture time | Exact GET |
| --- | --- | --- |
| `divisions-2026-11-24.json` | 2026-11-24 05:14:39 | [Division layer query](https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/Envr_admin_FFS_danger_public/FeatureServer/2/query?where=1%3D1&outFields=DIVISION%2CFIRE_DANGER%2CRECFIRE_RESTRICTION%2CAGBURN_RESTRICTION%2CFROST_EXCEPTION%2CCOMMENTS%2CEditDate&returnGeometry=false&f=json) |
| `counties-2026-11-24.json` | 2026-11-24 05:14:40 | [County layer query](https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/Envr_admin_FFS_danger_public/FeatureServer/1/query?where=1%3D1&outFields=COUNTY%2CFIRE_DANGER%2CRECFIRE_RESTRICTION%2CAGBURN_RESTRICTION%2CFROST_EXCEPTION%2CCOMMENTS%2CEditDate&returnGeometry=false&f=json) |

Both layers declare UTC for `EditDate`. The dashboard uses a nonempty fire danger rating to activate a county report and gives that county report precedence. All 21 county rows use the coded empty value `Emtpy` in this capture. Gloucester carries a legacy agricultural `Y` from June 2023 on its inactive row. [Division field metadata](https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/Envr_admin_FFS_danger_public/FeatureServer/2?f=json), [county field metadata](https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/Envr_admin_FFS_danger_public/FeatureServer/1?f=json), [dashboard configuration](https://www.arcgis.com/sharing/rest/content/items/ab223d9403e94560a60b31b4141cc46e/data?f=json), [web map configuration](https://www.arcgis.com/sharing/rest/content/items/927e6fd69e90402a82419e232b9500c5/data?f=json).

The Forest Fire Service jurisdiction list hosted by Hopewell Township places Mercer and Middlesex in both A and B. Comparing the two layers' polygons confirmed the split and the other 19 county assignments. [Jurisdiction list](https://www.hopewelltwp.org/DocumentCenter/View/249/Open-Burning-Regulations-PDF), [division geometry](https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/Envr_admin_FFS_danger_public/FeatureServer/2/query?where=1%3D1&outFields=DIVISION%2CDIVISION_LABEL&returnGeometry=true&outSR=4326&f=geojson), [county geometry](https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/Envr_admin_FFS_danger_public/FeatureServer/1/query?where=1%3D1&outFields=COUNTY&returnGeometry=true&outSR=4326&f=geojson).

The 48-hour cutoff is measured from each feature's edit time. This is the site's freshness policy. The layer does not give effective or expiration dates for its flags.
