# Public burn-ban and outdoor-burning sources by state

This audit covers all 50 states and DC as of November 23, 2026, Central Time. It prioritizes the 44 jurisdictions without a live adapter and looks for reports that say whether a specific kind of outdoor burning is currently restricted.

## Short answer

**29 states publish an operational burn status somewhere.** 23 have a state, statewide-reporting or interagency source for at least one activity or land scope. The other 6 have verified county, town or air-district status. The remaining 21 states and DC have official rules, permits or order notices, with current event status unverified in this audit. **348 new URLs** are documented. 315 returned successfully in curl and 33 were confirmed in web search. Start with CAL FIRE and Michigan DNR, then New Jersey, Wisconsin and Minnesota.

| Operational scope | States |
| --- | --- |
| State, statewide-reporting or interagency | AK, CA, FL, ID, IN, KY, LA, MI, MN, MO, MS, MT, ND, NJ, NV, OK, PA, TX, UT, VT, WA, WI, WY |
| Verified only at a local or air-district level | AR, AZ, CO, GA, NM, OR |

## What the evidence says

The earlier rebuild memo identified seven live adapters. This pass confirmed more ways to answer the question, including state permit decisions in California and Michigan, county reporting in Kentucky and North Dakota, a same-day county call in Gwinnett, and an explicit status table for seven Puget Sound airsheds. The audit also found misleading negatives. Polk County, Iowa's “Can I Burn Today” page still displayed a February decision. Tennessee's ArcGIS layer got a schema edit in April 2026, but its last data edit was March 27, 2024. California's San Joaquin Valley residential status page displayed “The Season Has Ended” during the program's published November–February season. [Previous research](../burn-ban-revival-2026-11-23.md), [source inventory](sources.json).

**How the count works.** An operational source exposes a status in a maintained report, current-status page, order layer, or scheduled permit/air-quality decision. It can report either a restriction or its absence for the publisher's area. It still needs review for lag and completeness. For example, Pennsylvania's published county map is dated November 1, and Kentucky supplies no status date. Calendar laws, permit applications, historic notices, general risk maps and isolated federal bulletins count as baseline or supplemental evidence. A numbered difficulty rates the proposed extraction route, from **1** for a direct structured input to **5** where only a directory or manual monitoring is supported.

## Official link replacements

