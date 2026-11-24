# Alabama source captures

Both HTML excerpts preserve the source text and markup used by the parsers. Navigation, scripts, and unrelated sections were removed.

| Fixture | Exact public GET | Capture (UTC) |
| --- | --- | --- |
| `cahaba-valley-2026-11-24.html` | https://cahabavalleyfire.org/open-burning/ | 2026-11-24 16:03:45 |
| `jefferson-health-2026-11-24.html` | https://www.jcdh.org/SitePages/Programs-Services/EnvironmentalHealth/Air-RadiationProtectionDivision/OpenBurning.aspx | 2026-11-24 16:03:44 |

The district's status banner offered burning with an approved permit within its portions of Jefferson and Shelby counties. Its HTTP Date was `Tue, 24 Nov 2026 16:03:45 GMT`. That header checks the age of the response. The publisher supplies no separate issue timestamp. The district also reproduces ADEM rule 335-3-3-.01 as HTML. The hours, activities and 12-county calendar were reviewed against the [Legislature's official rule PDF](https://admincode.legislature.state.al.us/api/rule/335-3-3-.01). An edit to the reproduced section requires review.

Jefferson's overview backed the April–October and November–March windows. Chapter 5 has additional exceptions for some fires where notice, authorization, or a fire department's hazard determination applies. The parser checks the overview's season summary and uses the narrower vegetation disposal and authorization language reviewed in the [Board of Health's Chapter 5 rule](https://www.jcdh.org/SitePages/Misc/PdfViewer?AdminUploadId=325).

## Inventory checks on November 24

| Candidate | Observed result |
| --- | --- |
| [ADEM Open Burning](https://adem.alabama.gov/air/open-burning) | HTTP 200. State air-quality guidance links to regulations and the vegetation fact sheet. |
| [ADEM vegetation fact sheet](https://adem.alabama.gov/sites/default/files/2026-04/WebsiteVegetationBurning.pdf) | HTTP 200. Lists the 12-county May–October rule, 8 a.m.–3 p.m. start limits, and separate treatment of some agricultural and silvicultural fires. |
| [AFC January advisory rescission](https://afc.forestry.alabama.gov/2026/01/09/fire-danger-advisory-rescinded-statewide/) | HTTP 200. Ends the January fire danger advisory, which was an advisory for that episode. |
| [Cahaba Valley Fire District](https://cahabavalleyfire.org/open-burning/) | HTTP 200. Local permit status banner and district rules, plus the ADEM rule text. |
| [Opp's rule PDF](https://www.cityofopp.com/wp-content/uploads/2025/04/Control-of-Burning-and-Incineration.pdf) | HTTP 200. Scanned copy of ADEM's air rule. |
| [EPA's rule PDF](https://www.epa.gov/system/files/documents/2026-03/335-3-3.pdf) | Direct GET timed out twice. The indexed PDF and Legislature's direct PDF gave the same May–October list and daily hours. |
| [AFC Burn Restriction Definitions](https://www.forestry.alabama.gov/Pages/Fire/BurnRestrictions.aspx) | HTTP 200. Lists advisory, alert, drought emergency and U.S. Forest Service restriction types. WebForms markup carries page state with no current status grid or public status selector. |
| [AFC Burn Law](https://www.forestry.alabama.gov/Pages/Informational/Legal/Burn_Law.aspx) | HTTP 200. Explains permits and fire alerts using language from before Act 2026-402. |
| [Jefferson County overview, apex host](https://jcdh.org/SitePages/Programs-Services/EnvironmentalHealth/Air-RadiationProtectionDivision/OpenBurning.aspx) | TLS hostname mismatch. The identical path at `www.jcdh.org` returned HTTP 200. |

## Forestry follow-up

As of October 1, 2026, the State Forester may order statewide or regional wildfire alerts under § 9-3-5.1. The Commission may declare a wildfire emergency with the Governor's approval under §§ 9-13-140–141. § 9-13-11.1 requires an AFC permit for prescribed burns and sets criteria for issuing permits during alerts. AFC's dispatch number is 800-392-5679. [Enacted HB267](https://alison.legislature.state.al.us/bill-search?search=HB267&tab=1) · [Act text](https://alison.legislature.state.al.us/files/pdf/SearchableInstruments/2026RS/HB267-enr.pdf)

The linked April 13 statewide alert lasted until rescinded. NWS Birmingham reported that AFC had rescinded it by June 11. The WordPress REST index returned 11 posts, with March 5 the latest publication date. It omitted the April alert and its lift. The legacy news archive stopped in September 2024. The permit application requires sign-in, and the public Forestry GIS directory publishes permits and incidents. A current statewide or countywide emergency-order determination still needs Forestry confirmation. [April order](https://forestry.alabama.gov/Pages/News/2026/FireAlert.aspx) · [June 11 bulletin](https://www.weather.gov/media/bmx/DGT/DGT_BMX_06112026.pdf) · [WordPress REST](https://afc.forestry.alabama.gov/wp-json/wp/v2/posts?per_page=10&_fields=id,link,title,date,modified) · [Permit portal](https://treasure.forestry.alabama.gov/) · [GIS directory](https://gis.forestry.alabama.gov/arcgis/rest/services/AFCEnterprise)
