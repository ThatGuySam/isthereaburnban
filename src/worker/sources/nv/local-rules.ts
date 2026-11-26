import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";
import type { ActiveSource } from "../types";

type Area = { county: string; scopeNote?: string };
type LocalRule = LocalCalendarRule & Pick<ActiveSource, "stack" | "sourceName" | "sourceUrl"> & {
  id: string;
  areas: readonly [Area, ...Area[]];
  officialUrl?: string;
  fixture: string;
  evidence: LocalCalendarEvidence;
};

const rules: readonly LocalRule[] = [
  {
    id: "clark-open-burning", areas: [{ county: "Clark" }],
    stack: "Adobe AEM / HTML", sourceName: "Clark County Division of Air Quality",
    sourceUrl: "https://www.clarkcountynv.gov/government/departments/environment_and_sustainability/division_of_air_quality/permitting/applications_forms/open-burning-forms",
    scopeNote: "Open burning subject to Clark County air-quality rules",
    label: "Clark County limits open burning and requires advance approval",
    note: "Air Quality Regulation 42 restricts open burning. For covered burns, get advance approval from the air-quality division and a permit from your fire department. Private cooking grills and similar cooking fires are exempt.",
    fixture: "clark-open-burning.html",
    evidence: { kind: "html-blocks", section: "main .rightsection", blocks: "p", digest: "6dcaecbc13d4c4022beb06f04850ab5a7ee0b484c79226beaa8ff3e84181fee6" },
  },
  {
    id: "east-fork-burning-permits", areas: [{ county: "Douglas" }],
    stack: "Wix / HTML", sourceName: "East Fork Fire Protection District",
    sourceUrl: "https://www.eastforkfire.org/fire-prevention",
    scopeNote: "Covered outdoor fires in East Fork Fire Protection District",
    label: "East Fork Fire District requires an open-burning permit",
    note: "The district requires a permit for covered open-flame burns. It handles recreational, ceremonial and agricultural permits separately. For seasonal pile burning, check the daily burn line at 775-783-6497.",
    fixture: "east-fork-permits.html",
    evidence: { kind: "html-blocks", section: "#comp-mkuo1vgk5", blocks: "p", digest: "c7c560692cacabf75774c8630e87c09860ca01bdc2da72a7a49ec7ba1c0334ad" },
  },
  {
    id: "tahoe-douglas-burning-permits", areas: [{ county: "Douglas" }],
    stack: "WordPress / Divi HTML", sourceName: "Tahoe Douglas Fire Protection District",
    sourceUrl: "https://tahoefire.org/prevention/burning-regulations/",
    scopeNote: "Residential green-waste burning in Tahoe Douglas Fire Protection District",
    label: "Tahoe Douglas Fire District limits residential green-waste burning",
    note: "Green-waste burning requires an on-site evaluation and permit. The district offers burning in spring and fall when conditions allow. Contact the district for current conditions.",
    fixture: "tahoe-douglas-permits.html",
    evidence: { kind: "html", selector: ".et_pb_text_1 .et_pb_text_inner", digest: "3e9dc970a34c79f4936c0e2e0f8d35f65ff53c8275cb6ffa118b8c99f583218d" },
  },
  {
    id: "elko-district-burning-permits", areas: [{ county: "Elko" }],
    stack: "Revize / district PDF", sourceName: "Elko County Fire Protection District",
    sourceUrl: "https://cms2.revize.com/revize/elkocounty/departments/Fire/2025/Open%20Burning%20Oct%202025.pdf?t=202509301443140",
    officialUrl: "https://www.elkocountynv.gov/your_services_2/forms_center.php#outer-4734",
    scopeNote: "Private-land vegetation piles in unincorporated Elko County Fire Protection District",
    label: "Elko County Fire Protection District requires a burn permit",
    note: "The fire district requires a valid permit for open vegetation burning. Check the online permit service or call the district at 775-738-9960 for daily conditions.",
    fixture: "elko-permit-policy.pdf",
    evidence: { kind: "pdf", digest: "94387c88c52c98efc503a44d40cadbbeced0e162808c575c0f2d98494f6e7e00" },
  },
  {
    id: "lincoln-burning-permits", areas: [{ county: "Lincoln" }],
    stack: "WordPress / Elementor HTML", sourceName: "Lincoln County Emergency Management",
    sourceUrl: "https://lincolncountynv.org/departments/emergency-manager/burning-permits/",
    scopeNote: "Open burning handled by Lincoln County's local fire districts",
    label: "Lincoln County requires a permit for open burning",
    note: "Get a permit from the fire district for your address before burning weeds, limbs or other covered material. The county lists contacts for each district, which sets its own burn schedule.",
    fixture: "lincoln-burning-permits.html",
    evidence: { kind: "html", selector: "section.content-section:not(.is-alt) > p", startsWith: "There is a requirement to obtain a burning permit", digest: "104cfb15d398ff8928cbd3f547290b2d00f3423c93301b96351d3b9f62d86f93" },
  },
  {
    id: "central-lyon-permit-season", areas: [{ county: "Lyon" }],
    stack: "Streamline / HTML", sourceName: "Central Lyon County Fire Protection District",
    sourceUrl: "https://www.centrallyonfire.org/burn-season-2026-2027",
    scopeNote: "Residential debris burning in Central Lyon County Fire Protection District",
    label: "Central Lyon Fire District requires a residential burn permit",
    note: "The district's 2026–27 residential season began on October 31. Apply through Community Connect and check for address-specific closures and weather conditions before burning.",
    effectiveDates: ["2026-10-31", "2027-05-25"],
    fixture: "central-lyon-permit-season.html",
    evidence: { kind: "html-blocks", section: "article#poc", blocks: "header h2, .body p", digest: "7bfaa73b43c4c0854e8e776dae90ac5fd1d62aab812fec7fa44637fe7f5c2709" },
  },
  {
    id: "north-lyon-permit-season", areas: [{ county: "Lyon" }],
    stack: "Wix / public permit form", sourceName: "North Lyon County Fire Protection District",
    sourceUrl: "https://www.northlyonfire.com/residential-burn-permit",
    scopeNote: "Residential debris burning in the North Lyon fire district's Fernley service area",
    label: "North Lyon Fire District residential burn permit season",
    note: "The district publishes a residential burn permit for October 1, 2026 through May 31, 2027. Confirm the permit conditions and daily restrictions with the district.",
    effectiveDates: ["2026-10-01", "2027-05-31"],
    fixture: "north-lyon-residential-permit.html",
    evidence: { kind: "html", selector: "p#viewer-bshjs63", digest: "62bd758ac4a08234aae8568c5c4e6f0e8000b97f53686af0a252d310a61e444f" },
  },
  {
    id: "mineral-burning-permits", areas: [{ county: "Mineral" }],
    stack: "Revize / HTML", sourceName: "Mineral County Fire Department",
    sourceUrl: "https://www.mineralcountynv.us/departments/emergency_services/fire/burn_permits.php",
    scopeNote: "Open burning served by Mineral County Fire Department",
    label: "Mineral County Fire Department requires a signed burn permit",
    note: "Mineral County Code §2.56.070 requires a signed permit for covered burns. The fire department gives the daily decision at 775-945-2497. Mina and Luning have separate burning hours.",
    fixture: "mineral-burn-permit.html",
    evidence: { kind: "html-blocks", section: "#post", blocks: "#post > span", digest: "5f49046b88e82a60e4fd42c456c3743b66a745303b4364cabcb43966cf33587e" },
  },
  {
    id: "pahrump-residential-burning", areas: [{ county: "Nye" }],
    stack: "CivicPlus / HTML", sourceName: "Pahrump Valley Fire & Rescue",
    sourceUrl: "https://www.pahrumpnv.gov/317/Residential-Burn-Permits",
    scopeNote: "Residential yard-waste burning in the Town of Pahrump",
    label: "Pahrump limits residential yard-waste burning to its permit season",
    note: "Pahrump publishes a November 1–May 15 season. A permit and same-day notification are required, and local hour, wind and holiday restrictions apply.",
    fixture: "pahrump-residential-burning.html",
    evidence: { kind: "html-blocks", section: "#divEditor9bf97ea8-2164-49a1-ba8f-d2622ef35c32 .fr-view", blocks: "h1, p, li", digest: "53ab2a75cf64ee9ccff59942788e342d324d37369fe00925350f58ad961850e1" },
  },
  {
    id: "storey-burning-permits", areas: [{ county: "Storey" }],
    stack: "District PHP / HTML permit form", sourceName: "Storey County Fire Protection District",
    sourceUrl: "https://storeyfire.org/programs/burn-permits.php",
    scopeNote: "Open burning regulated by the Storey County Fire Protection District",
    label: "Storey County Fire District limits open burning to designated areas and winter permits",
    note: "The district issues winter permits for covered burns in Mark Twain Estates and Painted Rock in Storey County. Call Station 71 at 775-847-0954 for the daily decision before burning.",
    fixture: "storey-permits.html",
    evidence: { kind: "html-blocks", section: "#burn-permits-content", blocks: ".container > p, .form-question > p", digest: "02969bfa9ec305beb6a1d62c9c77bcec89b129f74762bee23fc677adcd5b9255" },
  },
  {
    id: "white-pine-burning-permits", areas: [{ county: "White Pine" }],
    stack: "CivicPlus DocumentCenter / signed ordinance PDF", sourceName: "White Pine County Fire Protection District",
    sourceUrl: "https://www.whitepinecounty.net/DocumentCenter/View/8503/1c1",
    scopeNote: "Permit-required open burning under the White Pine County Fire Protection District",
    label: "White Pine County limits open burning to its permit season",
    note: "County Ordinance 531 sets November 1–April 30 as the normal season for permit-required burns. Additional permit, inspection and location requirements apply. Check with the district for small-fire exceptions and current closures.",
    fixture: "white-pine-ordinance-531.pdf",
    evidence: { kind: "pdf", digest: "34a70caf0d6100169b4d8e0709732a78bacc4a93cf6195702efd9c7192178a98" },
  },
  {
    id: "ely-open-burning", areas: [{ county: "White Pine" }],
    stack: "City HTML / PDF", sourceName: "City of Ely Fire Department",
    sourceUrl: "https://www.cityofelynv.gov/pdf/Forms/Cityofely_openburnpermit.pdf",
    scopeNote: "Covered open burning within Ely city limits",
    label: "Ely Fire Department requires an open-burning permit",
    note: "The City of Ely permit applies only inside city limits, is valid for the issued dates after inspection, and can be suspended by the Fire Chief.",
    fixture: "ely-open-burn-permit.pdf",
    evidence: { kind: "pdf", digest: "caa2940c38cf548beafe5045e78e10e1e6d71932669484c1c2ceac86b87f3d16" },
  },
  {
    id: "north-lake-tahoe-burning-permits", areas: [{ county: "Washoe" }],
    stack: "Joomla / YOOtheme HTML", sourceName: "North Lake Tahoe Fire Protection District",
    sourceUrl: "https://nltfpd.org/en-us/outdoor-burning",
    scopeNote: "Outdoor burning in the Nevada North Lake Tahoe Fire Protection District",
    label: "North Lake Tahoe Fire District requires an operational burn permit",
    note: "The district requires an operational burn permit for covered recreational fires, gas fire pits and open pile burning. Check the district's burn status for temporary restrictions.",
    fixture: "north-lake-tahoe-permits.html",
    evidence: { kind: "html", selector: "#article-8 [property=text] > p", startsWith: "All recreational fires", digest: "d75577c5a0c6c49fd1a365864db2f984b6622409c209391e7e85701548721aa9" },
  },
  {
    id: "named-residential-burning-areas",
    areas: [
      { county: "Carson City", scopeNote: "Single-family residences within the consolidated municipality of Carson City" },
      { county: "Churchill", scopeNote: "Single-family residences in or within one mile of Fallon" },
      { county: "Humboldt", scopeNote: "Single-family residences in or within one mile of Winnemucca" },
      { county: "Lander", scopeNote: "Single-family residences in or within one mile of Battle Mountain" },
      { county: "Pershing", scopeNote: "Single-family residences in or within one mile of Lovelock" },
    ],
    stack: "Nevada Legislature / codified HTML", sourceName: "Nevada Division of Environmental Protection",
    sourceUrl: "https://www.leg.state.nv.us/NAC/NAC-445B.html#NAC445BSec22067",
    scopeNote: "Single-family residences in places named by NAC 445B.22067",
    label: "Open burning at covered residences requires authorization",
    note: "NAC 445B.22067(2)(e) requires authorization from a state or local officer and concurrence from the state environmental director. Local rules may prohibit a burn. Small recreational, educational, ceremonial, heating or cooking wood fires have a separate provision.",
    fixture: "nac-designated-areas.html",
    evidence: {
      kind: "html-anchors", startAnchor: "NAC445BSec22067", endAnchor: "NAC445BSec2207", encoding: "windows-1252", digest: "1d94540bea8bd67009720041fe5c58e9e5a62e50a99e26ec2938d7fd4b4a21ed",
    },
  },
];

export const nvLocalBurningRules = rules.map(({ id, areas, sourceName, sourceUrl, officialUrl = sourceUrl, stack, fixture, evidence, ...rule }) => {
  const counties = areas.map(({ county: name, scopeNote }) => {
    const county = countyByName("NV", name);
    if (!county) throw new Error(`Unknown Nevada county: ${name}`);
    return { fips: county.fips, name: county.name, scopeNote };
  });
  const { source, parse } = reviewedLocalCalendar({
    publisher: { id: `nv-${id}`, state: "NV", scope: "part", stack, sourceName, sourceUrl, officialUrl },
    counties, rule, review: evidence, zone: US_ZONES.Pacific, hour: 5, standing: true,
  });
  // Keep the long NAC chapter on its own job and split ordinary pages from the larger documents.
  const usesDocumentGroup = evidence.kind === "pdf" || stack.startsWith("Wix /");
  const pollGroup = evidence.kind === "html-anchors" ? undefined : usesDocumentGroup ? "nv-permit-documents" : "nv-permit-pages";
  return { source: { ...source, pollGroup, reportingFips: counties.map(({ fips }) => fips) }, parse, fixture };
});