- **Ohio.** The State Fire Marshal's existing web URL returned HTTP 404. The State Fire Marshal's official PDF and Ohio Revised Code § 1503.18 both loaded and support the statewide 6 a.m.–6 p.m. seasonal restriction for covered open burning outside municipalities. This is an official link replacement for the guidance, with emergency orders handled separately. [State Fire Marshal PDF](https://dam.assets.ohio.gov/image/upload/com.ohio.gov/documents/fire_ForestryLaws.pdf), [Ohio Revised Code § 1503.18](https://codes.ohio.gov/ohio-revised-code/section-1503.18).
- **Arkansas.** The official Forestry portal loaded, but its statewide map failed certificate verification. The county-linked `www.arkfireinfo.org` route redirected to the same failing map. Use the Forestry page as the statewide agency link and Faulkner County's page and signed order for a working local status. Its banner reports a ban effective November 18 at 9 a.m. under Order 26-204, which specifies unincorporated areas. The earlier November 3 rescission applies to Order 26-170. A working statewide machine source remains unverified. [Arkansas Forestry](https://agriculture.arkansas.gov/forests/), [Faulkner County status banner](https://www.faulknercountyar.gov/), [Court Order 26-204](https://www.faulknercountyar.gov/wp-content/uploads/2026/11/Faulkner-County-Court-Order-26-204.pdf).

## By state and district

### Alabama

**Difficulty 4/5.** Alabama Forestry describes fire alerts and Governor's No Burn Orders. ADEM gives statewide open-burning rules and Jefferson County's board of health publishes a separate April–October prohibition with a food-preparation exception. Poll Forestry announcements for events and model the Jefferson County calendar and authorization requirements separately. Jefferson County's route was indexed but failed curl. [Alabama Forestry restrictions](https://www.forestry.alabama.gov/Pages/Fire/BurnRestrictions.aspx), [ADEM rules](https://adem.alabama.gov/air/open-burning), [Jefferson County open burning](https://jcdh.org/SitePages/Programs-Services/EnvironmentalHealth/Air-RadiationProtectionDivision/OpenBurning.aspx).

### Alaska

**Difficulty 2/5.** The DNR ArcGIS view returns permit status by zone. MatSu East returned code 4, open and permit not required. Read its coded-value domain, link each area's permit page and preserve boundaries, seasonal closures and separate local authority. Alaska Wildland Fire Information carries dated suspension notices from DNR. [DNR permit-zone FeatureServer](https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Alaska_Burn_Permit_Zones_Public_View/FeatureServer/0), [Mat-Su permit information](https://dnr.alaska.gov/burn/fireareas/mat-su).

### Arizona

**Difficulty 2/5.** Pima County's current restriction block reported no fire restrictions. Read that explicit text for county scope. Maricopa's air-quality No Burn Days regulate different activities. The Southwest dashboard embeds an Experience app that points to the interagency web map and DFFM layer. The state-land Mohave South record had a blank stage beside prohibition text, so verify signed orders before drawing conclusions from that layer. [Pima County status](https://www.pima.gov/wildfire-warnings), [Maricopa burning activities](https://wrr.maricopa.gov/1830/Burning-Activities), [Southwest web-map data](https://www.arcgis.com/sharing/rest/content/items/3cc937c423e44a678da007a70a8f8598/data?f=json).

### Arkansas

**Difficulty 4/5 statewide, 2/5 for Faulkner.** Read the WordPress homepage banner, follow the linked signed PDF and match later lifts by order number. The REST search returned older articles without the most recent homepage order. Benton County says it uses a red active-ban banner, but curl hit Cloudflare. Pulaski and Sebastian publish dated news for county orders and lifts. [Faulkner County status](https://www.faulknercountyar.gov/), [Benton County Fire Marshal](https://bentoncountyar.gov/fire-marshal/burn-ban-information/), [Sebastian County lift notice](https://www.sebastiancountyar.gov/Home/News/articleType/ArticleView/articleId/205/Burn-Ban-Lifted-1052026).

### California

**Difficulty 2/5.** CAL FIRE's Sitecore HTML delivered the county/SRA table, including Alameda SRA allowed from November 20 and Butte SRA permit required from November 1. CARB's PFIRS HTML publishes an agricultural/prescribed burn-day call by basin and date. Local clearance still applies. El Dorado, Placer, Northern Sierra, Sacramento and the Bay Area add district decisions for specific burn types. [CAL FIRE table](https://burnpermit.fire.ca.gov/current-burn-status/), [CARB daily decisions](https://ssl.arb.ca.gov/pfirs/cb3/cb3.php), [El Dorado burn day](https://www.eldoradocounty.ca.gov/Services/Burn-Day), [Northern Sierra status](https://www.nsaqmdca.gov/burn-day-status).

### Colorado

**Difficulty 3/5.** Douglas County's WordPress status page said Stage 1 had been lifted for unincorporated areas, including Larkspur and Castle Pines. Boulder County publishes separately scoped notices through govDelivery. The Colorado State Forest Service directory links local authorities and a Rocky Mountain dashboard. Read current county blocks and follow dated orders, or intersect manager-specific layers after resolving the dashboard's web map. The regional county boundary layer has no status. [Douglas County](https://dcsheriff.net/sheriffs-office/divisions/emergency-management/fire-restrictions/), [Boulder County bulletin](https://content.govdelivery.com/accounts/COBOULDER/bulletins/42f51aa), [Colorado directory](https://csfs.colostate.edu/wildfire-mitigation/current-wildfire-information-fire-restrictions/).

### Connecticut

**Difficulty 4/5.** DEEP Sitecore guidance identifies the town open-burning official and permit rules. Bethel posts permit availability and conditions. Greenwich's CivicPlus archive and DEEP's lift notice show the format for town and state-land events. A current statewide or dated local restriction decision was unverified. [DEEP open burning](https://portal.ct.gov/deep/air/open-burning/open-burning), [Bethel permits](https://bethel-ct.gov/?SEC=ACEF59A4-CD02-4BF8-95B4-B4163A35F160), [Greenwich notice archive](https://www.greenwichct.gov/m/newsflash/Archive/Item/2653?arcId=5025).

### Delaware

**Difficulty 3/5.** DNREC WordPress pages give the May 1–September 30 rule and exceptions, linked to activity-specific agricultural and fire-company guidance. Use dates to determine seasonal applicability. State Fire Marshal announcements show a 2024 emergency issue and lift. Current emergency or countywide status was unverified. [DNREC open burning](https://dnrec.delaware.gov/air/open-burning/), [agricultural rules](https://dnrec.delaware.gov/air/open-burning/agricultural/), [Fire Marshal lift notice](https://news.delaware.gov/2024/11/25/burn-ban-lifted/).

### District of Columbia

**Difficulty 5/5 for live orders.** DOEE's Chapter 6 PDF and the District Code give standing activity limits. FEMS publishes operational permits and bonfire general orders. Parse the regulatory sections and link the applicable rules by activity. The NPS Rock Creek alert page is a land-manager supplement. A dynamic District-issued ban source was unverified. [DOEE rules](https://doee.dc.gov/sites/default/files/dc/sites/ddoe/publication/attachments/aqd.revch6_.pdf), [FEMS bonfire order](https://fems.dc.gov/sites/default/files/dc/sites/fems/service_content/attachments/G.O.619%20PP%20Bonfire%20Permits%20%28Revised%204-27-17%29.pdf), [DC Code](https://code.dccouncil.gov/us/dc/council/code/sections/22-1313), [Rock Creek alerts](https://www.nps.gov/rocr/planyourvisit/conditions.htm).

### Florida

**Difficulty 1/5.** Florida Forest Service publishes the existing county adapter's ArcGIS view with separate open-burning and fireworks columns. Alachua showed no burn ban and no fireworks ban. Voluntary reports and older county timestamps limit the negative. Use Osceola's dated lift and Hillsborough's restrictions page for local cross-checks. [FFS FeatureServer](https://services3.arcgis.com/XYg2eF8UuxZVuVmF/arcgis/rest/services/Burn_Ban_Public_View_v2_4118cfe50dba49efa3d6fa7326d5a87f/FeatureServer/0), [Osceola lift](https://www.osceola.org/News/Burn-Ban-Lifted-06262026), [Hillsborough rules](https://hcfl.gov/businesses/permits-and-records/permits/open-burning-restrictions).

### Georgia

**Difficulty 2/5.** Gwinnett's county page gives a same-day BURN DAY or NO BURN value and timestamp. November 23 was a burn day. Georgia EPD publishes the 54-county May–September calendar, while Georgia Forestry Commission posts emergency orders separately. Parse the dated Gwinnett banner, then build the state calendar and event stream. [Gwinnett daily status](https://www.gwinnettcounty.com/government/departments/fire-emergency/outdoor-burning-information), [Georgia EPD summer ban](https://epd.georgia.gov/air-protection-branch/open-burning-rules-georgia/summer-open-burning-ban).

### Hawaiʻi

**Difficulty 4/5.** Hawaiʻi DOH publishes standing open-burning rules, agricultural permit conditions and no-burn periods in HTML and PDFs. Hawaiʻi County's Granicus notice is a dated 2025 geographically scoped example. The Maui County Council keeps a WordPress proclamation index. A current county or statewide restriction result was unverified. [Hawaiʻi DOH](https://health.hawaii.gov/cab/open-burning-and-agricultural-burning-permits-in-hawaii/), [Hawaiʻi County notice](https://www.hawaiicounty.gov/Home/Components/News/News/4143/720), [Maui County proclamation index](https://mauicounty.us/emergencyproclamations/).

### Idaho

**Difficulty 2/5.** Idaho DEQ's map points to a public GeoJSON forecast with county or airshed restriction categories and message text. The Department of Lands ArcGIS finder adds separate land-manager fire stages. Join by polygon, freshness, activity and issuing agency. A fire stage and an air-quality burn decision can both apply. [DEQ GeoJSON](https://www2.deq.idaho.gov/air/AQIPublic/Map/Forecast), [IDL finder](https://www.idl.idaho.gov/fire-management/fire-restrictions-finder/), [fire-stage ownership layer](https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Idaho_Fire_Restrictions_v2/FeatureServer/1).

### Illinois

**Difficulty 4/5.** Illinois EPA publishes standing rules. Lake and Cook counties, Naperville and Bartlett Fire Protection District publish local rules or permit requirements. Read the CivicPlus-style county and district content and key state rules by activity and area. A current event feed or daily status was unverified. [Illinois EPA](https://epa.illinois.gov/topics/forms/air-permits/open-burning.html), [Lake County](https://www.lakecountyil.gov/4438/Open-Burning-Restrictions), [Cook County](https://www.cookcountyil.gov/service/open-burning-permit), [Naperville](https://www.naperville.il.us/471/Open-Burning-Permits).

### Indiana

**Difficulty 1/5.** The WebEOC FeatureServer behind DHS's public map had a November 23 data edit. Adams reported no ban on November 19. Use county-supplied report timestamps and separate the tribal row and any city orders. [DHS public map](https://www.in.gov/dhs/burn-ban-map/), [WebEOC FeatureServer](https://services8.arcgis.com/mRWfR9ONMmLivkAh/arcgis/rest/services/WebEOC_prod_BurnBans/FeatureServer/0).

### Iowa

**Difficulty 2/5 for confirmed positives.** The State Fire Marshal's dashboard and ArcGIS view report proclamations and lifts, but the returned view was last data-edited in April and sample flags were null. Keep the existing positive-only use, with order-date validation and no automated negative. Polk County's published February status was stale. Linn County explains its local request process and the State Fire Marshal's role. [State Fire Marshal layer](https://services.arcgis.com/vPD5PVLI6sfkZ5E4/arcgis/rest/services/Active_Burn_Bans_%28View%29/FeatureServer/0), [Linn County](https://linncounty-ema.org/burn-ban-info), [Polk County dated page](https://www.polkcountyiowa.gov/public-works/air-quality/open-burning/can-i-burn-today/).

### Kansas

**Difficulty 4/5.** Kansas Forest Service links county contacts. Sedgwick County Fire District 1 publishes the annual April restriction and scope. Franklin County's permit guidance and the state Flint Hills program provide local and calendar fallbacks. Statewide and daily local event status were unverified. [County directory](https://ksfire.org/burn-info/), [Sedgwick April rules](https://www.sedgwickcounty.org/fire/fire-prevention-division/april-burn-ban/).

### Kentucky

**Difficulty 2/5.** Division of Forestry's SharePoint page returned HTTP 200 in this run. Its Current Burn Bans list contained Edmonson and Grayson with no listed update date. Extract the list by heading and use reported positives only. The publisher explicitly says it may miss local orders. County Judge-Executives and fire departments remain the fallback. [Forestry's current list](https://eec.ky.gov/Natural-Resources/Forestry/wildland-fire-management/pages/county-burn-bans.aspx), [county and city authority](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=1899), [Pendleton County](https://pendletoncounty.ky.gov/Pages/Open-Burning-Laws.aspx).

### Louisiana

**Difficulty 1/5.** LDAF's existing ArcGIS parish feed reported a ban for Webster with a parish edit timestamp. Query layer 3 and join three-digit parish FIPS. City and parish orders can overlap. New Orleans' notices illustrate local republication of a state action. [LDAF layer 3](https://services3.arcgis.com/uymqJ6hE4wvB3E9t/arcgis/rest/services/Burn_Ban1/FeatureServer/3), [New Orleans emergency notice](https://ready.nola.gov/incident/statewide-burn-ban/statewide-burn-ban-issued-due-to-concerning-dry-co/).

### Maine

**Difficulty 3/5.** The state fire-weather app exposed a November 23 update and JSON where all 12 zones returned class 2. Union's rule withholds permits at class 3 or above, making that threshold test possible after a geographic join. Other permit prerequisites still apply. Use the weather update log and local rules together. A standalone same-day permit decision was unverified. [Maine fire danger](https://mainefireweather.org/), [daily class JSON](https://mainefireweather.org/admin/php/get-content.php?content=class-days&which=today), [Union permit rule](https://www.union.maine.gov/index.asp?SEC=D6088068-A449-4DE3-A1FF-04F8CA04755C).

### Maryland

**Difficulty 4/5.** Maryland DNR emergency orders and local health departments issue separate notices. Worcester County reported its lift in July 2026, Harford publishes an annual ban notice, and Wicomico publishes signed emergency orders as DocumentCenter PDFs. Track publication and effective dates across issue, extension and lift. A current statewide list or November county snapshot was unverified. [Maryland DNR guidance](https://dnr.maryland.gov/forests/Pages/fire/prevention-burning-guidance.aspx), [Worcester lift](https://worcestermd.gov/news/open-burning-ban-lifted), [Harford notice](https://harfordcountyhealth.com/wp-content/uploads/2026/06/Burn-Ban-Press-Release-6.4.pdf).

### Massachusetts

**Difficulty 3/5.** MassDEP and Fire Services publish the January 15–May 1 season and the list of municipalities where open burning is prohibited. Worcester confirms a citywide prohibition. The Southborough permit process checks the daily decision by phone or permit account. Parse the state calendar and city list, with town decisions as a later feed. [Massachusetts open burning safety](https://www.mass.gov/info-details/open-burning-safety), [Worcester city rule](https://www.worcesterma.gov/faqs/can-i-conduct-open-burning-my-property), [Southborough](https://www.southboroughma.gov/354/Open-Air-Burning-Permit-Information).

### Michigan

**Difficulty 2/5.** DNR publishes county summary codes in ArcGIS and township rows in ASP.NET WebForms HTML. The county service sampled a November 23 local-time pull. Use the renderer for code meaning, prefer township text when available, and refer gray counties to the local issuer. Macomb Township publishes its own permit guidance. [DNR township lookup](https://www2.dnr.state.mi.us/burnpermits/), [county MapServer](https://gisp.mcgi.state.mi.us/arcgis/rest/services/DNR/Burn_Permits/MapServer/1), [Macomb Township](https://www.macomb-mi.gov/196/Burn-Permits).

### Minnesota

**Difficulty 1/5.** The DNR MapServer CGI delivers county and split-county codes with publisher dates. Todd showed code 2, permits required, dated November 1. Apply the HTML legend, distinguish campfires from other burning and preserve each area date. [DNR CGI JSON](https://maps.dnr.state.mn.us/cgi-bin/mapserv/burning_restrictions?mode=nquery), [DNR legend and map](https://www.dnr.state.mn.us/forestry/fire/firerating_restrictions.html).

### Mississippi

**Difficulty 1/5.** The existing WordPress Ninja Tables input returned 49 rows. Humphreys was listed September 16 through December 30 with exemptions 1–5. Read issued and through dates, parse the exemptions and validate the county against the current list. The category RSS can flag changes. [MFC current list](https://www.mfc.ms.gov/burning-info/burn-bans/), [table JSON](https://www.mfc.ms.gov/wp-admin/admin-ajax.php?action=wp_ajax_ninja_tables_public_action&table_id=1775&target_action=get-all-data).

### Missouri

**Difficulty 3/5.** The November 23 SEMA PDF publishes a county-status map credited to Show Me Fire. It is a dated public report with local confirmation caveats. The Division of Fire Safety directly publishes a separate September XLSX of reports from county, city and district authorities. Extract the workbook rows, use the daily PDF as a change/triage signal and check signed orders before reporting a negative. [SEMA daily brief](https://sema.dps.mo.gov/newspubs/docs/dailybriefs.pdf), [DFS county listing](https://dfs.dps.mo.gov/programs/resources/county-burn-bans.php), [September XLSX](https://dfs.dps.mo.gov/documents/mo-burn-bans-9-16-2026.xlsx).

### Montana

**Difficulty 2/5.** Gallatin County publishes a dated WordPress table with open and closed values by fire district. November 20 showed Bozeman open and Gallatin River Ranch closed. The DNRC dashboard resolves to layers 2 and 3 for statewide land-manager orders. Match exact local district and land ownership, and read the order link when it exists. [Gallatin daily status](https://www.readygallatin.com/residents/open-burning/), [Gallatin permit system](https://gallatinburnpermits.com/), [DNRC restriction layer](https://services2.arcgis.com/DRQySz3VhPgOv7Bo/arcgis/rest/services/Fire_Restrictions_by_Jurisdiction_Update_-_Read_Only_view/FeatureServer/3).

### Nebraska

**Difficulty 4/5.** The Governor's Drupal page documents April 2 rescission of the 2026 permit suspension. Local fire chiefs issue permits under the continuing statewide framework. Omaha and Lincoln–Lancaster publish permit rules and forms. Read executive-order PDFs for events and join local authorities. A current state or city decision stream was unverified. [Governor's rescission](https://governor.nebraska.gov/gov-pillen-issues-new-order-rescinding-burn-ban), [State Fire Marshal](https://sfm.nebraska.gov/fire-departments/burn-permits), [Omaha permits](https://publicworks.omaha.gov/permit/burn-permits/).

### Nevada

**Difficulty 2/5.** Truckee Meadows Fire Protection District expressly reported OPEN for permitted, weather-dependent pile burning on November 23. The Nevada interagency Squarespace index and ArcGIS view publish stages and signed documents by land manager. Northern Nevada Public Health runs a separate wood-device burn code for applicable Washoe ZIPs. [Truckee Meadows daily status](https://tmfpd.us/outdoor-burning/), [interagency restrictions](https://www.nevadafireinfo.org/restrictions), [Washoe burn-code program](https://washoelife.washoecounty.gov/nnph/daily-burn-code-for-wood-burning-devices-is-underway/).

### New Hampshire

**Difficulty 4/5.** Division of Forests and Lands publishes daily danger guidance and a permit portal. The town pages explain local conditions, and Dover's notice archive shows how restrictions and lifts are published. Hanover explains that the danger level can prompt a separate ban decision. Use issuer notices or permit status, with the daily danger level as context. [State fire danger](https://www.nhdfl.dncr.nh.gov/forest-protection/daily-fire-danger), [Concord permits](https://www.concordnh.gov/1110/Burn-Permits), [Hanover rules](https://hanovernh.org/274/Burning-Permit-Information).

### New Jersey

**Difficulty 1/5.** A public NJDEP ArcGIS layer has three forestry divisions and separate recreational and agricultural restriction flags. Division A showed moderate danger and both flags N. Read EditDate and comments, and preserve the permit and division scope. The agency's HTML page was challenged in curl. [NJDEP division FeatureServer](https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/Envr_admin_FFS_danger_public/FeatureServer/2), [Hopewell open-burning PDF](https://www.hopewelltwp.org/DocumentCenter/View/249/Open-Burning-Regulations-PDF).

### New Mexico

**Difficulty 2/5 locally, 4/5 for broader coverage.** Angel Fire's CivicPlus page said its temporary ban was lifted September 21 and permitted burns and campfires resumed. Sandoval and Albuquerque give separate rule and permit guidance. Forestry's Valencia map row had null dates and stage beside prohibition text. Match signed orders before deriving a result statewide. [Angel Fire current status](https://www.angelfirenm.gov/182/Current-Fire-Restrictions), [Sandoval fire and rescue](https://www.sandovalcountynm.gov/fire/open-burning-info/), [Albuquerque burn restrictions](https://www.cabq.gov/airquality/burn-no-burn/burn-restrictions), [state Forestry map](https://www.emnrd.nm.gov/sfd/find-current-fire-restrictions/).

### New York

**Difficulty 4/5.** DEC publishes standing restrictions and the March 16–May 14 brush-burning ban. The Governor issues separate temporary orders. NYC 311 and NYC Parks describe barbecue and open-fire restrictions for the largest city. Parse scoped dates from orders and calendar rules. A current county-level or date-stamped emergency status was unverified. [DEC open burning](https://dec.ny.gov/environmental-protection/air-quality/open-burning), [Governor's order example](https://www.governor.ny.gov/news/due-increased-fire-risk-governor-hochul-implements-temporary-statewide-burn-ban), [NYC 311 rules](https://portal.311.nyc.gov/article/?kanumber=KA-02228), [FDNY Fire Code PDF](https://www.nyc.gov/assets/fdny/downloads/pdf/about/chapter-3-2022.pdf).

### North Carolina

**Difficulty 3/5.** The NC Forest Service Drupal stream has paired state issue and lift notices. Its final May 8 lift cleared the remaining 19 counties in the spring order. Local fire marshals have separate authority within 100 feet of occupied dwellings, as Mecklenburg's notices demonstrate. Extract order dates and county sets. A November statewide status report was unverified. [Statewide lift](https://www.ncagr.gov/news/press-releases/2026/05/07/state-issued-burn-ban-lifted-all-north-carolina-counties-fire-danger-moderates-following-recent), [state permit system](https://apps.ncagr.gov/burnpermits/), [Mecklenburg local lift](https://news.mecknc.gov/mandatory-burn-ban-park-and-recreation-facilities-begins-monday-may-4-cloned).

### North Dakota

**Difficulty 3/5.** DES's ArcGIS export combines county and tribal declarations with a fire index, NWS warning, and activity-specific conditions. Use the declaration, effective/rescinded dates and map rules to derive today's status by activity. Cass County's notice and PDF offer an order-level check. [DES FeatureServer](https://services1.arcgis.com/qQaNyq8h4wNEdlUV/arcgis/rest/services/Fire_Decs_Indexes_Warnings_Template_Publish/FeatureServer/0), [DES guidance](https://www.des.nd.gov/response-section/burn-restrictions-wildland-fires), [Cass County declaration](https://www.casscountynd.gov/home/showpublisheddocument/8960/639111679877030000).

### Ohio

**Difficulty 1/5 for the calendar, 4/5 for emergency orders.** The State Fire Marshal PDF and statute cover the current November daytime window for specified fires in unincorporated areas. Chardon and Cuyahoga Falls publish local guidance, while the State Fire Marshal hosts dated emergency orders separately. Use the statutory time, place and material conditions. [State Fire Marshal PDF](https://dam.assets.ohio.gov/image/upload/com.ohio.gov/documents/fire_ForestryLaws.pdf), [statute](https://codes.ohio.gov/ohio-revised-code/section-1503.18), [Cuyahoga Falls](https://www.cityofcf.com/departments/fire/open-burning).

### Oklahoma

**Difficulty 1/5.** The existing OFS ArcGIS layer returns 77 status rows and a distinct map update date. Atoka showed None. McCurtain's prior resolution illustrates the need to match expiry dates against county attachments before issuing negatives or alerts. [OFS county layer](https://services3.arcgis.com/yrIZ0Nv0mSGTWJsH/arcgis/rest/services/OklahomaBurnBan__Data_Layer__v_9_0__View/FeatureServer/0), [Experience configuration](https://www.arcgis.com/sharing/rest/content/items/8bdc59b2a54a4383a9a2996fb9407580/data?f=json).

### Oregon

**Difficulty 2/5 for Lane County, 4/5 statewide.** LRAPA's WordPress page carries indoor and outdoor programs. Its November 23 outdoor advisory JSON showed Eugene and Florence prohibited and Coastal Lane County and Elsewhere allowed 10 a.m.–4 p.m. under agency rules. ODF's map layer returned ArcGIS 499. Clackamas and Tualatin Valley districts and the Willamette Valley daily bulletin offer additional scoped coverage. [Lane County outdoor advisory](https://www.lrapa-or.gov/air-quality-protection/burning-overview/outdoor-burning/), [Tualatin Valley](https://www.tvfr.com/356/Outdoor-Burning), [Willamette daily bulletin](https://smkmgt.com/burn.php).

### Pennsylvania

**Difficulty 3/5.** DCNR's AEM page embeds a PDF updated in place. The November 1 06:41 map had no countywide bans. Obtain the current document ID from the iframe and parse date, legend and map labels. Require a freshness check and keep state forest, municipal and county tracks separate. Bucks County's CivicPlus release is a local example. [DCNR parent page](https://www.pa.gov/agencies/dcnr/programs-and-services/community-outreach-and-development/wildfire/burn-bans), [PDF](https://elibrary.dcnr.pa.gov/PDFProvider.ashx?action=PDFStream&docID=8921989&docName=County+Burn+Bans&nativeExt=pdf), [Bucks County](https://www.buckscounty.gov/m/newsflash/home/detail/1180).

### Rhode Island

**Difficulty 4/5.** DEM publishes wildfire danger and dated park or campground ban announcements. Narragansett and North Kingstown have CivicPlus pages for local open burning. Use specific DEM orders or town decisions to interpret restrictions. The public hazard page did not establish an active restriction. [DEM wildfire danger](https://dem.ri.gov/ri-wildfire-danger-status), [DEM parks lift example](https://dem.ri.gov/press-releases/dem-announces-it-lifting-burn-ban-went-effect-aug-19-campgrounds-parks-management), [North Kingstown](https://www.northkingstownri.gov/172/Outdoor-Burning).

### South Carolina

**Difficulty 3/5.** SC Forestry Commission's WordPress release index links dated PDFs for the April order, staged lifts and final May 1 lift. It distinguishes statutory bans from voluntary Red Flag alerts. Horry County separately issues county orders. Poll the releases and pair dates and affected places. A current consolidated snapshot was unverified. [SCFC release index](https://www.scfc.gov/news-releases/), [ban and alert definitions](https://www.scfc.gov/protection/fire-burning/fire-resources/bans-alerts/), [Horry County notice](https://www.horrycountysc.gov/news/articles/horry-county-lifting-current-burn-ban-5426/).

### South Dakota

**Difficulty 4/5.** Counties publish county commission notices such as Meade's and Fall River's archive. Rapid City and the Black Hills forest fire protection district describe permits and standing restrictions. Use the county archives and district permit rules, keeping BLM and forest orders as supplemental layers. A current event snapshot was unverified. [Meade County notices](https://www.meadecounty.org/public-notices/2025/11/5/burn-ban), [Rapid City fire](https://www.rcgov.org/departments/fire-department/wildfire-fire-safety/outdoor-burning-info-769.html), [Black Hills permit FAQ](https://burnpermit.sd.gov/Files/FAQs.pdf).

### Tennessee

**Difficulty 4/5.** The county ArcGIS layer returned current-looking flags but last edited data in March 2024. The fiResponse public endpoint returned 161 jurisdiction names and IDs without a reliable status field in the sample. Rutherford posts county issue and lift notices, and Shelby posts open-burning rules that the search index exposed during a curl 403. Keep county orders separate from the state October–May permit requirement. [County FeatureServer](https://services.arcgis.com/lvPBAGXeSupVUvx2/ArcGIS/rest/services/Burn_Ban_WFL1/FeatureServer/0), [fiResponse public JSON](https://tn.firesponse.com/burn-permit/api/burnrestriction/all/public), [Shelby rules](https://www.shelbycountytn.gov/DocumentCenter/View/883/open_burn_rules).

### Texas

**Difficulty 1/5.** Texas A&M Forest Service publishes the existing county adapter's ArcGIS flags and a date-stamped UTF-16 text feed. Match padded county FIPS, preserve the county order authority and cross-check start dates with the county. Travis County keeps a public Fire Marshal page and refers users to orders and text alerts. [Daily statewide text](https://tfsfrp.tamu.edu/WILDFIRES/BURNBAN.txt), [ArcGIS county layer](https://gis.tfs.tamu.edu/arcgis/rest/services/EOC/BurnBan/FeatureServer/0), [Travis County](https://www.traviscountytx.gov/fire-marshal/burn-ban).

### Utah

**Difficulty 3/5.** FFSL's ArcGIS order layer records active and superseded footprints by land manager. Filter Status and dates and follow order or rescission links. Clearances for residential open burning are separately tied to clearing index and local permits. [FFSL order polygons](https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Fire_Restrictions/FeatureServer/0), [Utah DEQ open burning](https://deq.utah.gov/daq/residential-open-burning), [clearing index](https://air.utah.gov/dataarchive/clearingindex/index.htm).

### Vermont

**Difficulty 2/5.** FPR's Drupal wildfire situation page explicitly said no state-issued burning restrictions. Its November 12 stamp applies to statistics, and the restrictions paragraph has no separate date. Parse the scoped heading and use local wardens for permits and temporary town orders. [FPR current situation](https://fpr.vermont.gov/wildfire-situation), [Plainfield permit process](https://www.plainfieldvt.gov/burn-permits.html).

### Virginia

**Difficulty 3/5.** DOF's WordPress pages give the February 15–April 30 state 4 p.m. rule and direct readers to local offices. Loudoun, Fairfax and Prince William publish county-specific rules in separate portals. Parse calendar and location conditions and poll county notices for emergency orders. [DOF restrictions](https://www.dof.virginia.gov/wildland-prescribed-fire/fire-laws/local-burn-bans/), [Loudoun](https://sheriff.loudoun.gov/openburning), [Fairfax](https://www.fairfaxcounty.gov/fire-ems/fire-marshal/recreational-fires), [Prince William](https://www.pwcva.gov/department/fire-marshals-office/burning-regulations/).

### Washington

**Difficulty 2/5.** Puget Sound Clean Air's CivicPlus page embeds a separately fetchable two-column status table. All seven listed rows reported no air-quality burn ban. King County's separate fire-safety block reported no fire-safety ban. The state DNR ArcGIS layer supplies additional statuses on DNR-protected land. Treat these as independent restrictions. [Puget Sound status table](https://secure.pscleanair.org/AirQuality/BurnBan), [King County Fire Marshal](https://kingcounty.gov/en/dept/local-services/governance-leadership/local-government-for-unincorporated-king-county/fire-safety), [DNR layer](https://gis.dnr.wa.gov/site3/rest/services/Public_Wildfire/WADNR_PUBLIC_WD_WildfireDanger/MapServer/1).

### West Virginia

**Difficulty 1/5 for the calendar, 4/5 for emergency orders.** The state West Virginia Division of Forestry WordPress page publishes the October 1–December 31 daytime fall restriction, including 7 a.m.–5 p.m. hours. Berkeley County publishes permanent outdoor-burning guidance and the Governor's Office publishes emergency lifts. Use the legal time window and separate county or statewide emergency actions. [WV Forestry](https://wvforestry.com/fire-laws/), [Berkeley County](https://berkeleywv.org/330/Outdoor-Burning), [Governor's lift example](https://governorjustice.wv.gov/News/press-releases/2024/Pages/Gov.-Justice-announces-statewide-burn-ban-has-been-lifted.aspx).

### Wisconsin

**Difficulty 1/5.** Wisconsin DNR publishes the same daily status in JSON and CSV. Use the DNR scope flag, county/date and explicit permit restrictions. The MapServer corroborates scope, including Kenosha's local-contact referral. Madison publishes its own burn-permit rules. [DNR JSON](https://apps.dnr.wi.gov/forestryapps/burnrestriction/json/), [DNR CSV](https://apps.dnr.wi.gov/forestryapps/burnrestriction/csv/), [Madison fire permit forms](https://www.cityofmadison.com/fire/permits-inspections/licenses-permits/forms).

### Wyoming

**Difficulty 2/5.** State Forestry's Google Sites page links a county ArcGIS layer. Natrona displayed None in that layer. District orders and state-land polygons have their own scope and may tell a different story for the same ZIP. Read each status and authority footprint and follow signed restrictions or lifts. [State Forestry](https://sites.google.com/wyo.gov/forestry-division/fire-management/fire-restrictions), [county FeatureServer](https://services1.arcgis.com/i5xRZLABP6oUOcld/arcgis/rest/services/Updated_fire_restrictions_2021_Read_Only/FeatureServer/0), [state-land FeatureServer](https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WY_State_Lands_Fire_Restrictions_View/FeatureServer/0).

## Stack groups

| Input | What to reuse | Examples |
| --- | --- | --- |
| ArcGIS FeatureServer and MapServer | Fetch layer metadata and coded domains, then query attributes and geometry independently. Handle HTTP 200 with JSON errors, `dataLastEditDate` and per-row dates. Join against the publisher's exact geographic coverage. | [NJDEP division flags](https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/Envr_admin_FFS_danger_public/FeatureServer/2), [Indiana WebEOC export](https://services8.arcgis.com/mRWfR9ONMmLivkAh/arcgis/rest/services/WebEOC_prod_BurnBans/FeatureServer/0) |
| ArcGIS Dashboard, Experience and web maps | Read `/sharing/rest/content/items/<id>/data?f=json`, recurse through widget/map item IDs and inspect `operationalLayers`. In the Southwest app, an embedded Experience item is the intermediate step. Distinguish status, geography and legend layers. | [Southwest dashboard configuration](https://www.arcgis.com/sharing/rest/content/items/aa9ff369dd414b74b69b696b40a1d057/data?f=json), [Florida configuration](https://www.arcgis.com/sharing/rest/content/items/1f6572c92f8d41ec860f461ea433819b/data?f=json), [Montana configuration](https://www.arcgis.com/sharing/rest/content/items/86668bab4c2248f09c1b70b546bff420/data?f=json) |
| CivicPlus/CivicEngage, Granicus and municipal portals | Read current status blocks or embedded tables. Poll AlertCenter and CivicAlerts/News Flash where available and key dated issue and rescission notices. Read govDelivery publication time and effective time separately. | [Angel Fire CivicPlus page](https://www.angelfirenm.gov/182/Current-Fire-Restrictions), [Boulder govDelivery bulletin](https://content.govdelivery.com/accounts/COBOULDER/bulletins/42f51aa), [Puget Sound iframe table](https://secure.pscleanair.org/AirQuality/BurnBan) |
| WordPress, Drupal, Sitecore, Liferay and SharePoint HTML | Reuse heading, label and row extraction. Use WordPress REST `/wp-json/wp/v2/posts?search=burn` only if that content type actually contains status. Custom news types, static banners and Ninja Tables need their own extraction. | [Faulkner homepage](https://www.faulknercountyar.gov/), [Faulkner WP search](https://www.faulknercountyar.gov/wp-json/wp/v2/search?search=burn%20ban&per_page=25), [CAL FIRE table](https://burnpermit.fire.ca.gov/current-burn-status/), [Kentucky SharePoint list](https://eec.ky.gov/Natural-Resources/Forestry/wildland-fire-management/pages/county-burn-bans.aspx) |
| ASP.NET WebForms and other HTML tables | Inspect `__VIEWSTATE`, named links and selectors. Prefer direct GET county pages or a public layer where available. Normalize headings, dates and split jurisdictions in the table. | [Michigan township permits](https://www2.dnr.state.mi.us/burnpermits/), [CARB basin tables](https://ssl.arb.ca.gov/pfirs/cb3/cb3.php), [Gallatin district table](https://www.readygallatin.com/residents/open-burning/) |
| JSON, CSV and RSS | Validate source time, scopes, categorical values and headers. RSS can signal change. Issuer notices carry scope and legal dates. Preserve text encoding and do not convert an empty or outdated feed to a negative. | [Wisconsin CSV](https://apps.dnr.wi.gov/forestryapps/burnrestriction/csv/), [Minnesota CGI](https://maps.dnr.state.mn.us/cgi-bin/mapserv/burning_restrictions?mode=nquery), [Texas RSS](https://tfsfrp.tamu.edu/WILDFIRES/BURNBAN.XML) |
| PDFs, signed orders and XLSX | Follow the current document link. Use text extraction for digital PDFs, PDF coordinates for map/legend alignment, and manual or OCR review for scanned orders. For XLSX read columns and preserve original date cells. | [Pennsylvania county PDF](https://elibrary.dcnr.pa.gov/PDFProvider.ashx?action=PDFStream&docID=8921989&docName=County+Burn+Bans&nativeExt=pdf), [Missouri workbook](https://dfs.dps.mo.gov/documents/mo-burn-bans-9-16-2026.xlsx), [Faulkner court order](https://www.faulknercountyar.gov/wp-content/uploads/2026/11/Faulkner-County-Court-Order-26-204.pdf) |
| Hazard and forecast feeds | Display the hazard or forecast as a labeled signal. Translate it to a restriction only where a published order or rule defines that trigger, as with parts of North Dakota and town permit conditions in Maine. | [NWS Red Flag feed](https://api.weather.gov/alerts/active?event=Red%20Flag%20Warning), [Maine class-day JSON](https://mainefireweather.org/admin/php/get-content.php?content=class-days&which=today) |

**Federal and tribal supplements.** BLM publishes restrictions by field office. National Park Service data has unit-level flags and some null fields. EPA Region 10 publishes EPA-issued bans and pointers for independently managed tribal lands. USFS and regional interagency layer orders are scoped to named managers. Apply each federal or tribal overlay within its issuing jurisdiction and activity scope. [BLM fire restrictions](https://www.blm.gov/programs/fire/fire-restrictions), [NPS unit layer](https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/NPS_Unit_Fire_Restrictions_%28Public_VIew%29/FeatureServer/0), [EPA Region 10](https://www.epa.gov/farr/burn-bans-reservations-id-or-and-wa), [Rocky Mountain web map](https://www.arcgis.com/sharing/rest/content/items/f0a56c48c00a4adfa7ceadba4fbdebe9/data?f=json).

## Recommended fetcher build order

1. **Start with California, Michigan, New Jersey, Wisconsin and Minnesota.** California and Michigan have broad public status inputs and large populations. California is a server-rendered table, Michigan has direct township HTML and GIS, and NJ, WI and MN are relatively simple JSON or ArcGIS. Add Ohio's calendar rule alongside this work to give a large state a scoped answer now.
2. **Add high-population local and regional status.** Gwinnett, Pima, King County/Puget Sound, Douglas County and Lane County each have an explicit current field or page block. Reuse HTML/date extraction and add other verified counties as soon as the geographic boundary is clear. Kentucky's state HTML can ship as a reported-positive feed in this wave. Pennsylvania's PDF needs a freshness gate.
3. **Add jurisdiction geometry and permit decisions.** Use the ArcGIS adapter across Idaho, Alaska, Utah, Montana, Wyoming and Washington DNR. Give North Dakota a dedicated rule resolver for index-triggered declarations. Add Nevada's district pile-burning page before tackling all of its interagency orders.
4. **Monitor event publishers next.** Pair Arkansas county orders, South Carolina advisories, North Carolina orders and lifts, Missouri reports, and local alerts by issuer and effective dates. Tennessee's dated county data and Arkansas's failing statewide route need an upstream replacement before a statewide negative can ship.
5. **Keep the initial alerts evidence-based.** Store activity, authority, applicable boundary, source time, time checked, effective and rescinded dates, and the signed order link. A stale result, a missing row, or a conflicting order remains unconfirmed. Follow official terms before distributing bulk source data.

## Method and receipt

The inventory has **445 URLs** including prior sources and federal supplements. **327** of the 348 new URLs belong to the 44 priority jurisdictions. **23 of the 44** have operational status evidence in the inventory. Each URL was attempted with curl. Search-confirmed pages preserve the access failure and are excluded from curl-success counts. Publisher status, update or effective dates are recorded as available. Forecast rows give their labeled valid date. A null date means a date was unavailable or unverified. An operational source can still publish an old or undated value.

The comparison set was extracted before discovery from the previous team notes, rebuild memo and state directory, yielding 317 distinct raw URL strings. Deduplication used the requested and final URLs, folded common URL variants, and collapsed duplicate PDF copies and Pennsylvania viewer-query variants. Per-host curl starts were at least 1.1 seconds apart, including redirects. County and district fallback coverage is a sample of publicly visible authorities and is incomplete within each state. The source data preserve reported scope and access limitations for Kentucky, Arkansas, Oregon and the remaining older or undated feeds.

[Source inventory](sources.json) contains each URL, scope, observed stack, fetch outcome, sample, date when visible, and extraction note. Run `bbcov-261123-4f71`. Skill SHA-256 `be17dc0f4ed5b18a0ccefa91e31eee76b866b496e2ffe4740aeac0a22ffa3eb9`. Question category public data coverage and adapter discovery. Workspace state `v2-cloudflare`. The run used search and rate-limited curl with certificate verification. Files were saved locally.
