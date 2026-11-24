# District of Columbia source captures

All requests used the project's status-checker user agent on November 24, 2026. Both automated sources returned HTTP 200 over public GET. The listings and rules describe standing restrictions. Temporary orders and permit availability require confirmation from the issuing authority.

| Fixture | Capture time (UTC) | Request URL |
| --- | --- | --- |
| `dcregs-chapter-6-2026-11-24.html` | 17:29:19 | [DCRegs Chapter 6](https://dcregs.dc.gov/Common/DCMR/RuleList.aspx?ChapterNum=20-6) |
| `dcregs-section-604-2026-11-24.doc` | 17:29:48 | [DCRegs § 604 latest text download](https://dcregs.dc.gov/Common/DCMR/RuleList.aspx?DownloadFile=00C7545F-0000-C7AF-B33F-1DE74AD122DF) |
| `rock-creek-compendium-2026-11-24.html` | 17:30:50 | [NPS origin compendium](https://home.nps.gov/rocr/learn/management/rock-creek-park-superintendent-compendium.htm) |

The ASP.NET fixture retains the chapter's complete `ruleTable`, including the direct GET in the `title` attribute and the legacy duplicate `href` attributes. The Word file is the unmodified download. Its reviewed text matches the DOEE PDF. A changed latest-version link, schema or document hash requires review. The register displays `1/1/1900` as a legacy placeholder. EPA records the District effective date as March 15, 1985. [DCRegs section record](https://dcregs.dc.gov/Common/DCMR/SectionList.aspx?SectionId=7672) · [EPA approved rules](https://www.epa.gov/air-quality-implementation-plans/epa-approved-regulations-district-columbia-sip)

The CommonSpot fixture preserves the heading, approval and jurisdiction, scope statement and § 2.13 fire provisions. The public `www.nps.gov` URL returned a nine-day-old cached response. The NPS `home.nps.gov` origin returned the same August 28, 2026 compendium with a current HTTP Date. Its fire provisions cover NPS lands and waters administered by Rock Creek Park. The adapter maps only those areas within DC to its single county equivalent, FIPS 11001. [Public compendium](https://www.nps.gov/rocr/learn/management/rock-creek-park-superintendent-compendium.htm)

## Inventory checked

All six inventory URLs returned HTTP 200 on direct GET.

- The Council's § 22–1313 prohibits burning specified combustibles in listed streets, alleys, open grounds and lots between sunset and sunrise. The Law Library directs automated users to its bulk distribution. [DC Code § 22–1313](https://code.dccouncil.gov/us/dc/council/code/sections/22-1313)
- DOEE's Chapter 6 PDF generally prohibits open fires under § 604, subject to five categories of exceptions. The agency's air-quality regulations page links the latest DCRegs chapter. [DOEE Chapter 6 PDF, page 4](https://doee.dc.gov/sites/default/files/dc/sites/ddoe/publication/attachments/aqd.revch6_.pdf#page=4) · [DOEE air-quality regulations](https://doee.dc.gov/service/air-quality-law-and-regulations)
- FEMS operational permits lists the Fire Chief's permits and the bonfire and open-flame orders. Its introduction cites older code editions. DOB identifies the 2017 District Fire Code supplement and 2015 International Fire Code. [FEMS operational permits](https://fems.dc.gov/service/operational-permits) · [DOB current codes](https://dob.dc.gov/page/2017-dc-construction-codes-0)
- FEMS General Order 607, revised April 27, 2017, describes review of flame effects, open flames and grilling for covered special events and other activities. [Open-flame permit order](https://dc.gov/sites/default/files/dc/sites/fems/service_content/attachments/G.O.607%20PP%20-Open%20Flame%20Permits%20%28Revised%204-27-17%29.pdf)
- FEMS General Order 619, issued April 27, 2017, describes the ceremonial bonfire permit, inspection where required and notice to the District air-quality office before the event. [Bonfire permit order](https://fems.dc.gov/sites/default/files/dc/sites/fems/service_content/attachments/G.O.619%20PP%20Bonfire%20Permits%20%28Revised%204-27-17%29.pdf)
- Rock Creek's public park-alert embed returned eight road, trail, site and facilities notices and no fire order. The Superintendent can declare a park fire ban during high fire danger. Check public alerts and park notices for temporary changes. [Rock Creek conditions](https://www.nps.gov/rocr/planyourvisit/conditions.htm) · [Public JSON](https://www.nps.gov/rocr/park-alerts-rocr.json)

The Mayor can issue air-pollution emergency orders under 20 DCMR Chapter 4. The checked AlertDC feed and FEMS newsroom did not verify a temporary districtwide burn order. DPR has separate restrictions on ground fires and grilling on its properties and can restrict fires during dry periods. [DCRegs emergency procedures](https://dcregs.dc.gov/Common/DCMR/RuleList.aspx?ChapterNum=20-4) · [AlertDC](https://hsema.dc.gov/featured-content/alert-dc-emap) · [FEMS newsroom](https://fems.dc.gov/newsroom) · [DPR rules](https://dpr.dc.gov/page/rules-and-regulations-0)
