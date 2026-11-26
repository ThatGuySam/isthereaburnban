# Utah county publisher captures

All requests were public GETs made with curl on November 26, 2026 between 11:08 and 11:34 UTC. HTML files retain the pertinent publisher sections. The permit configuration keeps the seven reviewed entries and fields needed for the decision, with contact fields omitted. PDFs are the downloaded files.

| Fixture | Request |
| --- | --- |
| `forecast.html` | [DAQ media forecast](https://air.utah.gov/mediaforecast.php) |
| `permit-form.html` | [DAQ open burn form](https://air.utah.gov/OpenBurning/form/index.php?e=application) |
| `permit-config.js` | [DAQ county and municipal directory](https://air.utah.gov/OpenBurning/form/js/county.php) |
| `washington.html` | [Washington County Interagency Burn Permit Management](https://washingtonutah.gov/burn/permits.php) |
| `weber.html` | [Weber Fire District burning regulations](https://www.weberfiredistrict.com/burning-info) |
| `manila.html` | [Manila current town restrictions](https://manilautah.gov/current-town-restrictions) |
| `box-ordinance.pdf` | [Box Elder County Ordinance 385](https://www.boxeldercountyut.gov/DocumentCenter/View/1299/County-Ordinance-385) |
| `cache.html` | [Cache County Fire District open burns](https://www.cachecounty.gov/fire/getburnpermit.html) |
| `layton.html` | [Layton City Fire FAQ](https://www.laytoncityutah.gov/LC/City/FAQ#FAQ_A6) |
| `grand.html` | [Grand County open burning](https://www.grandcountyutah.net/1271/20655/Open-Burning) |
| `iron.html` | [Iron County burn permit information](https://ironcountyut.gov/fire/burn-permit) |
| `eureka.pdf` | [Juab Special Service Fire District permit sheet](https://www.eureka.utah.gov/documents/52/Burn_Permit_032118.pdf) |
| `kanab.html` | [Kanab City burn permit](https://kanab.utah.gov/2197/Burn-Permit) |
| `morgan-other.html` | [Morgan County wildland fire safety and permits](https://www.morgancountyutah.gov/additional-wildland-burn-permit) |
| `ufaperm.html` | [Unified Fire Authority open burning](https://unifiedfireut.gov/prevention/open-burning/) |
| `slc.html` | [Salt Lake City Fire recreational fires and barbecues](https://fire.slc.gov/recreational-fires/) |
| `fayette.pdf` | [Fayette Open and Close Burn Ordinance](https://fayetteutah.gov/documents/1443/Burn_Ordinance_Fayette.docx.pdf) |
| `tooele.html` | [North Tooele Fire District residential permits](https://www.ntfdutah.gov/residential-open-burn-season-permits) |
| `ucounty-intent.html` | [Utah County Fire Marshal burn notice](https://www.utahcounty.gov/Dept/FireMarshal/Burn_q.asp) |
| `wayne.html` | [Wayne County emergency services](https://waynecountyutah.gov/pages/emergency-services) |

The DAQ forecast reports each county's air-quality rating and action classification on consecutive rows. The forecast was updated November 25 at 3:36 p.m. Mountain and includes November 26. DAQ's rule applies to designated heating devices and areas on mandatory days. Salt Lake County's regulation also treats voluntary winter action days as residential solid-fuel no-burn days. [Forecast legend](https://air.utah.gov/forecastLegend.html) · [R307-302](https://adminrules.utah.gov/Rule/601) · [Salt Lake County Health Regulation 35](https://www.saltlakecounty.gov/globalassets/1-site-files/health/regulations/regulation-pdfs/woodburning.pdf)

For the permit form, the publisher's scripts show how each jurisdiction selects its seasonal threshold and how the inline clearing index produces the day's “Cannot Burn” signal. The adapter uses the date in the form, the directory's exact menu and county names, and the current daytime value for each reviewed airshed. It reports a restriction only inside an enrolled residential permit window when the index is below threshold. The directory's closed-season handoffs and permit availability supply no general burning decision. [Permit form routing](https://air.utah.gov/OpenBurning/form/js/index.js) · [Permit window and threshold logic](https://air.utah.gov/OpenBurning/form/js/formEnabled.js)

The two Washington pages distinguish the interagency city portal from the DAQ pathway for unincorporated properties. Weber's district keeps residential permit closures and wildfire orders on separate pages. Manila's dedicated town page still conditions home fire pits on running water after lifting its Stage 2 fire restriction. Wayne County's signed minutes document the commission's September 8 rescission of its May 2026 fire ban. The Wayne fixture supports only the recurring residential permit rule. [Washington County permit instructions](https://www.washco.utah.gov/departments/emergency-management/burn-permit-application/) · [Weber wildfire restrictions](https://www.weberfiredistrict.com/restrictions) · [Manila Stage 2 lift](https://manilautah.gov/documents/787/Stage_2_Fire_Restrictions_Lifted.pdf) · [Wayne County signed minutes](https://www.utah.gov/pmn/files/1492143.pdf)
