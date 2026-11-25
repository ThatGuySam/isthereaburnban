import { countyByName } from "../../counties";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";
import { PACIFIC } from "./daily";

type LocalRule = LocalCalendarRule & {
  id: string;
  counties: readonly string[];
  sourceName: string;
  stack: string;
  url: string;
  officialUrl?: string;
  lastReviewed?: string;
  countyScopeNotes?: Readonly<Record<string, string>>;
  fixture: string;
  review: LocalCalendarEvidence;
};

const rules: readonly LocalRule[] = [
  {
    id: "bay-area-open-burning", counties: ["Alameda", "Contra Costa", "Marin", "Napa", "San Francisco", "San Mateo", "Santa Clara", "Solano", "Sonoma"],
    sourceName: "Bay Area Air District", stack: "Sitecore / HTML", url: "https://www.baaqmd.gov/permits/open-burn",
    fixture: "bay-status-rule.html",
    review: { kind: "html", selector: "p", startsWith: "To reduce the harmful effects of smoke on public health", digest: "f6a2a71e847644a1b8dff8b941d9bac71bd581903541d1e2612d38036beebde3" },
    label: "Open burning limited to listed burn types",
    scopeNote: "Bay Area Air District jurisdiction, open burning under Regulation 5",
    countyScopeNotes: { Solano: "Southwestern Solano County in Bay Area Air District jurisdiction", Sonoma: "Southern Sonoma County in Bay Area Air District jurisdiction" },
    note: "Regulation 5 limits open burning to listed exceptions. The district lists a permissible season and notification requirements for each eligible burn type.",
  },
  {
    id: "south-coast-open-burning", counties: ["Los Angeles", "Orange", "Riverside", "San Bernardino"],
    sourceName: "South Coast Air Quality Management District", stack: "PDF rule / Sitefinity",
    url: "https://www.aqmd.gov/docs/default-source/rule-book/rule-iv/rule-444.pdf",
    officialUrl: "https://www.aqmd.gov/home/rules-compliance/compliance/open-burn", fixture: "south-rule.pdf",
    review: { kind: "pdf", digest: "d3867cc29ba2917aa02be6d0af44211df56da5ae84f40923c367f2ef28251d35" },
    label: "Outdoor residential waste burning prohibited by Rule 444",
    scopeNote: "South Coast AQMD jurisdiction, outdoor residential waste burning",
    note: "Rule 444(d)(3)(A) bars outdoor burning to dispose of residential waste. The district has separate authorization and eligibility rules for agricultural, tumbleweed, hazard-reduction and other burns.",
  },
  {
    id: "north-coast-burn-permits", counties: ["Del Norte", "Humboldt", "Trinity"],
    sourceName: "North Coast Unified Air Quality Management District", stack: "Streamline / HTML",
    url: "https://www.ncuaqmd.org/standard-burn-permits", fixture: "nocopermits-rule.html",
    review: { kind: "html", selector: "#poc .body p", startsWith: "It is mandatory to obtain a valid burn permit", digest: "46a3196f34ffb944940b4783b2030a1f25dd00d05742375dcabc53dee0f94bce" },
    label: "Permit required for open vegetation burning",
    scopeNote: "North Coast Unified air district, open burning of vegetation grown on site",
    note: "The district requires a valid air quality permit for covered vegetation disposal. Small recreational and ceremonial campfires are exempt from this district permit. Call the district for the current zone decision.",
  },
  {
    id: "great-basin-burn-permits", counties: ["Alpine", "Inyo", "Mono"],
    sourceName: "Great Basin Unified Air Pollution Control District", stack: "HTML",
    url: "https://gbuapcd.org/PermittingAndRules/Burning/", fixture: "greatbasin-rule.html",
    review: { kind: "html", selector: ".mainDiv h5", startsWith: "For residential burning, a burn permit must be obtained", digest: "33e46f62cde3975f13da92fc3f8dd43f8ebc67ccf693862dfdd4e468031034f2" },
    label: "Fire agency permit required for residential open burning",
    scopeNote: "Great Basin Unified air district, residential open vegetation burning",
    note: "The district requires a local fire agency permit and a permissive air-quality day. Check the fire agency's decision and the district's map of local restrictions.",
  },
  {
    id: "monterey-bay-backyard-season", counties: ["Monterey", "San Benito", "Santa Cruz"],
    sourceName: "Monterey Bay Air Resources District", stack: "Streamline / HTML",
    url: "https://www.mbard.org/burn-permits", fixture: "mbard-rule.html",
    review: { kind: "html", selector: "#poc .body h4", startsWith: "Backyard Burning is the burning of green waste material", digest: "b2cfb489fea29510a36f928d7d0db1bb9d95bf45389e6f70b9fc320a5bff732e" },
    seasons: [["05-01", "11-30"]], label: "Backyard green-waste burn season closed",
    scopeNote: "Monterey Bay Air Resources District, backyard green-waste burning",
    note: "The district's normal backyard burn season runs December 1 through April 30. During the season, residents must obtain required permits and check fire agency orders and daily authorization.",
  },
  {
    id: "monterey-bay-backyard-permits", counties: ["Monterey", "San Benito", "Santa Cruz"],
    sourceName: "Monterey Bay Air Resources District", stack: "Streamline / HTML",
    url: "https://www.mbard.org/burn-permits", fixture: "mbard-permits-rule.html",
    review: { kind: "html", selector: "#poc .body p", startsWith: "In addition to the MBARD permit, Backyard Burners", digest: "2eb13b3e1fe6b9c5d67fc2cde2791a69f4604433fb8de51cd2fa3e1cfacf97c8" },
    seasons: [["12-01", "04-30"]], label: "Backyard burning requires a district permit",
    scopeNote: "Monterey Bay Air Resources District, eligible backyard green-waste burning",
    note: "During the district's December through April season, eligible backyard burners need the air district permit and any required fire agency permits. Check for burn-day restrictions and applicable fire orders.",
  },
  {
    id: "sacramento-rural-yard-burning", counties: ["Sacramento"],
    sourceName: "Sacramento Metropolitan Air Quality Management District", stack: "SharePoint / HTML",
    url: "https://www.airquality.org/residents/outdoor-burning/open-burning-(rural-yard-burning)", fixture: "sac-rule-rule.html",
    lastReviewed: "2026-11-25",
    review: { kind: "html", selector: "#WebPartWPQ3 .ms-rtestate-field", startsWith: "Open burning is illegal in most parts of Sacramento County", digest: "5c0c49dfc8847e39a732ecc6d0273310645f68ffaa4bf0299a28ccaf9340dac6" },
    label: "Yard burning limited to permitted rural areas",
    scopeNote: "Sacramento County, rural yard and open vegetation burning under Rule 407",
    note: "The district prohibits covered open burning in most areas, including all cities. In the designated rural areas, a local fire department permit and a legal burn day are required. Check the district's zone map.",
  },
  {
    id: "northern-sierra-open-burning", counties: ["Nevada", "Plumas", "Sierra"],
    sourceName: "Northern Sierra Air Quality Management District", stack: "Streamline / HTML",
    url: "https://www.nsaqmdca.gov/burning-faq", fixture: "sierra-faq-rule.html",
    review: { kind: "html", selector: "#poc .body li", startsWith: "An Air Pollution Permit is required for any non-residential burn", digest: "f8f34dab973fab901110e9f8a1bd913bc1c6738a355704e166dbe766fd3b353d" },
    label: "Air district permit required for non-residential burning",
    scopeNote: "Northern Sierra air district, non-residential open burning",
    note: "The district requires a permit for covered non-residential burning, including agricultural, timber harvest and construction-related burns. Residential burning has separate zone decisions.",
  },
  {
    id: "northern-sierra-city-burning", counties: ["Nevada", "Plumas"],
    sourceName: "Northern Sierra Air Quality Management District", stack: "Streamline / HTML",
    url: "https://www.nsaqmdca.gov/burn-day-status", fixture: "sierra-rule.html",
    review: { kind: "html", selector: "#poc .body p", startsWith: "Open Residential burning is NOT ALLOWED", digest: "1094cf90906250b937382a9cb2ae4d32be56f2913eb64df2acbfa15369378227" },
    label: "Open residential burning prohibited within listed cities",
    scopeNote: "Listed cities in the Northern Sierra air district",
    countyScopeNotes: { Nevada: "Cities of Grass Valley and Nevada City", Plumas: "City of Portola" },
    note: "The district lists Grass Valley and Nevada City in Nevada County and Portola in Plumas County as closed to open residential burning.",
  },
  {
    id: "shasta-vegetation-permits", counties: ["Shasta"],
    sourceName: "Shasta County Fire Department", stack: "WordPress / HTML",
    url: "https://shastacountyfire.org/burn-permits/", fixture: "shasta-rule.html",
    review: { kind: "html", selector: "p", startsWith: "Most open burning in Shasta County requires a permit", digest: "b45b16758af9ae814bf4f3c724dba66da1199240eaafdb0f9514496666a3f6cf" },
    label: "County permit required for covered hazard-reduction burns",
    scopeNote: "Shasta County, hazard-reduction burning covered by the county permit",
    note: "County Fire lists a Shasta County permit for qualifying hazard-reduction burns. Check the air district's daily decision and applicable CAL FIRE permit requirements at the burn site.",
  },
  {
    id: "siskiyou-local-permits", counties: ["Siskiyou"],
    sourceName: "Siskiyou County Air Pollution Control District", stack: "CivicPlus / Drupal HTML",
    url: "https://www.siskiyoucounty.gov/airpollution/page/burn-day-information", fixture: "siskiyou-now-rule.html",
    review: { kind: "html", selector: "p", startsWith: "Before you burn check with your local Fire Official or City Hall", digest: "764dcdc1c5517793ee0387abbc87d11e261dab692ede6c318e5783b4d8b94d9c" },
    label: "Local restrictions on residential open burning",
    scopeNote: "Siskiyou County communities listed on the air district's burn information page",
    note: "The county lists restrictions including year-round permits in Dorris, Etna, Fort Jones, McCloud, Montague, Mount Shasta, Weed and Yreka and prohibition in Lake Shastina and Tulelake. Call the county burn line for its daily decision.",
  },
  {
    id: "modoc-open-burning-rule", counties: ["Modoc"],
    sourceName: "Modoc County Air Pollution Control District", stack: "CARB rule repository / HTML",
    url: "https://ww2.arb.ca.gov/sites/default/files/classic/technology-clearinghouse/rules/RuleID1721.html",
    fixture: "modoc-rule.html",
    review: { kind: "html", selector: "body", digest: "0e05b432763518a6658515c533034ea6729b359ceb145f526e0c72f805df4df3" },
    label: "Open waste and clearing burns limited by Rule 4.3",
    scopeNote: "Modoc County APCD jurisdiction, outdoor waste burning and brush clearance",
    note: "The district limits open burning of waste. The rule allows certain right-of-way, brush and development waste burns on permissive days only. Follow current local fire and materials rules.",
  },
  {
    id: "el-dorado-pile-permits", counties: ["El Dorado"],
    sourceName: "El Dorado County Air Quality Management District", stack: "Granicus OpenCities / HTML",
    url: "https://www.eldoradocounty.ca.gov/Services/Burn-Day", fixture: "eldor-rule.html",
    review: { kind: "html", selector: "p", startsWith: "In El Dorado County, outdoor burning is limited", digest: "25e4d95219aede767c07ad97831214b980508a06d5a979862cfb108b7d58fb7a" },
    label: "Air district permit required for piles over four by four feet",
    scopeNote: "El Dorado County air district, outdoor vegetation pile burning",
    note: "The district requires an air permit for piles larger than four by four feet. Check for a permissive day and separate fire agency requirements.",
  },
  {
    id: "lake-south-district-permits", counties: ["Lake"],
    sourceName: "South Lake County Fire Protection District", stack: "Streamline / HTML",
    url: "https://www.southlakecountyfire.org/residential-burn-permit", fixture: "lake-fire-rule.html",
    review: { kind: "html", selector: "#poc .body p", startsWith: "Permit allowing Residents of 1.0 acre lot", digest: "0f95cf1c724b893d1be5cb8aab1811c8553bcef36ebccc1ba4fae8729012c51b" },
    label: "Residential hazard-reduction burns limited to qualifying lots",
    scopeNote: "South Lake County Fire Protection District, residential hazardous vegetation",
    note: "The district describes a residential permit for qualifying lots of at least one acre with a one- or two-family dwelling. A permissive Lake County air district decision is also required.",
  },
  {
    id: "san-luis-obispo-backyard-permits", counties: ["San Luis Obispo"],
    sourceName: "San Luis Obispo County Air Pollution Control District", stack: "PHP / HTML",
    url: "https://www.slocleanair.org/rules-regulations/burning.php", fixture: "ss-slo-rule.html",
    review: { kind: "html", selector: ".content.with-sidebar li", startsWith: "All Backyard burning requires an APCD Burn Permit.", digest: "53dfe87e58d41cf44258e3267e00596c6f1f8bf5932042cdf433d2a2a31bb629" },
    label: "Backyard vegetation burning requires an air district permit",
    scopeNote: "San Luis Obispo County air district, residential backyard burning",
    note: "The district only issues backyard permits for eligible residences outside designated urban and village reserve lines. Call the district's burn-day hotline for coastal and inland zone decisions.",
  },
  {
    id: "santa-barbara-pile-burning", counties: ["Santa Barbara"],
    sourceName: "Santa Barbara County Fire Department", stack: "WordPress / HTML",
    url: "https://sbcfire.com/permit-burning/", fixture: "santa-barbara-rule.html",
    review: { kind: "html", selector: ".et_pb_text_inner p", startsWith: "Permit burning is allowed within State Responsibility Areas", digest: "26e3fe0d5aaedf0b3f40e5bbc0bc140767c4d92c100d60fa42928cb1c4edbe90" },
    label: "County Fire limits permit pile burning by preparedness level",
    scopeNote: "Santa Barbara County Fire Department jurisdiction, permitted pile burning",
    note: "County Fire generally allows permitted pile burning under low fire preparedness and may authorize agricultural burning under controlled conditions during high fire season. Check its daily map or recorded burn line.",
  },
  {
    id: "amador-open-burning-rule", counties: ["Amador"],
    sourceName: "Amador County Air Pollution Control District", stack: "CARB rule repository / HTML",
    url: "https://ww2.arb.ca.gov/sites/default/files/classic/technology-clearinghouse/rules/RuleID29.html", fixture: "amador-303-rule.html",
    review: { kind: "html", selector: "p", startsWith: "AMADOR COUNTY AIR POLLUTION CONTROL DISTRICT RULE 303", digest: "30d595192de3f87656673c1c0b8a2feae01eb10fa2597f24c61ab5480b474c02" },
    label: "Covered open burning limited to permissive days",
    scopeNote: "Amador County air district, burning covered by Rule 303",
    note: "Rule 303 restricts covered open burning to permissive days and preserves fire agency bans. The district lists separate permit and exception requirements.",
  },
  {
    id: "calaveras-open-burning-permits", counties: ["Calaveras"],
    sourceName: "Calaveras County Air Pollution Control District", stack: "DNN / HTML",
    url: "https://www.calaverasgov.us/ema/Air-Pollution-Control/Burn-Day-Permits-and-Information", fixture: "calaveras-rule.html",
    review: { kind: "html", selector: "p", startsWith: "When burning is allowed, you are required to have an Air Pollution Control Burning Permit", digest: "821aa564a167c0378793980a6544d981447c4a3b4288f1470fe286ff37507fd3" },
    label: "Air district permit required for qualifying vegetation burns",
    scopeNote: "Calaveras County air district, covered parcel and commercial burns",
    note: "When burning is allowed, the air district requires a permit for properties of five acres or more and for commercial operations. Check the district's telephone burn line and local fire requirements.",
  },
  {
    id: "tuolumne-covered-burn-permits", counties: ["Tuolumne"],
    sourceName: "Mi-Wuk Sugar Pine Fire Protection District", stack: "Streamline / HTML",
    url: "https://www.mwspfire.us/burn-permits-required", fixture: "tuol-wuk-rule.html",
    review: { kind: "html", selector: "#poc .body p", startsWith: "You need an APCD burn permit if you are", digest: "66497713ca982e88c0bb0ac4ba1061f2721450a7ff46b5113d06ef18a08a8e99" },
    label: "Air district permit required for specified vegetation burns",
    scopeNote: "Mi-Wuk Sugar Pine Fire Protection District, covered burns in Tuolumne County",
    note: "The district directs burners to obtain APCD permits for vegetation burns over two acres and for listed commercial, development and public agency work. Contact the district for residential permit availability.",
  },
  {
    id: "mariposa-hazard-reduction-permits", counties: ["Mariposa"],
    sourceName: "Mariposa County Air Pollution Control District", stack: "CivicPlus / PDF",
    url: "https://www.mariposacounty.gov/DocumentCenter/View/97105/APCD-Hazard-Reduction-Burning-Handout-V1-12-22-2023?bidId=",
    officialUrl: "https://www.mariposacounty.gov/2584/Air-Pollution-Burn-Permits", fixture: "mariposa-handout.pdf",
    review: { kind: "pdf", digest: "29094ab542bad05d83437b582b77554030f0cc9e5bcc3f7479f1cacb497901b4" },
    label: "District permit required for covered hazard-reduction burning",
    scopeNote: "Mariposa County air district, vegetation burning covered by district permit rules",
    note: "The air district requires permits for residential clearance farther than 100 feet from structures and for specified commercial, development and public-agency burns. Check the telephone burn line and CAL FIRE rules.",
  },
  {
    id: "glenn-agricultural-permits", counties: ["Glenn"],
    sourceName: "Glenn County Air Pollution Control District", stack: "CARB rule repository / HTML",
    url: "https://ww2.arb.ca.gov/sites/default/files/classic/technology-clearinghouse/rules/RuleID1127.html",
    fixture: "glenn-rule-rule.html",
    review: { kind: "html", selector: "body", digest: "81935426a7d09195d6ad83abef3582e1f5d4e1e47bbd9e2e51c91fa4600e253d" },
    label: "Agricultural burning requires a district permit",
    scopeNote: "Glenn County air district, agricultural open burning",
    note: "Section 10 requires a valid agricultural burn permit and compliance with its conditions. The district publishes daily decisions on its telephone line.",
  },
  {
    id: "lassen-residential-burning", counties: ["Lassen"],
    sourceName: "Lassen County Air Pollution Control District", stack: "CivicPlus / PDF",
    url: "https://www.lassenair.org/DocumentCenter/View/243/Residential-Waste-Brochure-PDF",
    officialUrl: "https://www.lassenair.org/167/Burn-Information", fixture: "lassen-form.pdf",
    review: { kind: "pdf", digest: "356be9e695a34dec8a2f6da8553e6a2a8bd4ea1c63a12d9c44becbe06d76ade9" },
    label: "Residential vegetation burning limited to approved days and material",
    scopeNote: "Lassen County APCD jurisdiction, outdoor residential burning",
    note: "The district limits residential burning to vegetation grown on the property, requires a district-approved ignition device, and only allows qualified burns on its permissive days. Status is available on the district's telephone line.",
  },
  {
    id: "san-diego-city-recreational-fires", counties: ["San Diego"],
    sourceName: "City of San Diego Fire-Rescue Department", stack: "Drupal / HTML",
    url: "https://www.sandiego.gov/fire/community-risk-reduction/policies/recreational-fires", fixture: "sd-city-rule.html",
    review: { kind: "html", selector: "p", startsWith: "A recreational fire of the described size", digest: "37e871a99e5ce48aedd980cb5d06db0bc75bdb43f6f376f8643458911c661e60" },
    label: "City fire code limits recreational fire size and location",
    scopeNote: "City of San Diego, recreational outdoor fires",
    note: "City Fire-Rescue limits recreational fires to three feet across and two feet high, with clearance requirements that depend on whether the fire is in an approved container. Check city and county rules for other activities.",
  },
  {
    id: "placer-city-open-burning", counties: ["Placer"],
    sourceName: "Placer County Air Pollution Control District", stack: "CivicPlus / HTML",
    url: "https://www.placerair.org/1671/Burn-Days", fixture: "placer-rule.html",
    review: { kind: "html", selector: "li", startsWith: "Burning is prohibited within the city limits of Roseville", digest: "c451b9bb79da5338f31a682984628efbb921579538362b441bf258954f068479" },
    label: "Residential open burning prohibited in listed cities",
    scopeNote: "Cities of Roseville, Rocklin and Lincoln",
    note: "The district's residential burn-day page lists a continuing prohibition in these cities. Consult the address map or fire agency for other places and activities.",
  },
];

export const caLocalBurningRules = rules.map(({ counties: names, ...rule }, index) => {
  const counties = names.map((name) => {
    const county = countyByName("CA", name);
    if (!county) throw new Error(`Unknown California county: ${name}`);
    return { ...county, scopeNote: rule.countyScopeNotes?.[name] };
  });
  const reviewed = reviewedLocalCalendar({
    publisher: {
      id: `ca-${rule.id}`, state: "CA", scope: "part", stack: rule.stack, sourceName: rule.sourceName,
      sourceUrl: rule.url, officialUrl: rule.officialUrl ?? rule.url,
    },
    counties, rule, review: rule.review, zone: PACIFIC, hour: 5 + index % 4, standing: true, lastReviewed: rule.lastReviewed,
  });
  return {
    ...reviewed,
    source: { ...reviewed.source, reportingFips: counties.map(({ fips }) => fips) },
    fixture: rule.fixture,
  };
});
