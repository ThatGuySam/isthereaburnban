# Virginia source captures, November 24, 2026

- `section-10.1-1142-2026-11-24.html` was captured at 12:59:56 UTC. The fixture keeps the statute article. The seasonal adapter verifies the text of subsections B and C before applying the Eastern calendar. [Exact statute request](https://law.lis.virginia.gov/vacode/title10.1/chapter11/section10.1-1142/)
- `rapidan-wma-2026-11-24.html` was captured at 13:00:28 UTC. The fixture keeps the property heading, current notice table and overview. The order began November 21 at 8 a.m. Eastern and gives no end date. The overview identifies Madison and Greene counties. The WordPress REST alert record has publication metadata, and its collection retains historical notices. The property's current HTML table carries the order text. [Exact property request](https://dwr.virginia.gov/wma/rapidan/) · [DWR alerts](https://dwr.virginia.gov/alerts/) · [REST record](https://dwr.virginia.gov/wp-json/wp/v2/alerts/98633)
- `shen-park-alerts-2026-11-24.json` was captured at 13:00:58 UTC. The National Park Service conditions page loads the CommonSpot park-alert JSON. The alert text starts the restriction November 21 at 8 a.m. Eastern. The JSON's display start is November 20 and its display end is November 24 at 11:59 p.m. Eastern. The parser uses the stated effective time and bounds its report by that display end. The `www` JSON initially returned an October 28 file with an HTTP `Age` over 16 days and omitted the fire restriction. The `home` hostname returned the current November 20 file without a key. Park statistics give eight intersecting counties. [Exact JSON request](https://home.nps.gov/shen/park-alerts-shen.json) · [Park alerts](https://www.nps.gov/shen/planyourvisit/conditions.htm) · [County footprint](https://www.nps.gov/shen/learn/management/statistics.htm)

## Candidate inventory checks

- Virginia Forestry's **Fire Laws** and **Before You Burn** pages returned the standing spring rule. **Burning Restrictions** explained that local governments, fire departments and emergency managers have current local orders. The HTML loaded on one pass, and follow-up direct checks returned 403 or 503. REST pages, posts, search and RSS returned 403. The older ArcGIS layer returned a 499 token requirement in its JSON. The daily fire-danger page describes hazard. [Fire laws](https://www.dof.virginia.gov/wildland-prescribed-fire/fire-laws/) · [Before You Burn](https://www.dof.virginia.gov/wildland-prescribed-fire/wildfire-prevention/before-you-burn/) · [Burning restrictions](https://www.dof.virginia.gov/wildland-prescribed-fire/fire-laws/local-burn-bans/) · [Historical ArcGIS layer](https://services1.arcgis.com/zdPnl7ASQIo6PX54/arcgis/rest/services/BurnBan2019/FeatureServer/0)
- The DEQ ordinances PDF and Bedford's Granicus page returned Akamai access blocks. The indexed PDF lists ordinance adoption dates. Bedford's indexed page gives standing burning rules and a local contact. Virginia's legislative site serves the actual air-quality regulation. [DEQ ordinances PDF](https://www.deq.virginia.gov/home/showpublisheddocument/12356/638372804129930000) · [Bedford rules](https://firerescue.bedfordcountyva.gov/divisions/fire-marshal/burning-laws-restrictions-in-bedford-county) · [Open-burning regulation](https://law.lis.virginia.gov/admincodeexpand/title9/agency5/chapter130/)
- Loudoun's CivicPlus regulations page and both notices loaded. The May 1 notice's summer closure ended September 30. The fall notice covers October 1 through February 14, allows certain on-site debris with notice to dispatch where allowed, and lists places with a year-round prohibition. Ask the local fire marshal about current hazard orders or an exact address. [Rules](https://sheriff.loudoun.gov/openburning) · [Summer notice](https://www.loudoun.gov/m/newsflash/home/detail/10590) · [Fall and winter notice](https://www.sheriff.loudoun.gov/m/NewsFlash/Home/Detail/10903)
- Fairfax's two Drupal pages describe approvals for bonfires and controlled burning, plus seasonal and AQI limits on controlled burns. Prince William's burning regulations describe permits, exemptions, seasonal air-quality limits and hazardous conditions. All three pages loaded with standing guidance. [Fairfax controlled burning](https://www.fairfaxcounty.gov/fire-ems/fire-marshal/controlled-burning-guideline) · [Fairfax recreational fires](https://www.fairfaxcounty.gov/fire-ems/fire-marshal/recreational-fires) · [Prince William burning regulations](https://www.pwcva.gov/department/fire-marshals-office/burning-regulations/)

## County pass captures

HTML fixtures retain the actual notice panel, carousel or reviewed rule region. PDF fixtures retain the official response bytes. Times below are the HTTP Date stamps from the captures, in UTC.

| Fixture | HTTP Date | Request |
| --- | --- | --- |
| `brunswick-public-notices-2026-11-24.html` | 21:29:06 | [CivicLive public notices](https://www.brunswickco.com/cms/One.aspx?pageId=10858888&portalId=10858880) |
| `nottoway-news-2026-11-24.html` | 21:43:19 | [Revize homepage](https://nottoway.org/) |
| `rule-appomattox-town-2026-11-24.pdf` | 21:49:22 | [Official request](https://www.townofappomattox.com/media/181) |
| `rule-arlington-2026-11-24.html` | 21:34:41 | [Official request](https://www.arlingtonva.us/Government/Departments/Fire/Office-of-the-Fire-Marshal/Inspections-Permits/Open-burning-Warming-Fires-and-Grilling) |
| `rule-blacksburg-2026-11-24.html` | 21:32:01 | [Official request](https://blacksburgfire.org/information) |
| `rule-buenavista-2026-11-24.html` | 21:31:33 | [Official request](https://buenavistava.gov/residents/public-safety/fire-rescue/) |
| `rule-campbell-2026-11-24.html` | 21:34:39 | [Official request](https://www.co.campbell.va.us/517/Burn-Regulations) |
| `rule-caroline-2026-11-24.pdf` | 21:35:33 | [Official request](https://www.carolinefirerescue.org/images/documents/Forms/Permits/Caroline%20Burn%20Permit%20Application%20-%20Feb%2023-15.pdf) |
| `rule-charlottesville-2026-11-24.html` | 21:51:34 | [Official request](https://www.charlottesville.gov/237/Learn-More) |
| `rule-chesapeake-2026-11-24.html` | 21:29:22 | [Official request](https://www.cityofchesapeake.net/324/Open-Air-Burn-Policy) |
| `rule-chesterfield-2026-11-24.html` | 21:29:19 | [Official request](https://www.chesterfield.gov/533/Subscriptions-Regulations-and-Permits) |
| `rule-colonial-heights-2026-11-24.html` | 21:52:47 | [Official request](https://www.colonialheightsva.gov/FAQ.aspx?QID=182) |
| `rule-culpeper-town-2026-11-24.pdf` | 21:46:31 | [Official request](https://files.culpeperva.gov/Document_Center/Government/Documents_Center/Commercial_Burning_Permit.pdf) |
| `rule-danville-2026-11-24.html` | 21:34:52 | [Official request](https://www.danvilleva.gov/1137/Burning-Regulations) |
| `rule-emporia-2026-11-24.html` | 21:34:54 | [Official request](https://www.ci.emporia.va.us/240/Open-Burning) |
| `rule-fairfax-2026-11-24.html` | 21:29:10 | [Official request](https://www.fairfaxcounty.gov/fire-ems/fire-marshal/recreational-fires) |
| `rule-falls-church-2026-11-24.pdf` | 21:46:32 | [Official request](https://www.fallschurchva.gov/DocumentCenter/View/284/Fire-Prevention-Code-Permit-FPCP-and-Filing-Fee-Requirements) |
| `rule-franklin-city-2026-11-24.html` | 21:34:56 | [Official request](https://ecode360.com/28934423) |
| `rule-franklin-county-2026-11-24.html` | 21:31:44 | [Official request](https://www.franklincountyva.gov/367/Fire-Marshal) |
| `rule-frederick-2026-11-24.html` | 21:46:23 | [Official request](https://ecode360.com/8705168) |
| `rule-fredericksburg-2026-11-24.pdf` | 21:46:34 | [Official request](https://va-fredericksburg.civicplus.com/DocumentCenter/View/10554/Fire-Pit-Regulations-Website?bidId=) |
| `rule-galax-2026-11-24.html` | 21:31:47 | [Official request](https://ecode360.com/6549255) |
| `rule-goochland-2026-11-24.pdf` | 21:35:43 | [Official request](https://www.goochlandva.us/DocumentCenter/View/349/Goochland-County-Burning-Regulations) |
| `rule-hampton-2026-11-24.pdf` | 22:03:04 | [Adopted ordinance](https://hampton.legistar.com/View.ashx?GUID=CB8B5BBA-EFCA-43BC-96FA-C4399FCC3740&ID=13223138&M=F) |
| `rule-hanover-2026-11-24.html` | 21:31:19 | [Official request](https://www.hanovercounty.gov/1081/Open-Burning---Residential) |
| `rule-hanover-fall-2026-11-24.html` | 21:31:19 | [Official request](https://www.hanovercounty.gov/1081/Open-Burning---Residential) |
| `rule-harrisonburg-2026-11-24.html` | 21:49:24 | [Official request](https://harrisonburgva.gov/fire-safety) |
| `rule-henrico-2026-11-24.html` | 21:29:17 | [Official request](https://henrico.gov/leaves/) |
| `rule-isle-of-wight-2026-11-24.html` | 21:49:34 | [Official request](https://www.isleofwight.gov/departments/emergency_services/open_burning_information/burn_permits.php) |
| `rule-james-city-2026-11-24.html` | 22:02:29 | [Official request](https://www.jccalert.org/2710/Permits) |
| `rule-king-george-2026-11-24.html` | 21:31:52 | [Official request](https://www.king-george.va.us/1175/Open-Burn-Regulations) |
| `rule-lexington-2026-11-24.html` | 21:35:02 | [Official request](https://ecode360.com/9734186) |
| `rule-loudoun-2026-11-24.html` | 21:29:12 | [Official request](https://www.loudoun.gov/openburning) |
| `rule-lynchburg-2026-11-24.html` | 21:31:57 | [Official request](https://www.lynchburgva.gov/344/Burning-Leaves) |
| `rule-martinsville-2026-11-24.html` | 21:31:58 | [Official request](https://www.martinsville-va.gov/434/City-Burn-Ordinance) |
| `rule-new-kent-2026-11-24.html` | 21:32:05 | [Official request](https://www.newkent-va.us/293/Open-Burning) |
| `rule-newport-news-2026-11-24.html` | 21:34:43 | [Official request](https://www.nnva.gov/2564/Open-Burning-Regulations) |
| `rule-poquoson-2026-11-24.pdf` | 21:35:34 | [Official request](https://www.poquoson-va.gov/DocumentCenter/View/123/Poquoson-Fire-Rescue-Open-Burning-Regulations-PDF) |
| `rule-powhatan-2026-11-24.pdf` | 21:35:42 | [Official request](https://www.powhatanva.gov/DocumentCenter/View/257/Open-Burn-Regulations-) |
| `rule-prince-william-2026-11-24.html` | 21:29:13 | [Official request](https://www.pwcva.gov/department/fire-marshals-office/burning-regulations/) |
| `rule-richmond-2026-11-24.html` | 21:31:18 | [Official request](https://rva.gov/index.php/fire-emergency-services/prevention) |
| `rule-roanoke-city-2026-11-24.pdf` | 22:06:42 | [Open-burning permit](https://www.roanokeva.gov/DocumentCenter/View/17223/FOBB---Open-Burning-and-Bonfire) |
| `rule-roanoke-county-2026-11-24.html` | 21:32:08 | [Official request](https://www.roanokecountyva.gov/530/Open-Burning) |
| `rule-rockingham-2026-11-24.html` | 21:32:09 | [Official request](https://www.rockinghamcountyva.gov/251/Burn-Permit-Requirements) |
| `rule-salem-2026-11-24.html` | 21:46:22 | [Official request](https://www.salemva.gov/239/Open-Burning) |
| `rule-shenandoah-2026-11-24.html` | 21:32:12 | [Official request](https://www.shenandoahcountyva.gov/506/Burning-Regulations-in-Shenandoah-County) |
| `rule-stafford-2026-11-24.pdf` | 21:35:28 | [Official request](https://cdn.staffordcountyva.gov/2021%20Burn%20Law%20Guidelines%20and%20Specifications.pdf) |
| `rule-staunton-2026-11-24.html` | 21:32:15 | [Official request](https://ecode360.com/49101579) |
| `rule-suffolk-2026-11-24.html` | 21:31:27 | [Official request](https://www.suffolkva.us/701/Open-Burning-Recreational-Fires) |
| `rule-virginia-beach-2026-11-24.pdf` | 21:37:52 | [Official request](https://s3.us-east-1.amazonaws.com/virginia-beach-departments-docs/fire/Applications-and-Documents/Open-Burning-FAQs.pdf) |
| `rule-waynesboro-2026-11-24.pdf` | 21:35:36 | [Official request](https://www.waynesboro.va.us/DocumentCenter/View/6766/Burn-Policy?bidId=) |
| `rule-william-and-mary-2026-11-24.html` | 21:49:25 | [Official request](https://www.wm.edu/offices/ehs/firesafety/) |
| `rule-winchester-2026-11-24.pdf` | 21:35:38 | [Official request](https://www.winchesterva.gov/files/assets/public/v/2/fire/documents/fire-marshal/ccg-001-controlled-open-burning-application-and-guideline.pdf) |
| `rule-wintergreen-2026-11-24.html` | 21:34:32 | [Official request](https://www.wtgfireresq.org/recreational-fires) |
| `rule-york-2026-11-24.html` | 21:35:11 | [Official request](https://www.yorkcounty.gov/402/Open-Burning-Regulations) |
