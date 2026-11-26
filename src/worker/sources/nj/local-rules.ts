import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";

type ReviewedRule = LocalCalendarRule & {
  id: string;
  county: string;
  sourceName: string;
  sourceUrl: string;
  officialUrl?: string;
  stack: string;
  review: LocalCalendarEvidence;
};

const ecode360 = "eCode360 / codified ordinance";
const rules: readonly ReviewedRule[] = [
  {
    id: "atlantic-county-parks", county: "Atlantic", scopeNote: "Atlantic County parks",
    stack: ecode360, sourceName: "Atlantic County",
    sourceUrl: "https://ecode360.com/8929971",
    label: "Park fires limited to designated areas",
    note: "Atlantic County Code § 97-21 limits fires to designated areas in county parks and requires attendance by a responsible person age 16 or older.",
    review: { kind: "html-ecode360", sections: ["8929971"],
      digest: "6bb17e8707cae506d8017ab44fc3b9d606c776c7e6961511bb1458a607dfe8d7" },
  },
  {
    id: "bergen-county-parks", county: "Bergen", scopeNote: "Bergen County park system",
    stack: "WordPress / park ordinance PDF", sourceName: "Bergen County Department of Parks",
    sourceUrl: "https://bergencountynj.gov/wp-content/uploads/2026/04/Parks-ordinance-25-45-2026.pdf",
    officialUrl: "https://bergencountynj.gov/bergen-county-department-of-parks/parks-ordinances/",
    label: "County park cooking fires limited to designated sites",
    note: "Bergen County Ordinance 25-45 limits outdoor cooking to designated picnic and campsite facilities and lists park-specific exceptions. The camping rules require a Fire Warden permit and approved fireplace for covered campfires.",
    review: { kind: "pdf-etag", etag: '"69f262cb-a61ee1"' },
  },
  {
    id: "burlington-county-parks", county: "Burlington", scopeNote: "Burlington County park system",
    stack: "CivicPlus / park rules PDF", sourceName: "Burlington County Board of County Commissioners",
    sourceUrl: "https://www.burlingtoncountynj.gov/DocumentCenter/View/4781",
    label: "Park fires limited to designated fire rings, fireplaces and grills",
    note: "Park Rule 29 limits fires to designated fireplaces, fire rings and grills. The park rule also requires compliance with any temporary fire restrictions.",
    review: { kind: "pdf",
      digest: "0e63d77e6b7f3c29b3166547a389105d7251a8a1cd15baf82b98b3bdcb730306" },
  },
  {
    id: "camden-pennsauken-burning", county: "Camden", scopeNote: "Township of Pennsauken",
    stack: ecode360, sourceName: "Township of Pennsauken",
    sourceUrl: "https://ecode360.com/30413628",
    officialUrl: "https://ecode360.com/30413628#11308001",
    label: "Open burning restricted and patio wood fires require a permit",
    note: "Pennsauken Code § 162-16 prohibits outdoor burning outside its listed exceptions and requires a Fire Official permit for patio wood-burning units, including covered fire pits. It also lists cooking exemptions and separate rules for multifamily buildings.",
    review: { kind: "html-ecode360", sections: ["11308001"],
      digest: "07ca6fbec6f2ec9e03a0f1c31046c5db88ca49a798f03de0b209a7d91b9a3f27" },
  },
  {
    id: "cape-may-ocean-city-burning", county: "Cape May", scopeNote: "Ocean City",
    stack: "EvoGov / fire department FAQ", sourceName: "Ocean City Fire and Rescue Services",
    sourceUrl: "https://www.ocnj.us/departments/fire/FireandRescueServices",
    label: "Public-property fires prohibited and bonfires require approval",
    note: "The Ocean City fire department prohibits open burning on public property, including beaches, and requires fire officials' permission for any bonfire. Its guidance also prohibits burning waste vegetation.",
    review: { kind: "html", selector: "#faq247488entry p", startsWith: "All other forms of open burning",
      digest: "1aba57146bbd15f208c716fd71c781a81ccbac5c022af032bd0d8cad4b69be2b" },
  },
  {
    id: "cumberland-bridgeton-burning", county: "Cumberland", scopeNote: "City of Bridgeton",
    stack: ecode360, sourceName: "City of Bridgeton",
    sourceUrl: "https://ecode360.com/6903694",
    label: "Covered open fires require approval",
    note: "Bridgeton Code § 107-1 requires Fire Official approval or applicable state authorization for covered open fires and bonfires. It lists exceptions for cooking and indoor appliances.",
    review: { kind: "html-ecode360", sections: ["6903694"],
      digest: "892e578a3f954759ed91cbce1aa2b88bd968282738289a69a41d0069e87852ee" },
  },
  {
    id: "essex-county-parks", county: "Essex", scopeNote: "Essex County parks and county property",
    stack: ecode360, sourceName: "Essex County",
    sourceUrl: "https://ecode360.com/36412926",
    label: "Fires allowed only in designated areas on county property",
    note: "Essex County Code § 74-26 limits fires on county parks and property to areas designated for that use under the director's rules.",
    review: { kind: "html-ecode360", sections: ["36412926"],
      digest: "f5708b259dcf4a95123db3036e518cef1d66ade6f084120a790a863dd4d1aba7" },
  },
  {
    id: "gloucester-county-parks", county: "Gloucester", scopeNote: "Gloucester County park areas",
    stack: "CivicPlus / park rules PDF", sourceName: "Gloucester County Department of Parks and Recreation",
    sourceUrl: "https://www.gloucestercountynj.gov/DocumentCenter/View/1193/Park-Rules-PDF",
    officialUrl: "https://gloucestercountynj.gov/766/Rules-Regulations",
    label: "Park fires limited to designated picnic grills",
    note: "The county park rules prohibit fires except as provided for picnic grills. Charcoal is the permitted cooking fuel in designated areas.",
    review: { kind: "pdf",
      digest: "50a45aa646b777ccd11c2bcd0a82db407b4228727fde3d7879df438a91765c80" },
  },
  {
    id: "hudson-union-city-burning", county: "Hudson", scopeNote: "Union City",
    stack: ecode360, sourceName: "City of Union City",
    sourceUrl: "https://ecode360.com/45712863",
    label: "Open burning prohibited under city code",
    note: "Union City Code § 171-7 prohibits burning that releases combustion products directly into the air as defined in the ordinance. Section 171-8 separately regulates charcoal and gas cooking equipment.",
    review: { kind: "html-ecode360", sections: ["45712863"],
      digest: "8f9e49af1189e155703f2960c6a30d140e7b7011f9d0c74da39d56b54fc0c572" },
  },
  {
    id: "hunterdon-county-parks", county: "Hunterdon", scopeNote: "Hunterdon County parks and recreation properties",
    stack: "CivicPlus / park rules HTML", sourceName: "Hunterdon County Division of Parks and Recreation",
    sourceUrl: "https://www.co.hunterdon.nj.us/1206/Rules-Regulations",
    label: "Park fires require a permit",
    note: "Hunterdon County's park rules require a permit for camping and fires on facilities and properties administered by the county Division of Parks and Recreation.",
    review: { kind: "html-heading", selector: "#divEditor5b561c9e-afcc-435a-b989-d11f51270340 .fr-view",
      heading: "Regulated Activity", digest: "40121ce1840480490498b23972588890ed777070b74eb9180cd0a6a5fad1e3e8" },
  },
  {
    id: "mercer-hopewell-burning", county: "Mercer", scopeNote: "Hopewell Township in Mercer County",
    stack: ecode360, sourceName: "Township of Hopewell",
    sourceUrl: "https://ecode360.com/36093257",
    label: "Refuse and vegetation burning restricted",
    note: "Hopewell Township Code § 9-9 prohibits burning refuse, leaves and other plant material for disposal. Its exceptions include qualifying fire training and open burning with appropriate valid permits.",
    review: { kind: "html-ecode360", sections: ["36093257"],
      digest: "0d501def40827dda2312ba5fc19034319d6148fdbee00940eda3a3e7e6e092fa" },
  },
  {
    id: "middlesex-woodbridge-burning", county: "Middlesex", scopeNote: "Township of Woodbridge",
    stack: ecode360, sourceName: "Woodbridge Township",
    sourceUrl: "https://ecode360.com/35052984",
    label: "Residential fires limited by fuel, container and hours",
    note: "Woodbridge Code § 24-2.3 limits covered residential fires to approved, screened containers and qualifying firewood. It prohibits burning yard waste and requires fires to be out by 1 a.m.",
    review: { kind: "html-ecode360", sections: ["35052977", "35052984"],
      digest: "7f7c44f7738e5af0510db913c6822654bbe66e923ae9cc9bf3a70c9d76f44566" },
  },
  {
    id: "monmouth-county-parks", county: "Monmouth", scopeNote: "Monmouth County Park System lands",
    stack: "ASP.NET / park rules PDF", sourceName: "Monmouth County Board of Recreation Commissioners",
    sourceUrl: "https://www.co.monmouth.nj.us/documents/132/general-rules-and-regs-january-2024-web.pdf",
    officialUrl: "https://www.monmouthcountyparks.com/page.aspx?ID=4901",
    label: "Park fires limited to designated fire rings and fireplaces",
    note: "Park Rule 16 limits fires to designated fire rings or fireplaces. Separate provisions allow propane grills at eligible campsites and picnic areas and charcoal in designated picnic grills.",
    review: { kind: "pdf",
      digest: "1861e45cda177095bdae0a32aa54b7e74706b96a0b47a34c459fa0e1b7506189" },
  },
  {
    id: "morris-county-parks", county: "Morris", scopeNote: "Morris County Park Commission lands",
    stack: "OpenCities / county park rules HTML", sourceName: "Morris County Sheriff's Office",
    sourceUrl: "https://www.morriscountynj.gov/Departments/Sheriff/Patrol-Division/Park-Rules-and-Regulations",
    officialUrl: "https://www.morriscountynj.gov/Departments/Sheriff/Patrol-Division/Park-Rules-and-Regulations#section-2",
    label: "Park fires limited to designated areas",
    note: "Article III, Section 6 of the Morris County park rules limits fires to designated areas and requires continuous supervision until extinguished.",
    review: { kind: "html-heading", selector: ".page-section-container-2", heading: "Section 6. Fires",
      digest: "4274127c287ef9eb1e2368d4fc15fcdf9fa03434015420675191240e916d73d1" },
  },
  {
    id: "ocean-stafford-burning", county: "Ocean", scopeNote: "Township of Stafford",
    stack: ecode360, sourceName: "Township of Stafford",
    sourceUrl: "https://ecode360.com/11378438",
    officialUrl: "https://ecode360.com/11378438#11378437",
    label: "Open burning restricted and covered bonfires require a permit",
    note: "Stafford Code Chapter 147 restricts open burning on public and private property. The chapter allows specified contained fires and requires a special permit for covered recreational or ceremonial fires such as bonfires.",
    review: { kind: "html-ecode360", sections: ["11378437", "11378438", "11378441"],
      digest: "f112abd5b00922fd879ece961286c99ae8806c975e03d5e82b4c13d4726981ef" },
  },
  {
    id: "passaic-west-milford-burning", county: "Passaic", scopeNote: "Township of West Milford",
    stack: ecode360, sourceName: "Township of West Milford",
    sourceUrl: "https://ecode360.com/26805123",
    label: "Covered residential open burns require a permit",
    note: "West Milford Code § 152-11 requires a permit for covered residential open burning in approved containers and limits fire size, location and fuel.",
    review: { kind: "html-ecode360", sections: ["26805123"],
      digest: "243dd4d7049cb811ff0123f560f6ea41888f88743c1e6522d1fa38c0303b77cc" },
  },
  {
    id: "salem-city-burning", county: "Salem", scopeNote: "City of Salem",
    stack: ecode360, sourceName: "City of Salem",
    sourceUrl: "https://ecode360.com/12295821",
    label: "Outdoor burning limited to local code exceptions",
    note: "Salem City Code § 157-1 restricts outdoor burning. Qualifying residential recreational fires must use approved containers and comply with fuel, size and location requirements.",
    review: { kind: "html-ecode360", sections: ["12295821"],
      digest: "a47cc61ac437de5b421b4574b76ae2c88e33c69603a77163b28be767de62fe03" },
  },
  {
    id: "somerset-bernards-burning", county: "Somerset", scopeNote: "Bernards Township",
    stack: ecode360, sourceName: "Bernards Township",
    sourceUrl: "https://ecode360.com/36762225",
    officialUrl: "https://ecode360.com/36762225#36762207",
    label: "Covered open burns require state and township permits",
    note: "Bernards Township Code § 14-10 requires state and township permits for covered open burns. It gives separate conditions for recreational and agricultural burning.",
    review: { kind: "html-ecode360", sections: ["36762207", "36762208", "36762210"],
      digest: "96534be23366602865c763059e3421d348da06e3d1f2b3fc2c60865b185c3444" },
  },
  {
    id: "sussex-sparta-burning", county: "Sussex", scopeNote: "Township of Sparta",
    stack: ecode360, sourceName: "Township of Sparta",
    sourceUrl: "https://ecode360.com/35835846",
    label: "Open burning of vegetation and refuse restricted",
    note: "Sparta Code § 11-8.4 prohibits open burning to dispose of plant life, refuse or structures and prohibits salvage burns. The ordinance lists exceptions for NJDEP variances and qualifying training.",
    review: { kind: "html-ecode360", sections: ["35835846"],
      digest: "411325e8805f5c1f0b67bd20cf793fd535b2340a6915e89d992187d1bd9664ac" },
  },
  {
    id: "union-county-parks", county: "Union", scopeNote: "Union County parks and recreation facilities",
    stack: "WordPress / county code PDF", sourceName: "Union County Board of County Commissioners",
    sourceUrl: "https://ucnj.org/commissioners/wp-content/uploads/sites/29/2026/04/Laws-of-Union-County-2026.pdf",
    officialUrl: "https://ucnj.org/commissioners/wp-content/uploads/sites/29/2026/04/Laws-of-Union-County-2026.pdf#page=227",
    label: "Open fires limited to designated fireplaces in county parks",
    note: "Union County Code § 115-7 limits open fires on county park and recreation property to designated fireplaces and regulates grills, setbacks and supervision.",
    review: { kind: "pdf-etag", etag: '"17acf5-6513cc8062f00"' },
  },
  {
    id: "warren-liberty-burning", county: "Warren", scopeNote: "Township of Liberty",
    stack: ecode360, sourceName: "Township of Liberty",
    sourceUrl: "https://ecode360.com/14154687",
    label: "Open burning limited to cooking and authorized burns",
    note: "Liberty Township Code § 40-2 restricts open burning to outdoor cooking and burns authorized by the Township Committee or another agency with authority.",
    review: { kind: "html-ecode360", sections: ["14154685", "14154687"],
      digest: "dafc56f29cdace302e62ad9cf7d97bf615bfaf6013ffd748d94280f8fe50a2bb" },
  },
];

export const njLocalBurnRules = rules.map(({
  id, county: name, stack, sourceName, sourceUrl, officialUrl = sourceUrl, review, ...rule
}, index) => {
  const state = "NJ";
  const county = countyByName(state, name);
  if (!county) throw new Error(`${id}: unknown New Jersey county ${name}`);
  const { source, parse } = reviewedLocalCalendar({
    publisher: { id: `nj-${id}`, state, scope: "part", stack, sourceName, sourceUrl, officialUrl },
    counties: [county], rule, review, zone: US_ZONES.Eastern, hour: 3 + index, standing: true,
  });
  const extension = review.kind === "pdf-etag" ? "headers.json" : review.kind === "pdf" ? "pdf" : "html";
  return { source: { ...source, reportingFips: [county.fips] }, parse, fixture: `${id}.${extension}` };
});
