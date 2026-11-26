# Connecticut DEEP forest fire danger

On 2026-11-24 at 15:15:32 UTC, a direct GET with the project User-Agent to [DEEP's embedded report](https://www.depdata.ct.gov/forestry/forestfire/firerpt.cshtml) returned HTTP 200 and UTF-8 HTML. The [Sitecore landing page](https://portal.ct.gov/deep/forestry/forest-fire/forest-fire-danger-report) embeds the ASP.NET Razor report as an iframe. The capture preserves the report heading, table and explanation. The gateway's scripts were removed.

The report for Tuesday, November 24, 2026 says **HIGH** and **All counties HIGH**. Section 11 of [Public Act 26-124](https://www.cga.ct.gov/2026/ACT/PA/PDF/2026PA-00124-R00HB-05153-PA.PDF) amended § 22a-174(f) effective October 1, adding High and Very High to the brush-burning restriction within 100 feet of woodland or grassland. DEEP's report explains this setback for residential permit holders. The parser returns scoped restrictions through the end of the stated Eastern date. All eight mapped counties are the traditional counties used in the site geography and the DEEP report. The report may use finer geography, so days without an explicit uniform elevated rating require checking the official page for the affected areas. The [June 14 split report](https://www.ctinsider.com/news/article/connecticut-high-forest-fire-risk-22304636.php/) was quoted with exceptions defined by town or road.

The [Forest Fire Warden's separate authority](https://cga.ct.gov/current/PUB/chap_449.htm#sec_23-49a) applies to qualifying open-air fire near woodland, brushland or adjacent dried grass during a declaration, subject to statutory exceptions and special permits. The Governor can issue separate orders under § 23-50 as amended by section 14 of Public Act 26-124. DEEP can issue orders for its public lands. Municipalities issue residential permits and may impose further limits. For an individual burn, check the [town's open-burning official](https://portal.ct.gov/government/cities-and-towns), [DEEP air quality forecast](https://portal.ct.gov/deep/air/forecasting/aqi/air-quality-index) and the land manager.

## November 24 inventory checks

All eight URLs returned HTTP 200 to a direct GET with the project User-Agent. The Legislature chapter URL had a certificate-chain error on direct curl and was checked through web search. It is a legal reference.

| Publisher and stack | Observed content |
| --- | --- |
| [Bethel permit availability](https://bethel-ct.gov/?SEC=ACEF59A4-CD02-4BF8-95B4-B4163A35F160), municipal HTML | Posted year-round availability and a fee effective September 21, 2026. Requires day-of danger below High and a call to dispatch. |
| [Bethel permit application](https://bethel-ct.gov/?SEC=C8135FB9-27D7-40BA-8630-38553E91D54C), municipal HTML | The application gives eligibility, materials and pile limits. It supplies no daily decision. |
| [DEEP open-burning guidance](https://portal.ct.gov/deep/air/open-burning/open-burning), Sitecore | Gives permit and air-quality conditions and links the daily report. |
| [DEEP land-order lift](https://portal.ct.gov/deep/news-releases/news-releases---2024/deep-lifts-statewide-burn-ban-on-public-lands-it-administers), Sitecore | The November 26, 2024 release lifts the State Parks, Forests and Wildlife Management Areas order. |
| [DEEP extreme-danger announcement](https://portal.ct.gov/deep/news-releases/news-releases---2024/deep-warns-of-extreme-fire-danger-in-connecticut), Sitecore | The October 26, 2024 release announces that scoped land order and a separate statewide suspension of open-burning permits under § 23-49a. |
| [Greenwich archive](https://www.greenwichct.gov/m/newsflash/Archive/Item/2653?arcId=5025), CivicPlus News Flash | The town issued its own order November 15, 2024. The current [News Flash](https://www.greenwichct.gov/m/newsflash) and [Alert Center](https://www.greenwichct.gov/AlertCenter.aspx) had no current burn order or dated town rescission. |
| [Salisbury permit rules](https://www.salisburyct.us/burn-permits-2/), WordPress | Permitted burning requires Low danger and Good air quality. It links to the state report and has no dated decision. |
| [Litchfield permit rules](https://www.townoflitchfieldct.gov/subpages/burning-permits), municipal HTML | Requires a permit and bars covered burning at High, Very High or Extreme. It has no dated decision. |

The [Chesterfield Fire Company](https://nextdoor.com/agency-detail/ct/town-of-montville/chesterfield-fire-company-1/) confirmed the November 24 High reading for Montville and that its permits were invalid that day. The [Montville Fire Marshal](https://www.montville-ct.gov/department-services/fire-marshall-emergency-management/) explains the town's permit rules.

## County pass captures

Public GETs with the project user agent returned HTTP 200 on November 26, 2026. The times below are UTC. The eCode360 captures retain the numbered sections used by the parser and their ancestor elements. The CivicPlus captures retain the title and content widget markup. Each trimmed fixture produced the same fingerprint as the full public page.

| Fixture | Request URL | Time (UTC) |
| --- | --- | --- |
| `ridgefield-open-burning-2026-11-26.html` | https://ecode360.com/12368289 | 13:29:36 |
| `newington-residential-brush-2026-11-26.html` | https://ecode360.com/8835073 | 13:29:50 |
| `milford-open-burning-2026-11-26.html` | https://ecode360.com/14523165 | 13:29:39 |
| `harwinton-open-burning-2026-11-26.html` | https://ecode360.com/44844383 | 13:29:42 |
| `winchester-brush-certificates-2026-11-26.html` | https://ecode360.com/37116189 | 13:29:41 |
| `old-saybrook-open-burning-2026-11-26.html` | https://ecode360.com/8718820 | 13:29:44 |
| `mansfield-open-burning-2026-11-26.html` | https://ecode360.com/11768140 | 13:29:46 |
| `putnam-open-burning-2026-11-26.html` | https://ecode360.com/47691550 | 13:29:47 |
| `trumbull-open-burning-2026-11-26.html` | https://www.trumbull-ct.gov/167/Open-Burn-Permits | 13:29:38 |
| `north-stonington-brush-permits-2026-11-26.html` | https://www.northstoningtonct.gov/217/Burning-Permit-Information | 13:29:37 |

Harwinton’s code specifies 12:01 a.m. June 1 and 11:59 p.m. September 30, so the seasonal row uses those local times on the boundary days. North Stonington’s page says permits are unavailable between June 15 and September 15. The extra seasonal row covers June 16 through September 14, and the standing permit rule continues to apply on the two boundary dates. The town’s form specifies permit validity conditions separately from the issuance pause. [North Stonington permit form](https://www.northstoningtonct.gov/DocumentCenter/View/6010/Burning-Permit-Fillable-2026)
