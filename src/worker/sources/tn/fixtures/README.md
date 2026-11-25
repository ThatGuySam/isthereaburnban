# Tennessee source captures

- `permit-roster-2026-11-24.json` was captured at 12:31:01 UTC. The public Nuxt map sends the restriction type, the two public visibility levels and a date range. This response lists jurisdictions with a matching record and a map exemption flag. It contains no decision dates or reasons. [Exact roster request](https://tn.firesponse.com/burn-permit/api/burnrestriction/all/public?restrictionTypes=400a8031-fb0f-41aa-8384-17df772b219b&from=2026-11-24T00%3A00%3A00&to=2026-11-24T23%3A59%3A59&levels=PUBLIC&levels=PRIVATE_PUBLIC)
- `permit-details-2026-11-24.json` was captured at 12:31:02 UTC. The map's county details call uses the same filters and repeated `ids` parameters. It returns five hazardous-fire-weather holds and three standing notices referring users to local rules. The fetcher selects county records and publishes dated state permit holds as scoped restrictions. [Exact details request](https://tn.firesponse.com/burn-permit/api/burnrestriction/byAdminDivisions?restrictionTypes=400a8031-fb0f-41aa-8384-17df772b219b&from=2026-11-24T00%3A00%3A00&to=2026-11-24T23%3A59%3A59&levels=PUBLIC&levels=PRIVATE_PUBLIC&ids=017a64aa-2e31-49e2-84fc-2707e93f2cd9&ids=0e08dd0b-2363-4f8f-a396-91a2d7d1c2a0&ids=1e8af982-8328-44a0-ae24-679fb4ac688a&ids=6452a697-6e3a-4a3b-9902-622128f56aae&ids=74897c5b-1451-4986-a40c-b2f9a8d6899c&ids=c1924ac1-f198-4148-8605-b1d303381d53&ids=f4f20e11-cdb2-4f6b-bced-ba04bcf46a32&ids=fb69b419-ec0f-4ebc-a501-8dbab7076a0f)
- `permit-denial-reasons-2026-11-24.json` was captured at 12:30:17 UTC. The map uses these codes to display hazardous fire weather, poor smoke dispersion, municipality and other. [Exact reasons request](https://tn.firesponse.com/burn-permit/api/master/denialreason)
- `permit-season-2026-11-24.html` was captured at 12:28:47 UTC. It retains the original heading and permit paragraphs. T.C.A. § 39-14-306 gives the 500-foot scope, the local ordinance exception and the State Forester's authority to change the season. Rule 0080-07-05-.02 gives the local opening and closing times. The county timezone split follows 49 CFR § 71.5(d). [Exact guidance request](https://www.tn.gov/tnwildlandfire/prevention/safe-debris-burning/permits.html) · [State wildfire laws](https://www.tn.gov/tnwildlandfire/prevention/safe-debris-burning/tn-wildfire-fire-laws.html) · [State rule PDF](https://publications.tnsosfiles.com/rules/0080/0080-07/0080-07-05.20140729.pdf) · [Federal timezone boundary](https://www.govinfo.gov/content/pkg/CFR-2024-title49-vol1/xhtml/CFR-2024-title49-vol1-part71.html)

The [public map](https://tn.firesponse.com/burn-permit/public-restrictions/) sends offset-free wall times and shows the details in the viewer's local clock format. The adapter interprets effective times in the county's zone. A point lookup for Claiborne on its all-day end date, November 25, still returned the hold at 23:59:00 and omitted it at 23:59:00.001. The timed Jackson hold ending November 25 at midnight was absent at 00:00:01. The API's edit stamps carry no offset, so the rows use the verified effective dates and our check time.

## November 24 county pass

Dates in the filenames refer to the publisher’s Tennessee local date. Capture times below are UTC. HTML fixtures preserve the selected published content and omit unrelated page chrome. PDF fixtures retain the published bytes for digest verification.

| Fixture | Captured (UTC) | Request and evidence |
| --- | --- | --- |
| `hamilton-burn-widget-2026-11-24.html` | 2026-11-25 03:55:01 | [APCB daily widget](https://apcb.org/). November 24 permitted burning from 9 a.m. to 3:30 p.m. Eastern. |
| `airnow-2026-11-24.dat` | 2026-11-25 04:01:55 | [Current AirNow reporting areas](https://files.airnowtech.org/airnow/today/reportingarea.dat). Memphis and Knoxville forecasts show no applicable hold. |
| `airnow-2026-09-16.dat` | 2026-11-25 04:03:10 | [September 16 AirNow archive](https://files.airnowtech.org/airnow/2026/20260916/reportingarea.dat). The Shelby County Health Department forecast Code Orange for September 17. |
| `airnow-2026-09-19.dat` | 2026-11-25 04:03:11 | [September 19 AirNow archive](https://files.airnowtech.org/airnow/2026/20260919/reportingarea.dat). The Shelby County Health Department forecast Code Orange for that day. |
| `gatlinburg-news-2026-11-24.html` | 2026-11-25 04:09:54 | [Apptegy news index](https://www.gatlinburgtn.gov/news). Keeps the dates and links from the first news page. |
| `gatlinburg-permit-hold-2026-11-20.html` | 2026-11-25 04:09:53 | [Apptegy city notice](https://www.gatlinburgtn.gov/article/3354138/). The post published November 20 confirmed a permit pause through November 22. |
| `tullahoma-permit-page-2026-11-24.html` | 2026-11-25 04:14:29 | [Revize permit page](https://www.tullahomatn.gov/departments/fire_department/burn_permit.php). Includes the city’s interpretation of the form and its burn hours. |
| `tullahoma-closed-form-2026-11-24.html` | 2026-11-25 04:16:19 | [Embedded form request](https://docs.google.com/forms/d/1kl_Ymy4gxW6CJl_UlfeWz_WJJoD_t19MfXSLvyxTEGw/viewform?embedded=true). Google redirected to its closed-form page, which displayed Tullahoma’s weather hold. |

The 04:19 UTC replay on November 25 used the full captured pages and documents. County and city sources yielded 34 scoped or county restrictions for local November 24. Applying the existing state calendar with a simulated 403 yielded 95 restricted summaries. The state rule’s stale-verification note is included on its fallback records.

### Reviewed rule requests

| Fixture | Captured (UTC) | Source |
| --- | --- | --- |
| `rule-davidson-2026-11-24.pdf` | 2026-11-25 04:01:53 | [Metro Nashville Public Health Department](https://www.nashville.gov/sites/default/files/2025-10/Reg1PreventionAbatementAndControlOfAir.pdf) |
| `rule-knox-2026-11-24.html` | 2026-11-25 04:01:52 | [Knox County Air Quality Management](https://www.knoxcounty.org/airquality/open_burning.php) |
| `rule-fayette-2026-11-24.html` | 2026-11-25 04:01:59 | [Fayette County Fire Department](https://fayettetn.us/departments/fire-department/) |
| `rule-shelby-2026-11-24.html` | 2026-11-25 04:01:51 | [Shelby County Health Department](https://www.shelbytnhealth.com/176/Open-Burning-Land-Clearing-Contractors) |
| `rule-madison-2026-11-24.html` | 2026-11-25 04:01:52 | [Madison County Fire Department](https://www.madisoncountytn.gov/382/Open-and-Barrel-Burn-Pemits) |
| `rule-rutherford-2026-11-24.html` | 2026-11-25 04:01:52 | [Rutherford County Fire Marshal](https://rutherfordcountytn.gov/index.asp?SEC=35A2B927-B483-4F0C-8AB1-2B39F15FD34B) |
| `rule-hamilton-season-2026-11-24.html` | 2026-11-25 04:01:52 | [Chattanooga-Hamilton County Air Pollution Control Bureau](https://apcb.org/about-burning/) |
| `rule-ashland-2026-11-24.html` | 2026-11-25 04:03:10 | [Ashland City Fire Department](https://www.ashlandcityfire.com/burn-permits/) |
| `rule-dickson-2026-11-24.html` | 2026-11-25 04:01:52 | [City of Dickson Fire Marshal](https://www.cityofdickson.com/fire-marshal) |
| `rule-columbia-2026-11-24.html` | 2026-11-25 04:03:10 | [Columbia Fire and Rescue](https://www.columbiatn.gov/272/Burn-Permit-Information) |
| `rule-lebanon-2026-11-24.html` | 2026-11-25 04:01:53 | [Lebanon Fire Department](https://lebanonfiredept.com/fire-marshals-office/fire-code-enforcement/burn-permits/) |
| `rule-covington-2026-11-24.html` | 2026-11-25 04:01:52 | [City of Covington Fire Department](https://www.covingtontn.gov/burn-permit) |
| `rule-springfield-2026-11-24.html` | 2026-11-25 04:01:52 | [Springfield Fire Department](https://www.springfieldtn.gov/324/Burn-Permits) |
| `rule-sevierville-2026-11-24.html` | 2026-11-25 04:01:52 | [Sevierville Fire Department](https://www.seviervilletn.org/468/Open-Burning) |
| `rule-jonesborough-2026-11-24.html` | 2026-11-25 04:01:52 | [Jonesborough Fire Department](https://www.jonesboroughtn.org/town-services/public-safety/fire-department/) |
| `rule-kingsport-2026-11-24.html` | 2026-11-25 04:03:10 | [Kingsport Fire Marshal](https://www.kingsporttn.gov/city-services/fire-department/fire-marshal/open-burning/) |
| `rule-rocky-top-2026-11-24.html` | 2026-11-25 04:01:53 | [City of Rocky Top code via University of Tennessee MTAS](https://www.mtas.tennessee.edu/city-code/rocky_top/title17/chapter1/section17-109) |
| `rule-baxter-2026-11-24.html` | 2026-11-25 04:01:54 | [City of Baxter code via University of Tennessee MTAS](https://www.mtas.tennessee.edu/city-code/baxter/title7/chapter2/section7-209) |
| `rule-baneberry-2026-11-24.html` | 2026-11-25 04:01:55 | [City of Baneberry code via University of Tennessee MTAS](https://www.mtas.tennessee.edu/city-code/baneberry/title7/chapter3/section7-301) |
| `rule-clarksville-2026-11-24.html` | 2026-11-25 04:01:52 | [Clarksville Fire Rescue](https://www.clarksvilletn.gov/885/Open-Burning) |
| `rule-alcoa-2026-11-24.html` | 2026-11-25 04:01:53 | [Alcoa Fire Department](https://cityofalcoa-tn.gov/341/Burn-Permits) |
| `rule-cleveland-2026-11-24.html` | 2026-11-25 04:01:53 | [Cleveland Fire Department via City of Cleveland 311](https://clevelandtn.qscend.com/311/knowledgebase/article/430) |
| `rule-lenoir-city-2026-11-24.html` | 2026-11-25 04:01:53 | [Lenoir City Fire Department](https://www.lenoircitytn.gov/burn-permits/) |
| `rule-athens-2026-11-24.pdf` | 2026-11-25 04:01:54 | [Athens Fire Department](https://cityofathenstn.com/wp-content/uploads/2025/08/Athens-TN-Burn-Permit-Info.pdf) |
| `rule-williamson-2026-11-24.html` | 2026-11-25 04:01:52 | [Williamson County Fire/Rescue](https://www.wcfire.com/burn-permits) |
| `rule-hendersonville-2026-11-24.html` | 2026-11-25 04:09:52 | [Hendersonville Fire Prevention Bureau](https://hvilletn.org/185/Permits) |
| `rule-henderson-2026-11-24.html` | 2026-11-25 04:01:54 | [Henderson Fire Department](https://www.hendersontn.gov/fire.html) |
| `rule-manchester-2026-11-24.html` | 2026-11-25 04:09:53 | [Manchester Fire and Rescue](https://www.cityofmanchestertn.gov/departments/fire_rescue/index.php) |
| `rule-lewisburg-2026-11-24.pdf` | 2026-11-25 04:09:54 | [Lewisburg Fire Department](https://lewisburgtn.gov/wp-content/uploads/2024/12/Open-Burning-Operational-Permit-.pdf) |
| `rule-milan-2026-11-24.html` | 2026-11-25 04:09:54 | [Milan Fire Department](https://www.milanfd.com/permits-ordinances) |
| `rule-white-house-2026-11-24.html` | 2026-11-25 04:09:53 | [White House Fire Department](https://www.whitehousetn.gov/214/Burn-Permits) |
| `rule-gallatin-2026-11-24.html` | 2026-11-25 04:09:53 | [Gallatin Fire Department](https://gallatintn.gov/269/Burn-Permits) |
| `rule-tiptonville-2026-11-24.pdf` | 2026-11-25 04:14:29 | [Town of Tiptonville code via University of Tennessee MTAS](https://www.mtas.tennessee.edu/system/files/codes/combined/Tiptonville-code.pdf) |
