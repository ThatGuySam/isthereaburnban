# Iowa county source fixtures

The November 24, 2026 captures were made between 22:48 and 23:14 UTC. HTML fixtures retain the publisher's live status region or reviewed rule wording. The surrounding navigation and scripts were removed. The signed orders and ordinances were reviewed for the affected area, effective terms and exceptions.

| Bulletin capture | Request | Observed status |
| --- | --- | --- |
| `cedar-2026-11-24.html` | [Cedar County EMA](https://cedarcounty.iowa.gov/emergency_management/) | Current county banner gives a March 6, 2026 lift |
| `decatur-2026-11-24.html` | [Decatur County EMA](https://decaturcountyia.municipalone.com/7313/emergency-management) | Current panel gives the February 6 request and March 3, 2026 lift |
| `mills-2026-11-24.html` | [Mills County Alert Center](https://www.millscountyiowa.gov/AlertCenter.aspx) | Active notice gives the April 2, 2026 lift |
| `pottawattamie-2026-11-24.html` | [Pottawattamie fire conditions](https://www.pottcounty-ia.gov/emergency_management/fire_conditions/) | Current conditions intro confirms no active county restrictions |

Each `rule-<id>-2026-11-24` fixture uses the exact request listed in [local-rules.ts](../local-rules.ts). HTML fixtures reproduce the selected rule text. PDF fixtures are exact response bytes. The three large county codes use real HEAD captures as JSON. Their strong ETags identify the document versions checked against these full PDF digests.

| County code | PDF page | SHA-256 of reviewed PDF |
| --- | --- | --- |
| Greene | 127–128 | `11c2e2812cac9ab696f05bf0e723825fe7b2f942a858c18d19ee0f75a96cecc8` |
| Lee | 64–66 | `c9e7b1f6a8efe99cf6503050fed8f64b1b6188250cdf98b6e763de066faf92d5` |
| Pocahontas | 65 | `93be451639974e937d9a8bad17c611d1bc361d2214bb2811bbac69d866a4a33a` |

The earlier statewide fixture remains in [adapters/fixtures/ia.json](../../../adapters/fixtures/ia.json). The November 24 query using the existing statewide adapter's field selection also returned all 99 Iowa counties with null flags. A missing county or null flag produces no statewide negative.
