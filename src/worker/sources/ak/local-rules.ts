import { COUNTY_BY_FIPS } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";
import type { ActiveSource } from "../types";

type LocalRule = LocalCalendarRule & Pick<ActiveSource, "sourceName" | "sourceUrl" | "stack"> & {
  id: string;
  fips: string | readonly [string, ...string[]];
  scope?: "county" | "part";
  officialUrl?: string;
  review: LocalCalendarEvidence;
  reviewedAt?: string;
};

const html = (selector: string, startsWith: string, digest: string): LocalCalendarEvidence =>
  ({ kind: "html", selector, startsWith, digest });
const code = (sections: readonly [string, ...string[]], digest: string): LocalCalendarEvidence =>
  ({ kind: "html-ecode360", sections, digest });

const JUNEAU_PERMITS = "https://juneau.org/fire/burn-permit-info";
const DENALI_COMPENDIUM = "https://home.nps.gov/locations/alaska/upload/Denali-Superintendents-Compendium.pdf";
export const SKAGWAY_PERMITS = "https://www.sgyfire.org/burn-permits";
export const AK_CALENDAR_POLL_GROUP = "ak-calendar-checks";
export const AK_PERMIT_POLL_GROUP = "ak-permit-checks";

const rules: LocalRule[] = [
  {
    id: "akutan-outdoor-waste", fips: "02013", stack: "Alaska DCRA code library / PDF",
    sourceName: "City of Akutan", scopeNote: "City of Akutan",
    sourceUrl: "https://www.commerce.alaska.gov/web/Portals/4/pub/LGS/Code_library/Akutan%20Municipal%20Code.pdf",
    officialUrl: "https://www.commerce.alaska.gov/web/Portals/4/pub/LGS/Code_library/Akutan%20Municipal%20Code.pdf#page=127",
    label: "Akutan requires approval for outdoor burning of combustible material",
    note: "Akutan Code §9.30.070 requires the fire chief’s authorization for outdoor burning of rubbish or other combustible materials. Ask the city how the rule applies to your burn.",
    review: { kind: "pdf-etag", etag: '"d0ed352ad56ece1:0"' },
  },
  {
    id: "unalaska-burn-permit", fips: "02016", stack: "CivicPlus / Drupal 7", sourceName: "Unalaska Department of Public Safety",
    sourceUrl: "https://www.unalaska.gov/publicsafety/page/burn-permits", scopeNote: "City of Unalaska",
    label: "Unalaska requires permits for covered open burning",
    note: "Get a city permit before open burning of covered materials, including scrap wood. Contact Public Safety to confirm the exemptions and conditions for your burn.",
    review: html('[property="content:encoded"] p', "Burning trash, rubbish", "db2d452d490a2268e72c434ea7c3bb4dbd0ef7540d9537c105b116f8dc5c73c4"),
  },
  {
    id: "anchorage-clean-air", fips: "02020", scope: "county", stack: "eCode360", sourceName: "Municipality of Anchorage",
    sourceUrl: "https://ecode360.com/49391708", officialUrl: "https://ecode360.com/49391708#49391664",
    scopeNote: "Open burning regulated by Anchorage Municipal Code §15.30.080",
    label: "Anchorage prohibits most open burning of yard and construction debris",
    note: "The Clean Air Ordinance limits open burning to specified uses. Exceptions include qualifying recreational and cooking fires and specially approved operations. Anchorage Fire publishes separate daily conditions for recreational fires.",
    review: code(["49391664"], "611a2bcf10db3fd875579cc57a3a7c6ef063124db39104c8c9082ab1b09a9def"),
  },
  {
    id: "valdez-open-fires", fips: "02063", stack: "CivicPlus", sourceName: "Valdez Fire Department",
    sourceUrl: "https://www.valdezak.gov/300/Open-Fires", scopeNote: "City of Valdez",
    label: "Valdez requires notice to the fire department before open burning",
    note: "Notify Valdez Fire each time you plan an open burn. Follow the city’s monitoring and wind limits and get any required DNR permit.",
    review: html(".fr-view li", "You must notify the fire department each time", "119f517a554303fb23226cbda5522a156772209d7de5089b332c2c0fdeef5698"),
  },
  {
    id: "whittier-open-burning", fips: "02063", stack: "Municode / ordinance PDF", sourceName: "City of Whittier",
    sourceUrl: "https://mcclibraryfunctions.azurewebsites.us/api/ordinanceDownload/17040/1276304/pdf",
    scopeNote: "City of Whittier", label: "Whittier requires a permit for covered open burning",
    note: "Whittier Code §8.08.020 requires a city permit for covered open burning, including burn barrels. The rule exempts barbecues and campfires in established metal rings or containerized fire pits, subject to additional restrictions.",
    review: { kind: "pdf", digest: "5eb034cd1bdc75203636753583dee22cab9c0cb868e05b4e4801165644e1f6a2" },
  },
  {
    id: "chitina-campfire-rings", fips: "02066", stack: "WordPress", sourceName: "Ahtna, Inc. Land and Natural Resources",
    sourceUrl: "https://www.ahtna.com/lands/chitina/", scopeNote: "Ahtna-owned land in the Deyighił’aaden Cultural District near Chitina",
    label: "Ahtna limits campfires to established campground rings near Chitina",
    note: "Ahtna’s visitor rules require established campground rings for campfires on its covered land. Confirm land ownership, access requirements and any additional restrictions before visiting.",
    review: html("p.wp-block-paragraph", "Campfires are not allowed on Ahtna and Chitina lands outside established campground rings.", "8f677eebd18bf7d339b5a1c922b9e963e91f0222a95066f258213b97d4d54a17"),
  },
  {
    id: "anderson-brush-season", fips: "02068", stack: "GovOffice", sourceName: "City of Anderson",
    sourceUrl: "https://anderson.govoffice.com/index.asp?DE=B569B699-8C46-4D1B-9478-837E6ADF5348&SEC=92B5E379-4A07-4C2F-83B9-002F33418204",
    scopeNote: "City of Anderson", label: "Anderson seasonal permit required for brush or rubbish burning",
    note: "Anderson Code §6.12.020 requires a permit from the city fire chief or council for brush or rubbish burning June 15 through September 15. Verify materials and any separate state permit with the city.",
    seasons: [["06-15", "09-15"]],
    review: html("article.fullDisplay p", "6.12.020 Open burning. No person shall burn brush", "6383d1148c0be254cdff8a869f48a342ae187be403e8595d4dd822a51c2ffa1f"),
  },
  {
    id: "denali-park-winter-fires", fips: ["02068", "02170"], stack: "National Park Service / PDF compendium",
    sourceName: "Denali National Park and Preserve", sourceUrl: DENALI_COMPENDIUM,
    officialUrl: `${DENALI_COMPENDIUM}#page=5`,
    scopeNote: "1980 Denali National Park and Preserve additions",
    label: "Denali park additions limit campfires to the April–September season",
    note: "The park superintendent’s compendium authorizes campfires in the 1980 additions from April 15 through September 30, except at Kantishna Airstrip. The former Mount McKinley National Park follows a separate schedule.",
    seasons: [["10-01", "04-14"]],
    review: { kind: "pdf-etag", etag: '"359e9c5ac62cdc1:0"' },
  },
  {
    id: "dillingham-open-burning", fips: "02070", stack: "eCode360", sourceName: "City of Dillingham",
    sourceUrl: "https://ecode360.com/47493138", officialUrl: "https://ecode360.com/47493138#47493143",
    scopeNote: "City of Dillingham", label: "Dillingham requires a permit for covered open burning",
    note: "Dillingham Code §11.12.050 requires a city permit for covered outdoor fires. Check the code and contact the fire department for exceptions and site requirements.",
    review: code(["47493143"], "ab8c22a5aba98c911e38f0ca03533e927063f62113dc7231194b2d23ba7c49bb"),
  },
  {
    id: "haines-fire-service-permit", fips: "02100", stack: "General Code / Borough Code", sourceName: "Haines Borough",
    sourceUrl: "https://hainesborough.borough.codes/HBC/15.08.080", scopeNote: "Haines Borough fire service areas",
    label: "Haines requires annual burn permits in fire service areas",
    note: "Haines Borough Code §15.08.080 requires an annual written permit for covered outdoor burning in fire service areas. Campfires and barbecue grills are exempt from this permit rule. Check with the district for permitted hours and current suspensions.",
    review: { kind: "html-blocks", section: 'article[data-cite="HBC 15.08.080"]', blocks: "p", digest: "9ccff28d87c4da22eb62f626cd490e8f432143bb5c0048dcd1d5b1c96984edbd" },
    reviewedAt: "2026-11-26T10:44:32.000Z",
  },
  {
    id: "hoonah-outdoor-waste", fips: "02105", stack: "eLaws / HTML municipal code", sourceName: "City of Hoonah",
    sourceUrl: "https://hoonah-ak.elaws.us/code/coor_title13_ch13.08_sec13.08.050", scopeNote: "City of Hoonah",
    label: "Hoonah requires fire chief approval for outdoor burning of combustible materials",
    note: "Hoonah Code §13.08.050 restricts outdoor burning of rubbish and other combustible materials to burns specially permitted by the fire chief.",
    review: html(".Hoonah_content p", "It is unlawful for any person to deposit refuse", "6d4b5da94b13695dbb4d056d85980de16616c40b31c5ae1c746a18fe03242383"),
  },
  {
    id: "pelican-outdoor-waste", fips: "02105", stack: "eCode360", sourceName: "City of Pelican",
    sourceUrl: "https://ecode360.com/44321935", officialUrl: "https://ecode360.com/44321935#44321940", scopeNote: "City of Pelican",
    label: "Pelican requires fire chief approval for outdoor burning of combustible materials",
    note: "Pelican Code §8.04.090(B) restricts outdoor burning of rubbish and other combustible materials to burns authorized by the fire chief.",
    review: code(["44321940"], "ef4d9b35ec6fe4a13330a89137fc6def1d00ce84b563281b667777ea05802677"),
  },
  {
    id: "juneau-burn-permit", fips: "02110", scope: "county", stack: "WordPress / Avada", sourceName: "Capital City Fire/Rescue",
    sourceUrl: JUNEAU_PERMITS, scopeNote: "Covered residential open burning in the City and Borough of Juneau",
    label: "Juneau requires a residential open-burning permit",
    note: "The borough requires a permit for residential open burning of eligible natural vegetation. Check the fire department’s separate restrictions by location, season and type of fire.",
    review: html("p", "A permit is required to be issued to any person wishing to engage in open burning on their property anywhere within the City and Borough of Juneau.", "ffdc08771ad3ed27ce091beef289ba78c0c5ab2587fdecefbbff37e9a505051f"),
  },
  {
    id: "juneau-residential-winter", fips: "02110", stack: "WordPress / Avada", sourceName: "Capital City Fire/Rescue",
    sourceUrl: JUNEAU_PERMITS, scopeNote: "Juneau’s Mendenhall Valley and Lemon Creek open-burn restriction zone",
    label: "Juneau winter restriction on residential open burning",
    note: "Capital City Fire/Rescue prohibits residential open burning in the designated Mendenhall Valley and Lemon Creek areas from October 1 through April 30. Check the city’s map for your address and the rules for other kinds of fires.",
    seasons: [["10-01", "04-30"]],
    review: html("p", "October 1 – April 30: All open burning is prohibited", "cda697b67b6b652e1d08c013cf2618742f8a2672af75d83464c5ec21cf4fa7e9"),
  },
  {
    id: "homer-burn-permit", fips: "02122", stack: "CivicPlus / Drupal 7", sourceName: "Homer Volunteer Fire Department",
    sourceUrl: "https://www.cityofhomer-ak.gov/fire/burn-permits", scopeNote: "City of Homer",
    label: "Homer requires open-burning permits year-round",
    note: "Get a city permit for covered open burning within Homer. The fire department lists separate limits for small camping, cooking and warming fires.",
    review: html('[property="content:encoded"] p', "Live Within City Limits?", "6f6967c6bd025606f9b2a67176185f0a0fb11328ef559cc7332299ac95495c07"),
  },
  {
    id: "kenai-burn-permit", fips: "02122", stack: "CivicPlus / Drupal", sourceName: "Kenai Fire Department",
    sourceUrl: "https://www.kenai.city/faqs", officialUrl: "https://www.kenai.city/fire/page/burn-permit",
    scopeNote: "City of Kenai", label: "Kenai requires a city permit for covered open burning",
    note: "The Kenai Fire Department issues permits for burning inside the city. Check its application and call 907-283-7666 for applicable conditions.",
    review: html("p", "Burning is allowed with a permit issued by the Kenai Fire Department.", "bbe1e8784218e0e43ec53964b1a99dcd16deae62335559bd3ce24339cf77c3eb"),
  },
  {
    id: "ketchikan-burn-permit", fips: "02130", stack: "EvoGov / HTML", sourceName: "Ketchikan Fire Department",
    sourceUrl: "https://www.ketchikan.gov/kfd-services", scopeNote: "City of Ketchikan",
    label: "Ketchikan requires a permit to burn natural vegetation",
    note: "City residents must arrange controlled burns of natural vegetation through Central Dispatch. Call 907-225-6631 for a permit and the city’s burn conditions.",
    review: html(".fr-view p", "Residents living inside the city limits may request burn permits", "61003ca64185d47f7c7b99161efd76810fb51ce98fdb1c4588857a33ead61c81"),
  },
  {
    id: "kodiak-road-burn-permit", fips: "02150", stack: "CivicPlus", sourceName: "Kodiak Island Borough Fire Protection",
    sourceUrl: "https://www.kodiakak.us/124/Burn-Permit-Regulations",
    scopeNote: "Kodiak Island Borough road system outside Kodiak city limits and Coast Guard property",
    label: "Kodiak Island Borough road-system burn permit required",
    note: "Borough Code Chapter 8.35 requires a permit to open burn on the covered road system. Kodiak city and Coast Guard property have their own permit issuers.",
    review: html(".fr-view p", "Kodiak Island Borough Code 8.35 requires", "64d53468a63500009cc90fa4406640e8db3e1d339f2b10a8f804dbc34b8e0eec"),
  },
  {
    id: "houston-open-burning", fips: "02170", stack: "eCode360", sourceName: "City of Houston",
    sourceUrl: "https://ecode360.com/49190287", scopeNote: "City of Houston, Alaska",
    label: "Houston limits open burn piles and requires a burn-barrel permit",
    note: "Houston Code Chapter 8.10 sets year-round open-burning and permit conditions. It generally limits open burn piles to five feet without approval and requires a state permit to use a burn barrel. Additional residential limits usually apply June 1–July 30, subject to fire chief amendments.",
    review: code(["49190302", "49190303", "49190315", "49190332"], "e165e978c08e74093f4af77538b7122038bb020d262a5dddc2e92a2283935bd6"),
  },
  {
    id: "utqiagvik-bonfires", fips: "02185", stack: "eCode360", sourceName: "City of Utqiaġvik",
    sourceUrl: "https://ecode360.com/47619695", scopeNote: "City of Utqiaġvik",
    label: "Utqiaġvik limits open burning and requires bonfire permits",
    note: "City Code Chapter 8.18 requires a bonfire permit and notice to the borough fire department. The city generally limits burning to designated beach areas and sets separate conditions for special events.",
    review: code(["47619696", "47619697", "47619700", "47619701"], "06dad7a750af7f576c8cf9c68f1314ef004a93589dacbbfbe84ba5f458d48286"),
  },
  {
    id: "petersburg-burn-permit", fips: "02195", stack: "CivicPlus / Drupal 7", sourceName: "Petersburg Fire Department",
    sourceUrl: "https://www.petersburgak.gov/publicsaf/webform/burn-permit-required-open-burning",
    scopeNote: "Petersburg Borough Service Area One", label: "Petersburg Service Area One requires an open-burning permit",
    note: "The Petersburg Fire Department issues permits for covered burns in Service Area One. Check its exceptions, prohibited districts and current restrictions before burning.",
    review: html('[property="content:encoded"] p', "A permit is required to be issued to any person wishing to engage in open burning on their property within Service Area One", "3af49c01c795bb6105e27ed0f9f3049bae5db08db54fb7d0e9c044b9c9c57ec8"),
  },
  {
    id: "craig-open-burning", fips: "02198", stack: "eCode360", sourceName: "City of Craig",
    sourceUrl: "https://ecode360.com/51901371", officialUrl: "https://ecode360.com/51901371#51901389", scopeNote: "City of Craig",
    label: "Craig requires fire chief approval for substantial or smoky open burns",
    note: "Craig Code §8.06.050 requires fire chief approval before open burning that disposes of substantial material or may produce significant smoke. The code has separate conditions for small cooking, warming and social fires.",
    review: code(["51901389"], "5cbeab809fddcdfd6ecb6b92a9dc74051e6c1783eb8130d550a6cd75d03d9b91"),
  },
  {
    id: "sitka-burn-permit", fips: "02220", stack: "Granicus / OpenCities", sourceName: "Sitka Fire Department",
    sourceUrl: "https://www.cityofsitka.com/Government/City-Departments/Fire-Department/Burn-Permits",
    scopeNote: "Sitka Fire Department jurisdiction", label: "Sitka Fire Department requires an open-burning permit",
    note: "Get a permit from the Sitka Fire Department before covered open burning. The department requires an attended fire with water nearby. Call 907-747-3233.",
    review: html("#main-content p", "The Sitka Fire Dept. requires residents to obtain a burn permit", "f336724546c33bad4094802ad843f9056ff073d0f39872e97de5d362bd964511"),
  },
  {
    id: "skagway-burn-permit", fips: "02230", scope: "county", stack: "Squarespace", sourceName: "Skagway Fire Department",
    sourceUrl: SKAGWAY_PERMITS, scopeNote: "Open ground fires in the Municipality of Skagway",
    label: "Skagway requires a permit for open ground fires",
    note: "Get a municipal permit before open burning on the ground. Check Skagway Fire for qualifying grills and fire pits, permit suspensions and additional bans during Red Flag Warnings.",
    review: html("p", "The Municipality of Skagway requires burn permits before open burning occurs.", "61553e2c053f0ca63b7703b6b6edfe393efd3929188248ac274249bed98a5636"),
  },
  {
    id: "wrangell-open-burning", fips: "02275", scope: "county", stack: "eCode360", sourceName: "City and Borough of Wrangell",
    sourceUrl: "https://ecode360.com/46986927", scopeNote: "Open burns governed by Wrangell’s municipal fire code",
    label: "Wrangell retains a permit requirement for covered open burning",
    note: "Wrangell Code §18.16.060 retains the fire code permit requirement for open burning. Consult the borough fire department for the activities covered and current conditions.",
    review: code(["46986927"], "6553171701211fc7605146c788887ffd361b621bd918f7ab414bb1a02f0b57f7"),
  },
];

