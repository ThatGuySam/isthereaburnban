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
