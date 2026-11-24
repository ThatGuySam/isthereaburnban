# Maine source captures

Direct GETs on November 24, 2026 used the site's status-checker User-Agent. Times below are UTC.

| Fixture | Public request | Capture | Contents |
| --- | --- | --- | --- |
| [Class days](class-days-2026-11-24.json) | [Map JSON](https://mainefireweather.org/admin/php/get-content.php?content=class-days&which=map) | 15:02:56 | All 12 zone codes and the 8 a.m. Eastern timestamp. Removed the server's debug query field. |
| [Open burning](open-burning-2026-11-24.html) | [12 M.R.S. §9325](https://legislature.maine.gov/statutes/12/title12sec9325.html) | 15:02:16 | Both statutory subsections and their original HTML. Trimmed the site navigation and section history. |
| [Red Flag Warnings](red-flag-2026-11-24.json) | [NWS active Maine warnings](https://api.weather.gov/alerts/active?area=ME&event=Red%20Flag%20Warning) | 15:02:38 | Empty active warning feed. The production Worker uses the national NWS feed and its fire-zone crosswalk. |

The map declared an 8 a.m. Eastern update. The [map script](https://mainefireweather.org/index.js) calls `which=map` and indexes the legend directly with the response's values. The first two indexes are Unknown and Snow Cover, then Low through Extreme start at index 2. On November 24, zones 1, 2, 3, 6 and 8 were Class 1. Zones 4, 5, 7, 9, 10, 11 and 12 were Class 2.

The [Maine Forest Service's town list](https://www11.maine.gov/dacf/mfs/wildfire_danger_report/fire_weather/Fire%20Weather%20Zones%20by%20Town.pdf) has separate old and new zone columns. The [map geography](https://mainefireweather.org/files/MaineWeatherZones.json) uses the new 12-zone numbering. Each rule applies inside the named municipality.

| Municipality | County | Zone | Action shown by the fetcher |
| --- | --- | --- | --- |
| [Union](https://www.union.maine.gov/index.asp?SEC=D6088068-A449-4DE3-A1FF-04F8CA04755C) | Knox | 11 | Class 3 through 5 hold permits for covered burns. |
| [South Thomaston](https://souththomaston.me/town-departments/fire-department/) | Knox | 11 | Class 3 limits issuance to fire wardens. Classes 4 and 5 hold permits. |
| [Cumberland](https://www.townofcumberlandmaine.gov/469/Burn-Permits) | Cumberland | 10 | Class 3 through 5 hold permits. Wind and other conditions can also affect issuance. |
| [Windham](https://www.windhammaine.us/193/Open-BurningBurnFireworks-Permits) | Cumberland | 9 | High fire danger (Class 3) explicitly holds permits. The Class 4 paragraph gives state advice, and the Class 5 paragraph discusses a proclamation. |

[Farmingdale](https://www.farmingdalemaine.org/index.asp?DE=E73099DC-B103-41F5-80C0-CCF101343F9C&SEC=710E3A7F-AEE5-4663-93CD-E30F480BC3DB) and [Wells](https://www.wellstown.org/949/Outdoor-Burning) list the old zone numbers. Confirm each town's intended map zone with its fire department before using the published triggers.

## Inventory checks

| Inventory source | November 24 result |
| --- | --- |
| [State permit portal](https://apps1.web.maine.gov/burnpermit/public/index.html) | HTTP 200. The landing page accepts applications from 9 a.m. to midnight. The public municipality picker asks for town and burn type. Both pages lack a public dated decision list. |
| [Wildfire danger map](https://mainefireweather.org/) | HTTP 200. Displays the 8 a.m. Eastern update and the public danger legend. |
| [Class-days JSON with today selector](https://mainefireweather.org/admin/php/get-content.php?content=class-days&which=today) | HTTP 200. Same codes as the map feed on this check, with no report date. |
| [Update log](https://mainefireweather.org/admin/php/get-content.php?content=updatelog) | HTTP 200. Empty alert and `rawDate`. The map script uses this endpoint for an active Red Flag message. |
| [Bar Harbor](https://www.barharbormaine.gov/367/Burn-Permits) | HTTP 200. Before brush burning, confirm the Fire Chief's same-day decision with the Fire Department. The state portal may display the town warden's administrative hold during the application. |
| [Bath](https://www.cityofbathmaine.gov/Departments/Fire-Rescue/Burn-Permits) | HTTP 200. Same-day permits online or in person, with separate Red Flag guidance. No dated decision displayed. |
| [Union](https://www.union.maine.gov/index.asp?SEC=D6088068-A449-4DE3-A1FF-04F8CA04755C) | HTTP 200. Zone 11 class trigger and local restrictions on permit issuance. |
| [Windham](https://www.windhammaine.us/193/Open-BurningBurnFireworks-Permits) | HTTP 200. Permit rules and class trigger, with other local issuance factors. |
| [Official wildfire danger report](https://www11.maine.gov/dacf/mfs/wildfire_danger_report/index.html) | HTTP 200. Embeds the map and links to permit access. |
| [Inventory statute URL](https://legis.maine.gov/legis/statutes/12/title12sec9325.html) | Curl error 60, hostname mismatch. The [Legislature host](https://legislature.maine.gov/statutes/12/title12sec9325.html) returned 200. |
| [Inventory open-burning FAQ](https://www.maine.gov/dacf/mfs/forest_protection/downloads/FAQs%20for%20new%20open%20burning%20laws%202024_03072024%20.pdf) | HTTP 403. The [state's www11 mirror](https://www11.maine.gov/dacf/mfs/forest_protection/downloads/FAQs%20for%20new%20open%20burning%20laws%202024_03072024%20.pdf) returned 200, as it did for the town-zone PDF. |

Title 12 [§9321](https://legislature.maine.gov/statutes/12/title12sec9321.html) covers permit restrictions and revocation, including a narrow exemption for approved wild blueberry burns. [§9324(10)](https://legislature.maine.gov/statutes/12/title12sec9324.html) applies the Red Flag restriction to the warned area and provides camping exceptions. [Maine Forest Service guidance](https://www11.maine.gov/dacf/mfs/forest_protection/programs_services.html) directs people to the town warden in organized towns and to a state ranger in unorganized territory. The burn permit moratorium visible in the [news archive](https://www11.maine.gov/dacf/mfs/news-article.html) was dated August 14, 2025.