export const akLocalRules = rules.map(({ id, fips, stack, scope = "part", sourceName, sourceUrl,
  officialUrl = sourceUrl, review, reviewedAt, ...rule }) => {
  const countyFips = typeof fips === "string" ? [fips] : fips;
  const counties = countyFips.map((code) => {
    const county = COUNTY_BY_FIPS.get(code);
    if (county?.state !== "AK") throw new Error(`Unknown Alaska FIPS ${code}`);
    return county;
  });
  // Use two existing Alaska poll slots and leave room for the statewide sources in each group.
  const early = countyFips[0] <= "02105" || id === "juneau-burn-permit";
  const pollGroup = early ? AK_CALENDAR_POLL_GROUP : AK_PERMIT_POLL_GROUP;
  const { source, parse } = reviewedLocalCalendar({
    publisher: { id: `ak-${id}`, state: "AK", scope, stack, sourceName, sourceUrl, officialUrl },
    counties, rule, review, reviewedAt, zone: US_ZONES.Alaska, hour: early ? 1 : 6, standing: true,
  });
  const extension = review.kind === "pdf-etag" ? "headers.json" : review.kind === "pdf" ? "pdf.gz" : "html";
  return { source: { ...source, pollGroup, reportingFips: countyFips }, parse, fixture: `${id}.${extension}` };
});
