# Hawaiʻi Clean Air Branch captures

| Fixture | Public GET | Captured UTC |
| --- | --- | --- |
| [cab-no-burn-2026-11-24.html](cab-no-burn-2026-11-24.html) | https://health.hawaii.gov/cab/ | 2026-11-24 17:14:33 |
| [cab-open-burning-2026-11-24.html](cab-open-burning-2026-11-24.html) | https://health.hawaii.gov/cab/open-burning-and-agricultural-burning-permits-in-hawaii/ | 2026-11-24 17:14:35 |

Both GETs returned HTTP 200. The fixtures retain the original headings, rule paragraphs and no-burn table. The fetcher requests the canonical homepage because WordPress pagination and cached search copies can show different expiration dates. The public WordPress REST page routes 192 and 55 returned HTTP 401 with `itsec_rest_api_access_restricted`. The HTML bulletin has no publication time, so the fetcher checks HTTP response age and records its check time. Hawaiʻi Island district names follow the county's map. [District maps](https://www.planning.hawaiicounty.gov/resources/zone-maps) · [Official PDF map](https://gis.hawaiicounty.gov/public/downloads/plhyperlinks/CDP/NorthKohala.pdf)

The November 24 bulletin says North and South Kona are in a no-burn period through noon HST on November 30. Kaʻū remains in a no-burn period until further notice. Hawaiʻi Administrative Rules § 11-60.1-55 applies to agricultural burning and conditionally allowed burning under § 11-60.1-52(e), subject to applicable waivers. Countywide temporary status and any activity outside the notice's scope require separate confirmation. [Air pollution rules, § 11-60.1-55](https://health.hawaii.gov/cab/files/2024/02/HAR_11-60_1_searchable.pdf#page=67)

## November 24 inventory checks

| Publisher material | Direct GET | Finding |
| --- | --- | --- |
| [Clean Air Branch open-burning guidance](https://health.hawaii.gov/cab/open-burning-and-agricultural-burning-permits-in-hawaii/) | 200 | Year-round statewide limits on open burning and agricultural permit requirements. The linked [permit portal](https://eha-cloud.doh.hawaii.gov/cab#!/agp/list) is a JavaScript application for issued permits. |
| [DOH administrative rules](https://health.hawaii.gov/cab/files/2024/02/HAR_11-60_1_searchable.pdf#page=63) | 200 | Sections 52 and 53 set the standing prohibition, exceptions and permits. Section 55 gives DOH authority to issue district- or island-level no-burn periods. |
| [DOH open-burning FAQ](https://health.hawaii.gov/cab/files/2024/09/Open-Burning-FAQ-2024-amendments-to-HAR-September-2024.pdf) | 200 | Backyard waste burning is prohibited. Attended cooking fires with qualifying fuel are excepted. Recreational fires require approval. |
| [DOH agricultural fact sheet](https://health.hawaii.gov/cab/files/2025/08/Agricultural-Burning-Fact-Sheet-v2.pdf) | 200 | July 25, 2025 permit guidance points to the CAB homepage for mandatory no-burn periods. |
| [Honolulu Fire Department prevention PDF](https://fire.honolulu.gov/wp-content/uploads/2026/03/Wildland-Fire-Prevention.pdf) | 200 | Year-round prevention advice and warning about unauthorized open burning. |
| [Maui County Council proclamation index](https://mauicounty.us/emergencyproclamations/) | 200 | The HTML and WordPress REST index list recovery proclamations and lag the Mayor's November 6 wildfire recovery order. |
| [Hawaiʻi County July 31, 2025 notice](https://www.hawaiicounty.gov/Home/Components/News/News/4143/720) | Akamai 403 | Historic partial outdoor fire order. The county issued a termination on August 7, 2025. [Termination notice](https://www.hawaiicounty.gov/Home/Components/News/News/4157/720) |

The governor and mayors issue their own emergency proclamations under HRS § 127A-14. The state index listed separate wildfire recovery and 2026 wildfire-season proclamations. The seasonal proclamation mobilizes state resources through November 28. The November 6 recovery proclamation runs through December 15. The Maui Mayor's November 6 order addresses wildfire recovery and temporary structures. Review the operative terms of emergency orders for any burn restrictions. [Emergency powers](https://data.capitol.hawaii.gov/hrscurrent/Vol03_Ch0121-0200D/HRS0127A/HRS_0127A-0014.htm) · [State proclamation index](https://dod.hawaii.gov/hiema/active-state-emergency-proclamations/) · [Maui Mayor's order](https://www.mauicounty.gov/DocumentCenter/View/165674/2026-11-06-Mayors-Twenty-fifth-Emergency-Proclamation-Relating-to-Wildfires-PDF)

Check local notices for fire-safety orders. Kalawao remains under DOH. [Hawaiʻi County Civil Defense](https://hawaii-county-civil-defense-agency-hawaiicountygis.hub.arcgis.com/) · [Honolulu fire news](https://fire.honolulu.gov/news-and-info/news-releases/) · [Kauaʻi proclamations](https://www.kauai.gov/Government/Departments-Agencies/Emergency-Management-Agency/Emergency-Proclamations) · [DOH Kalaupapa updates](https://health.hawaii.gov/kalaupapaupdates/)

DLNR's fire protection law describes separate land closures and fire permits. Check park-specific conditions with the land manager. [DLNR fire protection](https://dlnr.hawaii.gov/forestry/fire/land-fire-protection-law/) · [Hawaiʻi Volcanoes](https://www.nps.gov/havo/planyourvisit/conditions.htm) · [Haleakalā](https://www.nps.gov/hale/planyourvisit/conditions.htm) · [Kalaupapa](https://www.nps.gov/kala/learn/management/lawsandpolicies.htm)
