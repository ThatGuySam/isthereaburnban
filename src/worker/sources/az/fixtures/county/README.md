# Arizona county publisher fixtures

The public GETs ran on November 26, 2026 UTC. HTML fixtures retain the publisher headings, scope, terms and status fields. Unrelated navigation, images or scripts are omitted as needed. The PDF fixtures are complete blank public permit forms. The Eagar JSON fixture keeps the published rule section. Form controls and session fields are omitted.

| Fixture | Capture time (UTC) | Request |
| --- | --- | --- |
| `maricopa-air-quality.html` | 12:32:08 | [AQD Outreach wide widget](https://aqdoutreach.com/widgets/wide/en), embedded by [Maricopa County](https://www.maricopa.gov/1244/Air-Quality). Last updated November 25 at 9:29 a.m. MST. |
| `maricopa-open-burn-permits.html` | 12:34:49 | [County permit activity list](https://www.maricopa.gov/1818/Permits-Forms-and-Payments) |
| `maricopa-regional-parks-season.html` | 12:31:57 | [Parks & Recreation updates](https://www.maricopacountyparks.net/park-updates/) |
| `pima-open-burn-permits.html` | 12:31:57 | [Pima County pre-application guidance](https://www.pima.gov/open-burning) |
| `superstition-open-burn-permits.html` | 12:31:57 | [Superstition Fire & Medical District permit rules](https://sfmd.az.gov/fire-prevention/burn-permits/) |
| `yavapai-fire-zones.html` | 12:31:50 | [County outdoor fire ordinance and zone status](https://www.yavapaiready.gov/Community-Resources/Outdoor-Fire-Ordinance) |
| `central-arizona-pile-permits.html` | 12:34:01 | [CAFMA outdoor burn permits](https://www.cazfire.gov/341/Burn-Permits) |
| `flagstaff-outdoor-fire-permits.html` | 12:32:35 | [Flagstaff current stage and standing WUI rules](https://flagstaff.az.gov/2981/Fire-Restriction-Stages) |
| `navajo-nation-orders.html` | 12:32:35 | [Navajo Nation executive order index](https://opvp.navajo-nsn.gov/executive-orders/). Signed [EO 02-2026](https://opvp.navajo-nsn.gov/wp-content/uploads/2026/07/executive-order-no-02-2026.pdf) and [EO 05-2026](https://opvp.navajo-nsn.gov/wp-content/uploads/2026/08/executive-order-no-05-2026.pdf) confirm the July status. The [Coconino County budget book](https://www.coconino.az.gov/DocumentCenter/View/69761/FY26-Budget-Book?bidId=) verifies the Arizona county crosswalk. |
| `navajo-dispatch-notification.html` | 12:37:24 | [County open burn permit and agreement](https://extend.navajocountyaz.gov/EmergencyManagement/BurnPermit) |
| `eagar-open-burn-permits.json` | 12:52:41 | [Public form elements](https://forms.services.thrillshare.com/api/v1/forms/burn-permit/elements?secondary_organization_id=24192) from the [town burn permit](https://www.eagaraz.gov/forms/8925/). The [public form list](https://forms.services.thrillshare.com/api/v1/forms?sort=name&scope=visible_on_school_website&secondary_organization_id=24192) supplied the related elements URL. |
| `mohave-order-index.html` | 12:49:10 | [County fire notice search](https://www.mohave.gov/news-notices/?search_field=fire) |
| `mohave-order-issued.html` | 12:50:58 | [May Board of Supervisors order notice](https://www.mohave.gov/news-notices/posts/fire-restrictions-implemented-county-wide-in-response-to-increased-wildfire-risk-may-2026/) |
| `mohave-order-partial-lift.html` | 12:50:59 | [September partial lift](https://www.mohave.gov/news-notices/posts/county-outdoor-fire-and-fireworks-prohibition-partially-lifted/) |
| `mohave-order-lifted.html` | 12:31:50 | [October final lift](https://www.mohave.gov/news-notices/posts/county-outdoor-fire-and-fireworks-prohibition-lifted-10626/) |
| `desert-hills-burn-validation.pdf` | 12:32:35 | [Desert Hills blank permit](https://deserthillsfire.com/Site_DHFD/Contact_us__files/Burn%20Permit.pdf) |
| `pine-strawberry-open-burn-permits.html` | 12:39:53 | [Pine-Strawberry required permits](https://psfdaz.com/burn-permits) |
| `douglas-open-burn-permits.html` | 12:35:13 | [Douglas Fire permit conditions](https://www.douglasaz.gov/231/Burn-Permits) |
| `saint-david-permit-status.json` | 12:38:34 | [District status JSON](https://stdavidfire.com/wp-json/sdfd-burn/v1/status), published on the [permit page](https://stdavidfire.com/resident-resources/burn-permits/). Upstream checks were current through 5:33 a.m. MST. |
| `pima-rural-permits.html` | 12:35:13 | [Pima Volunteer Fire permit rules](https://www.pimafire.com/open-burn-permit) in Graham County |
| `duncan-valley-permits.html` | 12:33:02 | [Duncan Valley permit rules](https://www.duncanfireaz.org/burnpermits) |
| `rio-rico-burn-approval.html` | 12:32:24 | [Rio Rico residential permit terms](https://www.rioricomedicalandfire.org/30-day-residential) |
| `yuma-rural-open-burn-permits.html` | 12:32:29 | [Rural Metro Yuma County permit process](https://www.yumacountyfire.org/burn-permit-process) |
| `la-paz-unified-permits.pdf` | 12:34:40 | [La Paz Unified blank permit](https://img1.wsimg.com/blobby/go/2bc2d07c-9375-40cc-b09b-c126836ff0c9/downloads/69777f28-4e26-437d-977b-6f16dd3f7c06/Burn%20Permit.pdf?ver=1795640515462), linked from [Fire Safety](https://lapazfiremedical.com/fire-safety-1). |

The November 24 replay uses standing rules and dated orders already in force. The later daily decision fixtures have their own clocks. Tests use controlled mutations to cover positive daily decisions and changed evidence. Mohave's issue, partial lift and final rescission are real county documents.
