# Arkansas captures

| Fixture | Exact request URL | Capture time (UTC) |
| --- | --- | --- |
| `faulkner-banner-2026-11-24.html` | [Faulkner County homepage](https://www.faulknercountyar.gov/) | 2026-11-24 10:31:53 |
| `faulkner-order-26-204-2026-11-24.pdf` | [County Court Order 26-204](https://www.faulknercountyar.gov/wp-content/uploads/2026/11/Faulkner-County-Court-Order-26-204.pdf) | 2026-11-24 10:31:54 |
| [Shared rescission fixture](../../lib/fixtures/faulkner-rescind.pdf) | [County Court Order 26-202](https://www.faulknercountyar.gov/wp-content/uploads/2026/11/Burn-Ban-Rescind-26-202.pdf) | Recaptured 2026-11-24 10:31:55 with the same SHA-256 |

Each request was a public GET with normal TLS validation. The homepage fixture preserves the current Elementor widget markup and omits the rest of the site header, body, and scripts. The PDFs are unmodified county scans. The homepage supplies the November 18 effective time of 9 a.m. Central. Section I of Order 26-204 limits the ban to unincorporated Faulkner County. Section III describes written permits in special circumstances. The November 3 rescission names Order 26-170.

The fetcher checks the banner and the SHA-256 digest of its linked PDF. The WordPress page and search APIs omit the sitewide widget. Review the boundaries, effective time, exceptions and rescinded order number whenever the county publishes a new link or replaces a scan. The site's display window is capped at 30 days from the effective time. The signed order itself runs until lifted.

## November 24 county pass

These public GETs were captured late November 24 Central time. The table uses UTC. HTML fixtures keep the source sections and omit unrelated widgets and scripts. JSON fixtures keep the fields used in parsing. The Little River PDF is byte-for-byte identical to the signed scan.

| Fixture prefix | Exact request URL | Capture (UTC, 2026-11-25) |
| --- | --- | --- |
| `baxter-status` | [County on/off flag](https://baxtercountyar.gov/) | 05:15:58 |
| `conway-permits` | [Conway PermitWeb login](https://bp.conwayarkansas.gov/logon.html) | 05:26:53 |
| `garland-active-alerts` | [Garland Alert Center](https://www.garlandcounty.org/AlertCenter.aspx) | 05:16:02 |
| `garland-order` | [Garland executive order](https://www.garlandcounty.org/AlertCenter.aspx?AID=GARLAND-COUNTY-BURN-BAN-IN-EFFECT-227) | 05:25:00 |
| `hot-springs-alerts` | [Hot Springs Alert Center](https://www.hotspringsar.gov/AlertCenter.aspx) | 05:27:33 |
| `hot-springs-order` | [Hot Springs fire notice](https://www.hotspringsar.gov/AlertCenter.aspx?AID=Burn-Ban-in-Effect-for-the-City-of-Hot-S-45) | 05:27:35 |
| `little-river-status` | [Little River judge homepage](https://lrcounty.org/) | 05:16:23 |
| `little-river-order` | [Court Order CO-2026-60R](https://lrcounty.org/wp-content/uploads/2026/11/20261116-Court-Order-CO-2026-60R-Little-River-County-Burn-Ban.pdf) | 05:19:34 |
| `lonoke-burn` | [County-published burn status JSON](https://www.lonokear.gov/data/burnban.json) | 05:14:55 |
| `miller-status` | [Miller homepage REST response](https://millercountyar.gov/wp-json/wp/v2/pages/820?_fields=id%2Cstatus%2Clink%2Cmodified_gmt%2Ccontent) | 05:24:59 |
| `nashville-alerts` | [Nashville Thrillshare live feed](https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o/31323/cms/live_feeds?section_ids=526976) | 05:20:34 |
| `pulaski-status` | [Pulaski Emergency Management](https://www.pulaskicounty.net/emergency-management) | 05:14:36 |
| `salem-status` | [Salem Fire homepage](https://www.salem-fire.org/) | 05:16:29 |
| `union-status` | [Union County notice](https://www.unioncountyar.gov/) | 05:18:47 |
| `van-buren-status` | [Van Buren Squarespace announcement](https://www.vanburencountyar.gov/?format=json) | 05:38:49 |
| `fayetteville-permit` | [Fayetteville residential permit](https://www.fayetteville-ar.gov/4050/Burn-Permits-and-Alternatives) | 05:18:39 |
| `harrison-permit` | [Harrison ordinance 1538 and permit guidance](https://www.harrisonar.gov/page/burning-permits) | 05:18:37 |
| `paragould-rule` | [Paragould open-burning requirements](https://www.paragouldcityar.gov/183/OPEN-BURNING-REQUIREMENTS) | 05:18:40 |
| `pine-bluff-permit` | [Pine Bluff Fire burn permits](https://www.pineblufffire.com/burn-permits) | 05:30:37 |
| `rogers-permit` | [Rogers burn permit](https://ar-rogers.civicplus.com/542/Burn-Permit) | 05:26:40 |
| `russellville-permit` | [Russellville open burn registration](https://www.russellvillefire.org/FormCenter/Fire-Department-3/Open-Burn-Permit-43) | 05:26:44 |
| `van-buren-city-permit` | [Van Buren Fire Department](https://cityofvanburenar.gov/153/Fire-Department) | 05:18:36 |

The Pulaski fixture's HTTP `Last-Modified` was November 25 at 00:03:48 UTC. The scoped interpretation follows the county's unincorporated-area order practice. The Lonoke report preserves the county's November 24 7:31 a.m. Central Forestry timestamp. The Little River order applies across the county and stays subject to weather and any later order. If the Little River homepage advertises a new effective date, review the new signed scan before updating the proof. The Garland and Hot Springs alerts must still appear in the live indexes and keep their applicable geography. The Apptegy Harrison fixture keeps the one published ordinance node from the larger page state. Each recurring rule checkpoints a fingerprint of its published instructions.
