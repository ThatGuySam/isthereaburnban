# New York source captures

Both fixtures are from public GETs with the project status-checker user agent. The excerpts retain the publisher's headings, rule text and list or paragraph markup. Navigation, videos, unrelated sections and scripts were removed.

| Fixture | Request URL | Captured (UTC) |
| --- | --- | --- |
| `dec-open-burning-2026-11-24.html` | https://dec.ny.gov/environmental-protection/air-quality/open-burning | 2026-11-24 12:46:14 |
| `nyc-311-barbecuing-2026-11-24.html` | https://portal.311.nyc.gov/article/?kanumber=KA-02228 | 2026-11-24 12:46:14 |

## Scope and geography

- DEC's Drupal guidance describes the residential brush-burning exception in 6 NYCRR § 215.3(a) and its March 16–May 14 statewide closure. The regulation also excludes villages from that exception. Environmental Conservation Law §§ 9-1105(5) and 9-1107 require a written DEC permit in the listed Fire Towns for eligible burning. The adapter reports the permit requirement during the May 15–March 15 exception window and the seasonal restriction during spring. The designation rule includes incorporated villages within Fire Town boundaries. The separate village exclusion still limits where residential brush can qualify for the Part 215 exception. [DEC permit quoting Part 215](https://extapps.dec.ny.gov/data/dar/afs/permits/401010011200029_r3.pdf) · [Permit statute](https://www.nysenate.gov/legislation/laws/ENV/9-1105) · [Fire Town designations](https://www.nysenate.gov/legislation/laws/ENV/9-1107)
- DEC lists all towns in Essex and Hamilton counties and names the covered towns in 14 other counties. The mapping uses modern names for Au Sable, Bellmont, Greig, Lake Luzerne and Tupper Lake. Saint Lawrence maps to the Census county name St. Lawrence. [Clinton County names](https://gis.ny.gov/clinton-county-orthoimagery-downloads) · [Franklin County names](https://gis.ny.gov/franklin-county-orthoimagery-downloads) · [Lewis County names](https://gis.ny.gov/lewis-county-orthoimagery-downloads) · [Warren County names](https://gis.ny.gov/warren-county-orthoimagery-downloads)
- NYC 311's public WebForms article gives standing barbecue rules for residential sites and designated park areas. The city spans Bronx, Kings, New York, Queens and Richmond counties. Fire Code § 307 has separate rules and exceptions for open fires, including certain residential fire pits. NYC 311 supplies the barbecue rows, and the Fire Code is a reference for other open fires. [FDNY Fire Code chapter 3](https://www.nyc.gov/assets/fdny/downloads/pdf/about/chapter-3-2022.pdf)

## Inventory and other checks on November 24

| Publisher | Result |
| --- | --- |
| [DEC Open Burning](https://dec.ny.gov/environmental-protection/air-quality/open-burning) | HTTP 200. Part 215 guidance, spring dates, material rules, and Fire Town permit list. No dated emergency status. |
| [NYC 311](https://portal.311.nyc.gov/article/?kanumber=KA-02228) | HTTP 200. Standing residential and park barbecue rules. |
| [Governor's 2025 announcement](https://www.governor.ny.gov/news/due-increased-fire-risk-governor-hochul-implements-temporary-statewide-burn-ban) | HTTP 200. Signed statewide order ran October 2–15, 2025 and had activity exceptions. The state annual report confirms the end date. |
| [Governor's fire-danger launch](https://www.governor.ny.gov/news/governor-hochul-announces-launch-new-state-art-system-help-new-yorkers-prepare-wildfire-danger) | HTTP 200. The statement about a ban no longer being in effect is from October 25, 2024. |
| [FDNY Fire Code chapter 3](https://www.nyc.gov/assets/fdny/downloads/pdf/about/chapter-3-2022.pdf) | HTTP 200. Section 307 generally prohibits open fires and specifies exceptions and approvals. FDNY can temporarily restrict otherwise authorized open fires. |
| [NYC Buildings](https://www.nyc.gov/site/buildings/property-or-business-owner/barbecues.page) | HTTP 200. Standing guidance on portable and permanent residential barbecues. |
| [NYC Parks](https://nycgovparks.org/facilities/barbecue) | Redirect to the `www` host, then CloudFront HTTP 403. The indexed page lists designated areas and park fire restrictions. |
| [NYS Health](https://www.health.ny.gov/environmental/outdoors/air/trash.htm) | CloudFront HTTP 403. The indexed page explains the standing trash-burning prohibition. DEC's accessible rule page covers it. |

The [Governor's keyword search](https://www.governor.ny.gov/news?search_api_fulltext=burn%20ban) misses the known [November 2024 order](https://www.governor.ny.gov/news/governor-hochul-provides-update-wildfires-impacting-new-york-state). The [DEC newsroom filter](https://dec.ny.gov/news/press-releases?text=burn%20ban) shows the spring rule and an October 30 campfire advisory. The [November 20 drought advisory](https://dec.ny.gov/news/press-releases/2026/11/dec-provides-update-on-drought-conditions-in-central-new-york-western-new-york-and-the-southern-tier) concerns conservation. The [DEC fire-danger map](https://dec.ny.gov/environmental-protection/wildfires/fire-danger-map) embeds a [Mesonet table](https://api.nysmesonet.org/data/firewx/GetFDRA/image.php/table/latest) dated November 24 with eight Low regions and Moderate ratings for Hudson Valley and Long Island. The ratings describe conditions. The HTML reports and map lack a complete listing of orders and lifts.

The [Ulster County orders page](https://www.ulstercountyny.gov/Departments/Emergency-Services/Burn-Bans) returned HTTP 200 with an empty order area and no dated status. The [controlled-burn contacts](https://www.ulstercountyny.gov/Departments/Emergency-Services/Divisions/Emergency-Communications/Controlled-Burn-Reporting) list standing town and fire district rules. [Essex County](https://essexcountyny.gov/burn-ban-state-of-emergency-for-extremely-dry-conditions-september-2025/) records rescission of its 2025 emergency ban on October 31, 2025. Direct curl to NYSenate's ECL pages returned Cloudflare 403. The published statutes are indexed, and DHSES's [official Executive Law Article 2-B PDF](https://www.dhses.ny.gov/nys-executive-law-article-2-b) was reachable.
