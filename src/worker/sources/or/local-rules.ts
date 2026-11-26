import { COUNTY_BY_FIPS } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";

type LocalRule = LocalCalendarRule & {
  id: string;
  fips: string;
  name: string;
  stack: string;
  url: string;
  review: LocalCalendarEvidence;
  sourceUrl?: string;
  fixture?: string;
  zone?: string;
};

const html = (selector: string, digest: string, startsWith?: string): LocalCalendarEvidence =>
  ({ kind: "html", selector, digest, startsWith });
const code = (section: string, digest: string): LocalCalendarEvidence =>
  ({ kind: "html-ecode360", sections: [section], digest });

const rules: LocalRule[] = [
  {
    id: "astoria-piles", fips: "41007", name: "Astoria Fire Department", stack: "ASP.NET WebForms",
    url: "https://www.astoria.gov/Burn_Information.aspx",
    review: html("#main p", "1721a7d9d722d0200c85ddaba3900877a04bf3423de6c024c4aab271a1f15e38", "NO open burn piles are allowed"),
    scopeNote: "Astoria city limits",
    label: "Open burn piles prohibited in Astoria",
    note: "The city prohibits open burn piles. Recreational fires and burn barrels have separate permit and safety rules. Call Astoria Fire at 503-325-2345.",
  },
  {
    id: "baker-city-permit", fips: "41001", name: "Baker City Fire Department", stack: "CivicPlus",
    url: "https://www.bakercity.com/2327/Burn-Permits",
    review: html("#divEditorc3a07f88-8497-4ab7-802d-03ae2d4c5f91 .fr-view", "763b7561bd34c48fd8c064b8f377d6766d020b7af25c13140a3449e192a2a9da"),
    scopeNote: "Baker City limits",
    label: "Baker City residential burn permit required",
    note: "The city issues annual residential permits for approved yard debris and limits pile size and burn hours. Check the application and current fire conditions with Baker City Fire.",
  },
  {
    id: "bend-open-burning", fips: "41017", name: "Bend Fire & Rescue", stack: "Before You Burn / HTML",
    url: "https://beforeyouburn.com/a/bend-fire-and-rescue/areas#area-479",
    sourceUrl: "https://beforeyouburn.com/a/bend-fire-and-rescue/areas",
    review: {
      kind: "html-blocks", section: "article.pfsareas-card#area-479", blocks: "h3, small, .pfsareas-tag, dt, dd",
      digest: "3fe3b031d43c332f1646d324a6bf74897de420197fae50d18288937070a555dd",
    },
    scopeNote: "Bend city limits",
    label: "Yard-debris burning prohibited in Bend",
    note: "Bend Code 5.30.005 prohibits outdoor burning of yard debris and several other materials. The code lists exceptions for specified small fires and fire department training or fuel reduction.",
  },
  {
    id: "boardman-open-burning", fips: "41049", name: "Boardman Fire Rescue District", stack: "Streamline",
    url: "https://www.boardmanfd.com/faqs",
    review: html("main article#poc .body > div", "ec086bfc9969389c05a0a70b355b5eeb3cf227b589fc0002f20fda6b22bff171", "BURN REGULATIONS"),
    scopeNote: "Boardman Fire Rescue District in Morrow County",
    label: "Open burning requires a Boardman Fire permit",
    note: "The district requires a burn permit when open burning is allowed and directs permit holders to call Morrow County Dispatch before lighting. The district normally closes burning June 15–October 1.",
  },
  {
    id: "columbia-river-fire-permits", fips: "41009", name: "Columbia River Fire & Rescue", stack: "Wix",
    url: "https://www.crfr.com/burn-information",
    review: html("p", "fead8bd61562f3450ee8390ee9eef10ea528a9ce5ea86fb14cff60cb6d06b465", "As required by ORS 478.960, burning permits are required"),
    scopeNote: "Columbia River Fire & Rescue service area in Columbia County",
    label: "Open burning requires a Columbia River Fire & Rescue permit",
    note: "The district requires permits for covered open burning, with an exception for small recreational fires. St. Helens and Columbia City publish their own open periods. Call 503-397-4800 for the district’s daily decision.",
  },
  {
    id: "corvallis-season", fips: "41003", name: "Corvallis Fire Department", stack: "Drupal",
    url: "https://www.corvallisoregon.gov/fire/page/burning-regulations",
    review: html("#node-2451 .field-item > ul > li", "30642ecfb7d036ea99bcd1236e856e1b2022c37fef8bc0bcb2ea4db1d202b821", "Within the city limits, burning season opens April 15"),
    scopeNote: "Corvallis city limits",
    label: "Corvallis backyard burning is closed outside its spring window",
    note: "The city permits backyard debris burning for 14 designated burn days beginning April 15, ending no later than June 15. Corvallis has no fall backyard burn season. The rural district has its own schedule.",
    seasons: [["06-16", "04-14"]],
  },
  {
    id: "crook-county-permit", fips: "41013", name: "Crook County", stack: "eCode360",
    url: "https://ecode360.com/49961698",
    review: code("49961698", "974d5f84cb4ef35a3d0605fdb67aafa3b63dcfeaa81ecaf818785c37ee441cb8"),
    scopeNote: "Outdoor burns governed by Crook County Code Chapter 8.12",
    label: "Crook County requires the outdoor-burning permit on site",
    note: "The county defines the permit as a copy of the Crook County Fire & Rescue Outdoor Burning Regulations. Keep it at the burn and check the district’s daily status before lighting.",
  },
  {
    id: "grants-pass-burn-windows", fips: "41033", name: "Grants Pass Fire Rescue", stack: "CivicPlus",
    url: "https://www.grantspassoregon.gov/1501/Burn-windows-and-permits",
    review: html("p", "116250e340d9b83f344e8cf3d26e8f00938145f2f8f0c0909d429a4a7fd6d155", "Each Spring and Fall, the City of Grants Pass opens"),
    scopeNote: "Grants Pass city limits",
    label: "Grants Pass limits residential open burning to city burn windows",
    note: "The city announces a nine-day window in spring and again in fall and issues permits. Follow the dates on the city page. Josephine County’s daily burn line is 541-476-9663, option 3.",
  },
  {
    id: "harbor-burn-permit", fips: "41015", name: "Harbor Rural Fire Protection District", stack: "Wix",
    url: "https://www.harborfiredept.com/burnpermits",
    review: html("p", "7abf6536dc1fbd41d39ef0bf660029a9d470873e330616425125cad4c4e7212c", "1 - Obtain a burn permit"),
    scopeNote: "Harbor Rural Fire Protection District in Curry County",
    label: "Harbor Fire requires an open-burning permit",
    note: "The district requires a permit and a call to the burn line before burning. Seasonal opening dates vary. Call 541-469-3118, option 0, for the current decision.",
  },
  {
    id: "hines-burn-permit", fips: "41025", name: "Hines Fire Department", stack: "CivicPlus",
    url: "https://cityofhines.gov/1207/Fire-Department",
    review: html("#divEditor656f240a-9276-4a2d-be2e-453f46a48526 .fr-view", "861576b57b3da4d4c415ab675b5df7a90816904481e0582f3d4b17527c275ff8"),
    scopeNote: "Hines city limits",
    label: "Hines requires an open-burning permit and dispatch notification",
    note: "The city publishes a burn permit form, limits burning to 8 a.m.–5 p.m. and requires a call to dispatch at 541-573-6156 before burning.",
  },
  {
    id: "john-day-burn-permit", fips: "41023", name: "John Day Fire Department", stack: "PDF",
    url: "https://www.cityofjohnday.com/fire",
    sourceUrl: "https://www.cityofjohnday.com/sites/default/files/fileattachments/administration/page/2691/6_openburnbrochureenglish_2.pdf",
    review: { kind: "pdf-etag", etag: '"5ffe9-549897264de36"' },
    fixture: "john-day-burn-permit.headers.json",
    scopeNote: "City of John Day",
    label: "John Day requires an outdoor-burning permit",
    note: "The fire department links to a guide requiring a permit for covered outdoor burning. The daily air-quality advisory can further restrict burning. Check with John Day Fire at 541-575-1855.",
  },
  {
    id: "klamath-aqz-ordinance", fips: "41035", name: "Klamath County Public Health", stack: "CivicPlus / signed ordinance PDF",
    url: "https://www.klamathcounty.org/383/Air-Quality",
    sourceUrl: "https://www.klamathcounty.org/DocumentCenter/View/36867/06-25-24-BOCC--Ordinance-6307-Signed-and-Approved?bidId=",
    review: { kind: "pdf", digest: "40d51b3c7cb10cc47580e1395e0914ca810a65d348878659dfc25b27fc1d5632" },
    fixture: "klamath-ordinance-6307.pdf.gz",
    scopeNote: "Klamath Falls-area Air Quality Zone",
    label: "Yard-debris burning limited to county burn windows or an approved variance",
    note: "Klamath County Ordinance 6307 limits outdoor yard-debris burning in the air quality zone to designated periods or an approved variance. Public Health issues daily decisions during burn windows. Call 541-882-2876.",
  },
  {
    id: "mid-columbia-burn-permits", fips: "41065", name: "Mid-Columbia Fire & Rescue", stack: "Streamline",
    url: "https://www.mcfr.org/residential-open-burning",
    review: html("main h4", "e5d56addea5456f07c31454c08bd624ecfe3395d4aeb9c7ae755a3faf66fa65e", "A Burn Permit is required to burn anywhere"),
    scopeNote: "Mid-Columbia Fire & Rescue district in Wasco County, including The Dalles",
    label: "Residential burning requires a Mid-Columbia Fire permit",
    note: "The district requires a permit for covered residential burning. The Dalles has its own spring and fall yard-debris windows. Check the district for current closures.",
  },
  {
    id: "north-bend-burn-permit", fips: "41011", name: "North Bend Fire & Rescue", stack: "CivicPlus",
    url: "https://www.northbendoregon.gov/21075/burn-permit",
    review: html(".SecondContentSection ol > li", "3efff61488895801bcb8cf8d77e62362edcd475112a3279b50161666d912d70d", "Must have a current fire permit."),
    scopeNote: "North Bend city limits",
    label: "North Bend open burn piles require a permit",
    note: "The city requires a current fire permit for open burn piles and limits burning to daylight and calm conditions. Contact Coos Forest Protective Association for surrounding rural areas.",
  },
  {
    id: "ontario-burn-permit", fips: "41045", name: "Ontario Fire & Rescue", stack: "Weebly",
    url: "https://www.ontariooregon.org/burnpermits.html",
    review: html("#wsite-content .paragraph", "bf6db1540eb9f5b88bc7e1b3ccf8bcdf8aa03803ac8c05b0f40c9adee192bf2b", "Residential burn barrels and open burning within City limits"),
    scopeNote: "Ontario city limits",
    label: "Ontario requires residential open-burning and burn-barrel permits",
    note: "Ontario Fire & Rescue issues permits for residential open burning and burn barrels. The city website lists separate rural and commercial requirements.",
    zone: US_ZONES.Mountain,
  },
  {
    id: "parkdale-burn-permit", fips: "41027", name: "Parkdale Rural Fire Protection District", stack: "IM Creator",
    url: "https://parkdalefire.com/burning-info.html",
    review: html("p", "aa51f1e38254477830a7294d2727d47d132b075ab273d2cf7c77498e23e988a1", "A valid burn permit allows you to burn yard debris"),
    scopeNote: "Parkdale Rural Fire Protection District in Hood River County",
    label: "Parkdale open burning requires a permit",
    note: "The district requires a permit for yard-debris burning when its season is open. Check the district’s burning page for permitted materials and updated conditions.",
  },
  {
    id: "roseburg-open-burning", fips: "41019", name: "City of Roseburg", stack: "eCode360",
    url: "https://ecode360.com/43087794",
    review: code("43087794", "40b6ed80074cf8f8ece3b280bee9db198679ca01287b872a854ab80e6af29aa2"),
    scopeNote: "Roseburg city limits",
    label: "Roseburg restricts outdoor burning year-round",
    note: "Municipal Code 7.04.110 requires a permit for covered fires. The Fire Chief ordinarily issues residential yard-waste permits April 15–May 15 and October 1–31, and may adjust those dates. Certain small cooking fires and approved appliances are exempt.",
  },
  {
    id: "union-burning-permit", fips: "41061", name: "Union County Smoke Management", stack: "WordPress / Elementor",
    url: "https://unioncountyor.gov/emergency-services/smoke-management/#burn-permit",
    sourceUrl: "https://unioncountyor.gov/emergency-services/smoke-management/",
    review: html("p", "53af2ef6bdfa951e42dfc9a7f13412143917aab5897882604d1c4ac628eb4eee", "A: Yes, as stated in 2024-02 Union County Burn Ordinance"),
    scopeNote: "Open burning outside incorporated city limits under Union County Ordinance 2024-02",
    label: "Union County requires same-day open-burning permits",
    note: "Permits and daily conditions apply to covered open burning outside city limits. Visit the county Smoke Line online or call 541-963-4040. Burn barrels and certain recreational fires are exempt from the permit requirement.",
  },
  {
    id: "wallowa-burn-barrels", fips: "41063", name: "City of Wallowa", stack: "Weebly / ordinance PDF",
    url: "https://cityofwallowa.weebly.com/ordinances.html",
    sourceUrl: "https://cityofwallowa.weebly.com/uploads/3/1/8/2/31824813/ordinance_347-2017.pdf",
    review: { kind: "pdf-etag", etag: '"a0ed0b4d3865ca02efd1dde5083e5bfb"' },
    fixture: "wallowa-burn-barrels.headers.json",
    scopeNote: "Burn barrels within the City of Wallowa",
    label: "Wallowa prohibits burn-barrel use from 6 p.m. to 10 a.m.",
    note: "City Ordinance 347-17 requires barrel fires to be out by 6 p.m. and prohibits starting them before 10 a.m. A separate prohibition applies during locally declared fire season.",
    hours: [18 * 60, 10 * 60],
  },
  {
    id: "yachats-open-burning", fips: "41041", name: "City of Yachats", stack: "eCode360",
    url: "https://ecode360.com/43629296",
    review: code("43629294", "d1e15a202b8c8d847fb994d7a2892779901c9e0d78ca4f49a55bcfe550c2a494"),
    scopeNote: "Yachats city limits",
    label: "Yachats prohibits ordinary yard-debris burning",
    note: "The city code prohibits covered outdoor burning and lists limited exceptions. The rural fire district has different rules outside the city.",
  },
];

export const orCountyRules = rules.map(({
  id, fips, name, stack, url, sourceUrl = url, review, fixture = `${id}.html`, zone = US_ZONES.Pacific, ...rule
}, index) => {
  const county = COUNTY_BY_FIPS.get(fips);
  if (!county || county.state !== "OR") throw new Error(`Unknown Oregon county in ${id}`);
  // Give the larger Harbor and Klamath documents a two-source group.
  const group = id === "harbor-burn-permit" || id === "klamath-aqz-ordinance" ? 2 : index % 2;
  const hour = group === 0 ? 3 : 4;
  const calendar = reviewedLocalCalendar({
    publisher: { id: `or-${id}`, state: "OR", scope: "part", stack, sourceName: name, sourceUrl, officialUrl: url },
    counties: [county], rule, review, zone, hour, standing: true,
  });
  return {
    fixture, parse: calendar.parse,
    source: {
      ...calendar.source, cadence: { kind: "daily" as const, zone: US_ZONES.Pacific, hours: [hour] as const },
      reportingFips: [fips], pollGroup: `or-standing-rules-${group + 1}`,
    },
  };
});
