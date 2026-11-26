import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";

type ReviewedRule = LocalCalendarRule & {
  id: string;
  counties: readonly string[];
  scope?: "county" | "part";
  stack: string;
  sourceName: string;
  sourceUrl: string;
  officialUrl?: string;
  review: LocalCalendarEvidence;
  zone?: string;
};

const rules: readonly ReviewedRule[] = [
  {
    id: "beadle-notification", counties: ["Beadle"], scopeNote: "Unincorporated Beadle County",
    stack: "CivicPlus / Alert Center ordinance", sourceName: "Beadle County Emergency Management",
    sourceUrl: "https://beadlesd.org/AlertCenter.aspx?AID=9",
    label: "Notify dispatch before and after covered burns",
    note: "Beadle County Ordinance 15-59 requires notice to Huron dispatch before and after covered open burning. A Fire Weather Watch, Red Flag Warning or qualifying Grassland Fire Danger rating can activate a separate ban.",
    review: { kind: "html", selector: ".singleAlert > .alert.on > p", startsWith: "Report Controlled Burns",
      digest: "f40e8deae25c18c4f57b8bdebeef449625b7c93bc365376fc2e58a9e104f6df9" },
  },
  {
    id: "brookings-city-controlled-burn", counties: ["Brookings"], scopeNote: "City of Brookings",
    stack: "CivicPlus / fire department HTML", sourceName: "Brookings Fire Department",
    sourceUrl: "https://cityofbrookings-sd.gov/241/Controlled-Burns",
    label: "Notify dispatch when a controlled burn starts and ends",
    note: "The city fire department requires a dispatch call when a controlled burn starts and ends. Check local ban and permit requirements before burning.",
    review: { kind: "html", selector: "#divEditor26e3adc0-a872-4078-9d33-142976737731 .fr-view ul > li", startsWith: "Call (605) 692-2113",
      digest: "972bf1cbd793237e25f24d3c83e329c33532d30e35f6fac49943cfd3945d1860" },
  },
  {
    id: "brown-controlled-burn", counties: ["Brown"], scope: "county", scopeNote: "Covered controlled burns in Brown County",
    stack: "Drupal / county code PDF", sourceName: "Brown County",
    sourceUrl: "https://brown.sd.us/sites/default/files/2024-04/2021t18fire_safety.pdf",
    officialUrl: "https://brown.sd.us/ordinances",
    label: "Notify dispatch before and after covered land burns",
    note: "Brown County Code §18.03 requires notice to the county communications center before and after burning covered land or materials. §18.06 lists a household and yard-waste exception. Check separate weather and emergency restrictions.",
    review: { kind: "pdf", digest: "04b0f189e71671cb471a132be34b8cf0e3de317cb983a5e17daac103a42f0e7c" },
  },
  {
    id: "brule-burn-plan", counties: ["Brule"], scopeNote: "Unincorporated Brule County",
    stack: "Wix / emergency management HTML", sourceName: "Brule County Emergency Management",
    sourceUrl: "https://www.brulecounty.gov/emergency-management-1",
    label: "File a burn plan before covered burning",
    note: "Brule County Emergency Management directs residents to file a burn plan with the emergency manager before burning. Consult the county for the plan and applicable emergency restrictions.",
    review: { kind: "html", selector: "#comp-lkk4rmd9 h2", startsWith: "Brule County asks",
      digest: "20a3c82047ea1902520ea6e3c3778784e61e58b00c4e0e824dd161ef1e0db1fe" },
  },
  {
    id: "butte-open-burn-permit", counties: ["Butte"],
    scopeNote: "Unincorporated Butte County outside state and federal lands",
    stack: "WordPress / fire department ordinance HTML", sourceName: "Belle Fourche Volunteer Fire Department",
    sourceUrl: "https://www.bfvfd.org/195-2/",
    label: "Fire department approval required for covered open burning",
    note: "The county ordinance requires approval from the fire department serving the burn site. It lists conditions and exceptions for designated fire pits.",
    review: { kind: "html", selector: "#post-195 .bge-entry-content", startsWith: "Butte County Ordinance to Regulate Open Burning",
      digest: "84de70c16536b742f09c6322ba92ff84b2bca10eca7ac2bacb1720178b283f88" },
    zone: US_ZONES.Mountain,
  },
  {
    id: "clay-open-burning", counties: ["Clay"], scopeNote: "Unincorporated Clay County",
    stack: "ColdFusion / signed ordinance PDF", sourceName: "Clay County",
    sourceUrl: "https://www.claycountysd.org/userfiles/files/Ordinances/2026-06%20Burn%20Ban.pdf",
    officialUrl: "https://www.claycountysd.org/claycountyordinances.cfm",
    label: "Notify dispatch before covered open burning",
    note: "Ordinance 2026-06 requires an adult to notify the Clay County Communications Center before covered open burning. It has separate rules for recreational fires, burn barrels, cooking appliances and fire danger emergencies.",
    review: { kind: "pdf-etag", etag: '"106d3f8ba934dd1:0"' },
  },
  {
    id: "day-controlled-burn", counties: ["Day"], scopeNote: "Unincorporated Day County",
    stack: "Weebly / county ordinance PDF", sourceName: "Day County Sheriff's Office",
    sourceUrl: "https://www.daycountysheriff.org/uploads/3/4/0/7/34070954/day_county_open_burning_ordinance_.pdf",
    officialUrl: "https://www.daycountysheriff.org/index.html",
    label: "Notify county dispatch before covered controlled burning",
    note: "Day County Ordinance 2024-2 requires advance notice for covered controlled burns when open burning is allowed. Small fires listed in the ordinance have exceptions. A declared fire danger emergency requires a written permit.",
    review: { kind: "pdf", digest: "ec04f41335b964f426c0b83f78793fe083a6f79dde1d171c3fa9dff1dd317640" },
  },
  {
    id: "hayti-fire-pits", counties: ["Hamlin"], scopeNote: "City of Hayti",
    stack: "City ordinance PDF", sourceName: "City of Hayti",
    sourceUrl: "https://haytisd.com/pdf/ordinances/ORDINANCE-306-Fire-Pit-Regulations.pdf",
    officialUrl: "https://haytisd.com/ordinances/",
    label: "City fire pits limited by fuel, location and hours",
    note: "Hayti Ordinance 306 limits fire pit fuels and locations. Outdoor burning from 2 a.m. to 7 a.m. requires prior city approval.",
    review: { kind: "pdf", digest: "b0020ccf951e9c45882e403c6c02548304b66fc8bb69522d6e5d1efd8044cea4" },
  },
  {
    id: "hughes-controlled-burn", counties: ["Hughes"], scopeNote: "Covered rural burns in Hughes County",
    stack: "Munibit / ordinance HTML", sourceName: "Hughes County",
    sourceUrl: "https://hughescounty.org/controlledburn",
    label: "Notify dispatch before and after controlled burning",
    note: "Hughes County Ordinance 2002-7 requires notice to Pierre Police Dispatch before and after a controlled burn. County emergency management lists additional weather-triggered bans.",
    review: { kind: "html", selector: '.sectionItem[data-rid="idHbOlA/412dVjBIRiuGLw=="] > div > div', startsWith: "AN ORDINANCE ESTABLISHING A NOTIFICATION SYSTEM",
      digest: "ec7b2e132506386d5ee6673dd01aaeafa77281a7901b5c6ad02565825cb9869d" },
  },
  {
    id: "hutchinson-notification", counties: ["Hutchinson"], scopeNote: "Unincorporated Hutchinson County",
    stack: "Revize / enacted ordinance PDF", sourceName: "Hutchinson County",
    sourceUrl: "https://webgen1files1.revize.com/hutchinsoncntysd/ORDINANCE%20NO%202025-001.pdf?t=202510060945290",
    officialUrl: "https://www.hutchinsoncountysd.gov/how_do_i/ordinances.php",
    label: "Notify dispatch before covered open burning",
    note: "Ordinance 2025-001 requires reporting covered open burning to dispatch in advance. The county lists an exception for qualifying containers and uses its website banner to announce emergency bans.",
    review: { kind: "pdf", digest: "0e4d57bd5be56a0ffab10260b54fbfc973c1c59ae92073bb7f459eac0a9df5cc" },
  },
  {
    id: "madison-open-burning", counties: ["Lake"], scopeNote: "City of Madison",
    stack: "CivicPlus / city code PDF", sourceName: "City of Madison",
    sourceUrl: "https://www.cityofmadisonsd.gov/DocumentCenter/View/239/Chapter-09---Garbage-and-Trash-PDF",
    label: "City prohibits refuse burning and regulates recreational fires",
    note: "Madison Code §9-11 prohibits burning except as authorized by ordinance and specifically prohibits burning refuse. Qualifying recreational fires and approved enclosed incinerators are subject to separate conditions.",
    review: { kind: "pdf", digest: "3f8bd36f9535525d6d3789001937f133486b7083e80ee4db53baa4e436c07686" },
  },
  {
    id: "mccook-controlled-burn", counties: ["McCook"], scopeNote: "Unincorporated McCook County",
    stack: "Wix / ordinance PDF", sourceName: "McCook County Emergency Management",
    sourceUrl: "https://www.mccookcountyem.com/_files/ugd/bc65c1_0be4f70bbd30462b95fe17f8d23022b7.pdf",
    officialUrl: "https://www.mccookcountyem.com/open-burning",
    label: "Notify emergency management or dispatch before a controlled burn",
    note: "Ordinance 2022-01 requires advance notification for a controlled burn. A Red Flag Warning or a Very High or Extreme Grassland Fire Danger rating can prohibit burning.",
    review: { kind: "pdf", digest: "9abe8d0dd6edc325113c1de3d4bfe0b454922a202e62edbab3805e36c93af497" },
  },
  {
    id: "miner-notification", counties: ["Miner"], scopeNote: "Unincorporated Miner County",
    stack: "County CMS / ordinance HTML", sourceName: "Miner County",
    sourceUrl: "https://miner.sdcounty.gov/firedanger/",
    label: "Notify dispatch before covered open burning",
    note: "Ordinance 2024-04 requires advance notice to Miner County Dispatch when covered burning is permitted. The county publishes separate triggers and exceptions for emergency restrictions.",
    review: { kind: "html", selector: ".homeContent > p", startsWith: "C. During a time when open burn is permitted",
      digest: "bc7d664ae4abf9088d2fc53c72f7710f1da16ead8d8adacfdcd3216d81b207d4" },
  },
  {
    id: "mobridge-controlled-burn", counties: ["Walworth"], scopeNote: "City of Mobridge in Walworth County",
    stack: "Municipal code PDF", sourceName: "City of Mobridge",
    sourceUrl: "https://mobridge.org/ufile-city/f1/City_Ordinances/Title_4.pdf",
    officialUrl: "https://mobridge.org/ordinances",
    label: "Fire chief permit required for covered burning",
    note: "Mobridge Code §4-1-5 requires a permit and the fire chief's consent for covered burns. The code lists exceptions for certain appliances and addresses the surrounding three-mile jurisdiction.",
    review: { kind: "pdf", digest: "e68029969034921e7dc73d2a78c3f465cbb85bd034785ffe6cb8aa24bc10e5df" },
  },
  {
    id: "parker-open-burning", counties: ["Turner"], scopeNote: "City of Parker",
    stack: "GovOffice / municipal code PDF", sourceName: "City of Parker",
    sourceUrl: "https://www.parkersd.org/vertical/sites/%7B9B4B127D-F483-4D4D-AA0E-E3F21E90AE9E%7D/uploads/Updated_Municipal_Ordinances.pdf",
    officialUrl: "https://www.parkersd.org/index.asp?SEC=DBF9F9A2-A1F0-4302-8AA0-E44252BCF4DF&Type=B_BASIC",
    label: "Open burning of waste restricted",
    note: "Parker's published code limits open burning of garbage, waste and refuse to specified exceptions. Check the city's nuisance and fire rules for the planned activity.",
    review: { kind: "pdf-etag", etag: '"015afc9626ed11:0"' },
  },
  {
    id: "sioux-falls-burning", counties: ["Minnehaha", "Lincoln"], scopeNote: "City of Sioux Falls",
    stack: "OpenCities / fire department HTML", sourceName: "Sioux Falls Fire Rescue",
    sourceUrl: "https://www.siouxfalls.gov/health-safety/fire/community-programs-and-safety/open-burning",
    label: "City permit required for bonfires and listed open burning",
    note: "Sioux Falls requires a permit for bonfires and listed management or pest-control burns. Qualifying small recreational fires follow the city's placement, fuel and supervision rules.",
    review: { kind: "html-heading", selector: "#main-content", heading: "Open Burning & Recreational Fires",
      digest: "f3191405e4dac264973ae20786ac7fd8449a62070b315bbfc0e57ccfc31b8f54" },
  },
  {
    id: "sturgis-open-burning", counties: ["Meade"], scopeNote: "City of Sturgis",
    stack: "EvoGov / fire department FAQ", sourceName: "City of Sturgis",
    sourceUrl: "https://www.sturgis-sd.gov/faq",
    label: "City generally prohibits open burning",
    note: "The city generally prohibits open burning and refers applicants for special permits to the City Council.",
    review: { kind: "html", selector: "#faq150657entry p", startsWith: "Yes. In general, open burning is not permitted in the City",
      digest: "56cc2726735798e99756d7086091323eb887312a5b74c3897c870e0fed15c599" },
    zone: US_ZONES.Mountain,
  },
  {
    id: "watertown-permit", counties: ["Codington"], scopeNote: "City of Watertown",
    stack: "CivicPlus / fire code PDF", sourceName: "Watertown Fire Rescue",
    sourceUrl: "https://www.watertownsd.gov/DocumentCenter/View/314/Open-burning-and-fireworks-permit",
    officialUrl: "https://www.watertownsd.gov/305/Fire-Prevention",
    label: "City permit required for covered open burning",
    note: "Watertown Code §13.0316 requires a fire chief permit for covered open burning. Qualifying recreational fires follow separate size, placement, equipment and supervision rules.",
    review: { kind: "pdf", digest: "a7e691a30cdff9ea04a10e72da7ad045449d74d7833f130b13fa940ef3912faf" },
  },
];

export const sdLocalBurnRules = rules.map(({
  id, counties, scope = "part", stack, sourceName, sourceUrl, officialUrl = sourceUrl, review, zone = US_ZONES.Central, ...rule
}, index) => {
  const areas = counties.map((name) => {
    const county = countyByName("SD", name);
    if (!county) throw new Error(`Unknown South Dakota burning rule county: ${name}`);
    return county;
  });
  const { source, parse } = reviewedLocalCalendar({
    publisher: { id: `sd-${id}`, state: "SD", scope, stack, sourceName, sourceUrl, officialUrl },
    counties: areas, rule, review, zone, hour: 3 + index % 6, standing: true,
  });
  return {
    source: { ...source, reportingFips: areas.map(({ fips }) => fips) },
    parse,
    fixture: `${id}.${review.kind === "pdf-etag" ? "headers.json" : review.kind === "pdf" ? "pdf" : "html"}`,
  };
});
