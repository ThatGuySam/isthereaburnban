import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";

type LocalRule = LocalCalendarRule & {
  id: `ut-${string}`;
  county: string;
  scope?: "county";
  publisher: string;
  stack: string;
  url: string;
  officialUrl?: string;
  review: LocalCalendarEvidence;
};

const RULES: readonly LocalRule[] = [
  {
    id: "ut-box-elder-burning-permit", county: "Box Elder",
    publisher: "Box Elder County Fire Marshal", stack: "CivicPlus / signed ordinance PDF",
    url: "https://www.boxeldercountyut.gov/DocumentCenter/View/1299/County-Ordinance-385",
    officialUrl: "https://www.boxeldercountyut.gov/218/Fire",
    scopeNote: "Open burning in unincorporated Box Elder County",
    label: "Open-burning permit required",
    note: "Box Elder County Ordinance 385 requires a county permit for covered burning. It lists exceptions including attended recreational campfires and cooking devices. The fire marshal posts residential permit windows separately.",
    review: { kind: "pdf", digest: "f435a95aeb823a25ecc6ea3db8bbe3b210d052e3acb858c5a06dc61b447db5a2" },
  },
  {
    id: "ut-cache-open-burning-permit", county: "Cache", publisher: "Cache County Fire District",
    stack: "County HTML", url: "https://www.cachecounty.gov/fire/getburnpermit.html",
    scopeNote: "Residential vegetation burning handled by the relevant fire authority in Cache County",
    label: "Open-burning permit required",
    note: "Cache County Fire District requires a valid open-burn permit at the burn site. Permit windows, the clearing index and local restrictions also apply.",
    review: { kind: "html", selector: "#content p", startsWith: "A valid open burn permit", digest: "0d044153bf20ca3cafdc25e70dbb8762e5eb8b8d1bcdb7303a41f55786f68e8e" },
  },
  {
    id: "ut-layton-open-burning", county: "Davis", publisher: "Layton City Fire Prevention",
    stack: "Municipal FAQ HTML", url: "https://www.laytoncityutah.gov/LC/City/FAQ#FAQ_A6",
    scopeNote: "Residential open burning within Layton city limits",
    label: "Residential debris burning prohibited",
    note: "Layton limits outdoor burning to qualifying agricultural burns and recreational fires that meet its requirements. Residential vegetation cleanup does not qualify as agricultural burning.",
    review: { kind: "html", selector: "#FAQ_A6", digest: "f698b5afdfed11bf64dced1b9ee55fc68cb86b5d53dca7a6a5d8d14010161031" },
  },
  {
    id: "ut-grand-open-burning-permit", county: "Grand", publisher: "Grand County",
    stack: "CivicPlus / permit guidance", url: "https://www.grandcountyutah.net/1271/20655/Open-Burning",
    scopeNote: "Open burning permits on unincorporated property in Grand County",
    label: "Open-burning permit required",
    note: "The county requires a DAQ permit during its open burn windows and notification to dispatch. Contact the county fire warden for any closed-season waiver or permit. Moab has separate rules.",
    review: { kind: "html", selector: ".fr-view p", startsWith: "NOTE: Burning may only occur", digest: "8b8c29da81c3b1171aa8e94f6a37c784df4f941fcb9c42dd3ad03691d45509b9" },
  },
  {
    id: "ut-iron-open-season-permit", county: "Iron", publisher: "Iron County Fire Warden",
    stack: "Next.js / permit guidance", url: "https://ironcountyut.gov/fire/burn-permit",
    scopeNote: "Open burning in unincorporated Iron County during the local open season",
    label: "Written county burn permit required",
    note: "Iron County requires an approved written permit in unincorporated areas from November through May. County clearing-index limits, red flag conditions and other safety requirements also apply.",
    seasons: [["11-01", "05-31"]],
    review: { kind: "html", selector: "article", startsWith: "Permit Requirement", digest: "b24c3cdfd1faec225dfcea0b71926e9aea23fc8f65f05778498c208078f226d1" },
  },
  {
    id: "ut-juab-district-burning-permit", county: "Juab", scope: "county",
    publisher: "Juab Special Service Fire District", stack: "Municipal permit PDF",
    url: "https://www.eureka.utah.gov/documents/52/Burn_Permit_032118.pdf",
    scopeNote: "Residential vegetation burning covered by the Juab Special Service Fire District",
    label: "Residential open-burning permit required",
    note: "Juab Special Service Fire District requires a permit for residential vegetation burning throughout Juab County. Its permit sheet gives seasonal issuing windows and lists air quality and safety requirements.",
    review: { kind: "pdf", digest: "4f3497eaac027c6229f4bea0026dd96c22b937aefecce8b453f166a3e28d5b50" },
  },
  {
    id: "ut-kanab-burning-permit", county: "Kane", publisher: "Kanab City",
    stack: "CivicPlus / permit guidance", url: "https://kanab.utah.gov/2197/Burn-Permit",
    scopeNote: "Permit-regulated open burning in Kanab city limits",
    label: "City burn permit required",
    note: "Kanab requires a city permit for open burning and checks the clearing index before issuing it. The fire department determines exact opening and closing dates.",
    review: { kind: "html", selector: "#divEditore14e5c29-eed5-40e4-b61f-32455982a0eb .fr-view", digest: "1d56b268cbf61575858af5d1312af9d386d0cf21d8223c2644901f31404558a7" },
  },
  {
    id: "ut-morgan-highlands-open-burning", county: "Morgan", publisher: "Morgan County Fire and EMS",
    stack: "Duda / fire department guidance", url: "https://www.morgancountyutah.gov/additional-wildland-burn-permit",
    scopeNote: "Open burning in Morgan County's Highlands Subdivision",
    label: "Highlands Subdivision open-burning restriction",
    note: "Morgan County lists Highlands Subdivision as a no-burning area in its open-burn guidance. Ask the fire marshal how the restriction applies to your property or activity.",
    review: { kind: "html", selector: ".dmNewParagraph p", startsWith: "OPEN BURNING MAY BE PROHIBITED", digest: "72e3024e05f3d6caed93a2cebd79ad04a47c3a07218c1559bfd32e4412272ff7" },
  },
  {
    id: "ut-unified-residential-open-burning", county: "Salt Lake", publisher: "Unified Fire Authority",
    stack: "WordPress / fire department guidance", url: "https://unifiedfireut.gov/prevention/open-burning/",
    scopeNote: "Residential vegetation burning in Unified Fire Authority's Salt Lake County service area",
    label: "Residential vegetation burning prohibited",
    note: "Unified Fire Authority prohibits residential open burning of yard debris in its Salt Lake County service area. Small recreational fires have separate rules, including air-quality restrictions.",
    review: { kind: "html", selector: ".entry-content li", startsWith: "Salt Lake County: Residential open burning", digest: "5dae55c60f9db2c169f1ce1fd447fb364b2c65c490b19d9f908489b532f139c6" },
  },
  {
    id: "ut-salt-lake-city-open-burning", county: "Salt Lake", publisher: "Salt Lake City Fire Department",
    stack: "WordPress / fire department guidance", url: "https://fire.slc.gov/recreational-fires/",
    scopeNote: "Open burning within Salt Lake City limits",
    label: "Open burning prohibited",
    note: "Salt Lake City Fire prohibits open burning as defined by the city. Recreational fires and cooking devices have separate rules and can be limited by daily air-quality restrictions.",
    review: { kind: "html", selector: "article p", startsWith: "1. OPEN BURNING.", digest: "2102f541acb87a35540270284799a444b36653f8bc474433f152fd3ced452e70" },
  },
  {
    id: "ut-fayette-residential-burning-season", county: "Sanpete", publisher: "Town of Fayette",
    stack: "Municipal ordinance PDF",
    url: "https://fayetteutah.gov/documents/1443/Burn_Ordinance_Fayette.docx.pdf",
    officialUrl: "https://fayetteutah.gov/council-ordinances",
    scopeNote: "Residential yard-debris burning within Fayette town limits",
    label: "Seasonal yard-debris burning limits",
    note: "Fayette prohibits residential yard-debris burning from June 1 through September 30. During October it requires a town permit. The ordinance sets separate conditions for recreational fires and cooking.",
    seasons: [["06-01", "10-31"]],
    review: { kind: "pdf", digest: "6eb80eca23434ba788ca2e159318a46902e3b6872d70486cd6235154a16d5147" },
  },
  {
    id: "ut-stansbury-open-burning", county: "Tooele", publisher: "North Tooele Fire District",
    stack: "Streamline / permit guidance", url: "https://www.ntfdutah.gov/residential-open-burn-season-permits",
    scopeNote: "Outdoor fires in Stansbury Park",
    label: "Outdoor fires limited to small cooking and recreational fires",
    note: "North Tooele Fire District says Stansbury Park allows small cooking or recreational fires in a fire pit or fireplace. Yard debris, grass and land-clearing burns are prohibited.",
    review: { kind: "html", selector: "main#page-content p", startsWith: "Stansbury Park only allows", digest: "e4024a1588a8cdd9e2ba2c2ddc44c43ea412c99593dfec470bfd97bc1b3e0d07" },
  },
  {
    id: "ut-utah-county-open-burning-permit", county: "Utah", publisher: "Utah County Fire Marshal",
    stack: "Classic ASP / permit instructions", url: "https://www.utahcounty.gov/Dept/FireMarshal/Burn_q.asp",
    scopeNote: "Open burning on unincorporated property in Utah County",
    label: "County open-burning permit required",
    note: "Residents of unincorporated Utah County must get an open-burn permit from the county fire marshal and notify dispatch. The county also requires an Airshed 8 clearing index of at least 500 for open burning.",
    review: { kind: "html", selector: "ol li p", startsWith: "Residents in Unincorporated Utah County", digest: "e88d324c9d647458131ba5708543ee81f23bc3c9ebe097841991c982b97803d5" },
  },
  {
    id: "ut-wayne-burn-permit-season", county: "Wayne", publisher: "Wayne County Fire District",
    stack: "County HTML / emergency services",
    url: "https://waynecountyutah.gov/pages/emergency-services",
    scopeNote: "Residential vegetation burning authorized by the Wayne County Fire District",
    label: "Residential burn permit season closed",
    note: "Wayne County lists residential burn permit windows of March 1 through May 30 and September 15 through November 15. Agricultural burning can occur outside those windows when it meets the county's conditions.",
    seasons: [["05-31", "09-14"], ["11-16", "02-29"]],
    review: { kind: "html-heading", selector: "article", heading: "Special Service District #3 Fire District", digest: "27ed1814c43683fbbfa496d9d3e26c348e64ba73b1ffe222ed852bb002574726" },
  },
];

export const utLocalRules = RULES.map(({ id, county, scope, publisher, stack, url, officialUrl = url, review, ...rule }, index) => {
  const area = countyByName("UT", county);
  if (!area) throw new Error(`${id}: unknown Utah county ${county}`);
  const calendar = reviewedLocalCalendar({
    publisher: { id, state: "UT", scope: scope ?? "part", stack, sourceName: publisher, sourceUrl: url, officialUrl },
    counties: [area], rule, review, zone: US_ZONES.Mountain, hour: index % 2 === 0 ? 0 : 12, standing: true,
  });
  return { ...calendar, source: { ...calendar.source, reportingFips: [area.fips] } };
});
