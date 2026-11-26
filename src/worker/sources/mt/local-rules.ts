import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";
import type { ActiveSource } from "../types";
import { MT_PERMIT_PORTAL, mtPermitFaqPage } from "./permit-portal";

type ReviewedRule = LocalCalendarRule & {
  id: string;
  counties: readonly [string, ...string[]];
  sourceUrl: string;
  officialUrl?: string;
  sourceName: string;
  stack: string;
  review: LocalCalendarEvidence;
  read?: () => Promise<Response>;
};

const FLATHEAD_SEASON = "https://flatheadcounty.gov/department-directory/commissioners-office/public_information_office/article/18778";
const rules: readonly ReviewedRule[] = [
  {
    id: "bighorn-permit", counties: ["Big Horn"], stack: "CivicPlus / official PDF", sourceName: "Big Horn County Fire Marshal",
    sourceUrl: "https://www.bighorncountymt.gov/DocumentCenter/View/181/Fire-Permit-Application-PDF",
    officialUrl: "https://www.bighorncountymt.gov/175/Roads-Junk-Vehicle-Rural-Fire",
    scopeNote: "Forest, range and croplands covered by the Big Horn County fire protection program",
    label: "Written fire marshal permit required for covered burning",
    note: "Resolution 200-44 requires written approval for covered open fires. The county notice excludes incorporated areas and separately managed federal and tribal lands.",
    review: { kind: "pdf", digest: "64928b10c1c80ca7c41adc9fcc26e773c2d088fe3db2e9593c09071fb522bfed" },
  },
  {
    id: "blaine-permit", counties: ["Blaine"], stack: "WordPress / county HTML", sourceName: "Blaine County Sheriff's Office",
    sourceUrl: "https://blainecounty-mt.gov/sheriff-coroner/",
    scopeNote: "Burns regulated by Blaine County's permit program",
    label: "Blaine County permit required for covered burns",
    note: "The sheriff requires a valid permit at each covered burn and prohibits burning after sunset. Check the appropriate tribal or federal authority on separately managed lands.",
    review: { kind: "html", selector: ".et_pb_tab_2 .et_pb_tab_content", startsWith: "Fire Burn permits are issued annually",
      digest: "965aef8e4f57851ddec9e4e0eb7ec8d18b19f932ce4b4ac7e68f1f3b1e58e605" },
  },
  {
    id: "carbon-season", counties: ["Carbon"], stack: "WordPress / signed commission PDF", sourceName: "Carbon County Board of Commissioners",
    sourceUrl: "https://carbonmt.gov/wp-content/uploads/2026/03/RES-2026-01-Establish-Fire-Season-for-2026-and-Related-Burn-Permit-Fees.pdf",
    officialUrl: "https://carbonmt.gov/wildland-fire/",
    scopeNote: "Carbon County fire protection areas outside separately administered lands",
    label: "County permit required during Carbon's 2026 fire season",
    note: "Resolution 2026-01 requires a valid and activated permit for covered burns through December 31, 2026. It excludes state and federal agency lands and national forest affidavit lands.",
    effectiveDates: ["2026-01-01", "2026-12-31"],
    review: { kind: "pdf", digest: "338bf0dafca88939ef65a3c6ade96832bca7f50d6ff30bc469c94f9981675ade" },
  },
  {
    id: "cascade-great-falls", counties: ["Cascade"], stack: "CivicPlus / city HTML", sourceName: "Great Falls Fire Rescue",
    sourceUrl: "https://www.greatfallsmt.gov/1132/Burn-Permit",
    scopeNote: "City of Great Falls",
    label: "Great Falls open burning limited to approved areas and season",
    note: "Great Falls issues open-burning permits for selected areas from March 1 through November 30, subject to any additional restrictions. Confirm your location with Fire Rescue.",
    review: { kind: "html", selector: "p", startsWith: "The City of Great Falls allows open burning by permit",
      digest: "a9a35925625d363c4b254962a8091424807ef76e321fdfa825282b2cb4b0ee12" },
  },
  {
    id: "custer-activation", counties: ["Custer"], stack: "WordPress / county HTML", sourceName: "Custer County Fire",
    sourceUrl: "https://custercountymt.gov/emergency-enforcement/fire/",
    scopeNote: "Open burning covered by Custer County's permits",
    label: "Activate the Custer County permit for each covered burn",
    note: "Custer County Fire requires activation before each permitted burn. Check with the local fire authority about separate restrictions.",
    review: { kind: "html", selector: "p", startsWith: "Before burning, your permit must be activated each time.",
      digest: "e75585c2ec588b21ee6ae054a6072ad80cd1ed4bf80524cae43e9825283844b7" },
  },
  {
    id: "dawson-permit", counties: ["Dawson"], stack: "Revize / official PDF", sourceName: "Dawson County and West Glendive Fire District",
    sourceUrl: "https://cms2.revize.com/revize/dawsonmt/departments/burn_permits/docs/Burn_Permit_Regulations_Update_2015_Use.pdf?t=201709181334010",
    officialUrl: "https://www.dawsonmt.gov/departments/burn_permits/index.php",
    scopeNote: "Dawson County outside the City of Glendive and Town of Richey",
    label: "Written permit required for covered open burning",
    note: "County open-burning regulations require advance written permission and notice to Glendive Police on each burn day. Small recreational fires have a separate definition.",
    review: { kind: "pdf-etag", etag: '"0a8344c929d01:0"' },
  },
  {
    id: "fallon-baker", counties: ["Fallon"], stack: "WordPress / fire district HTML", sourceName: "Baker Rural Fire District",
    sourceUrl: "https://falloncountymt.gov/rural-fire-baker/",
    scopeNote: "Baker Rural Fire District in Fallon County",
    label: "Burn permit required for fires longer than 3 feet",
    note: "Baker Rural Fire directs residents to obtain a permit from the Fallon County Clerk and Recorder for fires larger than its 3-foot threshold.",
    review: { kind: "html", selector: "p", startsWith: "All fires greater than 3 ft in length",
      digest: "d462ce3e1540ff76d157945723f9fce83897f81227ef4e84af83cafc9e374ff8" },
  },
  {
    id: "fallon-plevna", counties: ["Fallon"], stack: "WordPress / fire district HTML", sourceName: "Plevna Rural Fire District",
    sourceUrl: "https://falloncountymt.gov/rural-fire-plevna/",
    scopeNote: "Plevna Rural Fire District in Fallon County",
    label: "Burn permit required for fires longer than 3 feet",
    note: "Plevna Rural Fire directs residents to obtain a permit from the Fallon County Clerk and Recorder for fires larger than its 3-foot threshold.",
    review: { kind: "html", selector: "p", startsWith: "All fires greater than 3 ft in length",
      digest: "d462ce3e1540ff76d157945723f9fce83897f81227ef4e84af83cafc9e374ff8" },
  },
  {
    id: "fergus-permit", counties: ["Fergus"], stack: "Joomla / official PDF", sourceName: "Fergus County Fire Warden",
    sourceUrl: "https://fergusmt.gov/images/disaster-emergency/25.12.24-burnpermitfaq.pdf",
    officialUrl: "https://fergusmt.gov/departments/fire-warden",
    scopeNote: "Open burning covered by the Fergus County permit program",
    label: "Year-round permit requirement for covered open fires",
    note: "The fire warden requires a permit for covered slash, debris and land-clearing fires. The county's FAQ describes a small recreational-fire exception and requires activation each burn day.",
    review: { kind: "pdf", digest: "13c0017ae5a66b9267fcab2313183232e812d7a799e734400cf290d27532db02" },
  },
  {
    id: "flathead-summer", counties: ["Flathead"], stack: "Concrete CMS / county HTML", sourceName: "Flathead County Environmental Health",
    sourceUrl: FLATHEAD_SEASON,
    scopeNote: "Flathead County-regulated debris and vegetation burning",
    label: "Flathead summer open-burning closure",
    note: "Flathead County closes its open-burning season from July through September each year. Confirm activity exceptions and reopening conditions with the county.",
    seasons: [["07-01", "09-30"]],
    review: { kind: "html", selector: "p", startsWith: "Following the annual summer fire closure",
      digest: "83e171cc13a659a811ee9131d2ccde482601f85374d4effd47a196b06b3f25cb" },
  },
  {
    id: "flathead-permit", counties: ["Flathead"], stack: "Concrete CMS / county HTML", sourceName: "Flathead County Environmental Health",
    sourceUrl: FLATHEAD_SEASON,
    officialUrl: "https://flatheadcounty.gov/department-directory/health/environmental-health/burn-permit",
    scopeNote: "Natural vegetation and woody debris burning under Flathead County's permit program",
    label: "Flathead County permit required for debris burning",
    note: "Flathead County requires a permit for covered vegetation and woody debris burning. The county publishes exceptions and requires activation before each burn.",
    review: { kind: "html", selector: "ol > li", startsWith: "Permits Are Required for Natural Vegetation:",
      digest: "17b2ec505f674191ab5103d66a55b20d53f6e51e70cd9c86343d55472931ed51" },
  },
  {
    id: "flathead-reservation-debris", counties: ["Flathead", "Lake", "Missoula", "Sanders"],
    stack: "WordPress / tribal schedule", sourceName: "Confederated Salish and Kootenai Tribes Division of Fire",
    sourceUrl: "https://cskt.org/division-of-fire/",
    scopeNote: "Debris burning on the Flathead Indian Reservation",
    label: "Flathead Reservation seasonal debris-burning restrictions",
    note: "The tribal schedule requires a debris permit in May and June and closes debris burning from July through September and December 1 through February 28.",
    seasons: [["05-01", "09-30"], ["12-01", "02-28"]],
    review: { kind: "html", selector: "figure.wp-block-table", startsWith: "Open Spring Burning",
      digest: "00a3d1867a2ac615776fb2219660991383321200dbc103d87840a01ad12b2625" },
  },
  {
    id: "glacier-park-fires", counties: ["Glacier", "Flathead"], stack: "NPS / park guidance HTML", sourceName: "Glacier National Park",
    sourceUrl: "https://www.nps.gov/glac/learn/nature/fire-safety.htm",
    officialUrl: "https://www.nps.gov/glac/learn/management/compendium.htm",
    scopeNote: "Glacier National Park",
    label: "Open fires limited to designated areas in Glacier National Park",
    note: "Park rules require fires to remain in designated areas and be attended. The compendium lists backcountry locations where fires are prohibited and conditions for river-corridor fires.",
    review: { kind: "html", selector: "#cs_control_2699004 .ArticleTextGroup > ul:first-of-type",
      startsWith: "Fires must be kept in designated areas",
      digest: "49a0dbb2cec2b4152d3f4cd3b0d2fccc5fa75407cc126c284edef31714db3663" },
  },
  {
    id: "golden-valley-permit", counties: ["Golden Valley"], stack: "WordPress / county permit instructions",
    sourceName: "Golden Valley County Sheriff's Office",
    sourceUrl: "https://gvcomt.wordpress.com/burn-permit/",
    officialUrl: "https://static1.squarespace.com/static/60bc172470faee6f7e1223ee/t/6123e30aae009a2d80f279fa/1629741839537/Burn%2BPermit.pdf",
    scopeNote: "Open burning under Golden Valley County jurisdiction",
    label: "Written permit and advance permission required for covered burns",
    note: "County Resolution 2014-4 establishes a January–December fire season and requires a call to the sheriff for every covered ignition. The instructions describe exceptions for recreational and burn-barrel fires.",
    review: { kind: "html", selector: "p", startsWith: "Remember: You must call in each and every time",
      digest: "4facbd2a4ed7225ab8549b0b06933efe8a9a95cae3e3e0733987dac032632b77" },
  },
  {
    id: "mccone-dispatch", counties: ["McCone"], stack: "Joomla / official PDF", sourceName: "McCone County Sheriff's Office",
    sourceUrl: "https://mcconecountymt.gov/images/pdfs/23.BurnPermit.pdf",
    officialUrl: "https://mcconecountymt.gov/departments/sheriff-coroner",
    scopeNote: "Burns covered by McCone County permits",
    label: "Notify McCone County Dispatch before and after permitted burns",
    note: "County permit holders must contact dispatch before ignition and after extinguishment. The permit also limits burning to calm days and sets additional rules near Wolf Point and Fort Peck.",
    review: { kind: "pdf", digest: "7ad5da308c5628aae85c842d6ad9146c0efb4d3c55784677ec38c61057441451" },
  },
  {
    id: "northern-cheyenne-permit", counties: ["Big Horn", "Rosebud"],
    stack: "WordPress / tribal program HTML", sourceName: "Northern Cheyenne Environmental Protection Department",
    sourceUrl: "https://northerncheyenneepd.com/air/",
    scopeNote: "Northern Cheyenne Indian Reservation",
    label: "Northern Cheyenne permit required for covered open burning",
    note: "The tribe requires permits and advance notification for covered open burning. Its program describes exceptions for qualifying small fires and cultural, traditional and spiritual burning.",
    review: { kind: "html", selector: ".elementor-element-6c79ae5 .elementor-widget-container",
      startsWith: "Open burning without a permit is generally prohibited",
      digest: "8054a46ae54186669ba84eb5dfbc06032f706ac467f50082b64abc2b5351d610" },
  },
  {
    id: "phillips-dispatch", counties: ["Phillips"], stack: "Odoo / sheriff HTML", sourceName: "Phillips County Sheriff's Office",
    sourceUrl: "https://phillipscountysheriff.org/burn-permits",
    scopeNote: "Controlled burns under Phillips County's permit program",
    label: "Notify Phillips County Dispatch before and after a permitted burn",
    note: "The sheriff's permit instructions require dispatch notification before ignition and after completion. Check the permit terms and current restrictions before lighting.",
    review: { kind: "html", selector: "p", startsWith: "Burn Permits can be obtained in person",
      digest: "7c509ab89083e2f860586b01d5fd44250ed8f57488d9e235c9c8005043802849" },
  },
  {
    id: "pondera-permit", counties: ["Pondera"], stack: "Wix / county policy PDF", sourceName: "Pondera County Board of Commissioners",
    sourceUrl: "https://www.ponderacountymt.gov/_files/ugd/984806_7d7e8c05b14b477ca930738d251cb207.pdf",
    officialUrl: "https://www.ponderacountymt.gov/commissioners",
    scopeNote: "Pondera County outside reservation lands",
    label: "Pondera County burn permit and advance notice required",
    note: "The permit policy requires a county permit and a call to the sheriff one hour before ignition. Reservation lands use separate permits and policies.",
    review: { kind: "pdf", digest: "baa57c954f7b85f83694c9cf20940b3bb4a2a97efdb7f1ff0a9ff3a74b9d744c" },
  },
  {
    id: "stillwater-permit", counties: ["Stillwater"], stack: "CivicPlus / county HTML", sourceName: "Stillwater County Fire Warden",
    sourceUrl: "https://www.stillwatercountymt.gov/228/Fire-Warden",
    scopeNote: "Open burning covered by Stillwater County's permits",
    label: "Stillwater County permit required year-round for covered burns",
    note: "The fire warden requires a permit for slash, land-clearing, debris and other covered open fires and publishes a 48-inch size threshold. Activate the permit before burning.",
    review: { kind: "html", selector: "dd.widgetFAQ--answer", startsWith: "A burn permit is needed year-round",
      digest: "1a13e735fb5db381d285ac65cd3cf49cfc6b371ce7384660ea9b9778e3e53984" },
  },
  {
    id: "teton-permit", counties: ["Teton"], stack: "WordPress / county HTML", sourceName: "Teton County Fire Department",
    sourceUrl: "https://tetoncountymt.gov/fire-department/",
    scopeNote: "Open burning covered by Teton County's permit ordinance",
    label: "Teton County burn permit required for covered open burning",
    note: "The local fire department requires a permit and specifies activation for fires exceeding 25 square feet. Check state and district restrictions separately.",
    review: { kind: "html", selector: "p", startsWith: "Teton County has adopted an annual fire season",
      digest: "82271a857da51c58e2f5dab2773bbd22e27c4e4e6914646e92a3f008519cde5c" },
  },
  {
    id: "valley-permit", counties: ["Valley"], stack: "CivicPlus / county HTML", sourceName: "Valley County Sheriff's Office",
    sourceUrl: "https://www.valleycountymt.gov/1295/Burn-Permits",
    scopeNote: "Open burning regulated by Valley County",
    label: "Valley County permit required for covered open burning",
    note: "Valley County's open-burning regulations require a permit from the sheriff or local fire authority. Call the sheriff for current permit issuance and check separately on tribal lands.",
    review: { kind: "html", selector: "p", startsWith: "Permits: No person shall cause",
      digest: "b9c77308fdc124df85b5d4de75b4f31cdfea564bdb5007904d7ec23fd0e6dc7d" },
  },
  {
    id: "yellowstone-permit", counties: ["Yellowstone"], stack: "Classic ASP / county HTML", sourceName: "Yellowstone County Disaster and Emergency Services",
    sourceUrl: "https://www.yellowstonecountymt.gov/des/BurnPermits/burnfaq.asp",
    scopeNote: "Covered burns under the Yellowstone County permit program outside Billings, Broadview and Laurel",
    label: "Yellowstone County permit and daily activation required",
    note: "Covered open burning requires a valid permit and activation on the day of the burn. Consult the county about daylight hours and exceptions for recreational fires.",
    review: { kind: "html", selector: "#burn-9 li", startsWith: "In Yellowstone County, residents are allowed to burn year round",
      digest: "4113dfae4da00a03dfd55fe9a255d508b8ad0b46c573fc1d7024849629a873e1" },
  },
];

const REQUIRED = "#what-can-burn .help-answer li:first-child";
const LARGE_FIRE = "#when-need-permit .help-answer p";
const ACTIVATION = "#responsibilities .help-answer li:nth-child(3)";
const permitLabels: Readonly<Record<string, string | undefined>> = {
  [REQUIRED]: "Year-round permit required for covered open burning",
  [LARGE_FIRE]: "Written permit required for open fires over 48 inches",
};

const faqRules = [
  { county: "Chouteau", slug: "chouteau", block: ACTIVATION,
    digest: "be8c129ecaa8b6f54cd1c210428b44773869de52b172e751b2977f6747a17ed0" },
  { county: "Garfield", slug: "garfield", block: REQUIRED,
    digest: "7aa7493dd4e487d338021057c2b099751e3e0b90b2e5161367faad00e234b51f" },
  { county: "Hill", slug: "hill", block: "#responsibilities .help-answer li:nth-child(4)",
    digest: "d55e6322c3bf0dedb2e97b86e31698674a9f12b79859724b60a30ab07e648bad" },
  { county: "Judith Basin", slug: "judith-basin", block: REQUIRED,
    digest: "3ffc8c4f5bf297c27ae3b95ed27196c58190516dd6cae2618bb89e16f6a517bf" },
  { county: "Musselshell", slug: "musselshell", block: ACTIVATION,
    digest: "89bc7c757a5f2a1a899fbcca5c7c323099f2df9aa2f280279449fc49d1736c80" },
  { county: "Petroleum", slug: "petroleum", block: LARGE_FIRE,
    digest: "80ac71749f78497f641e0f69a8b455b3bdda334a3e7ce1b8e641beb6e971f86f" },
  { county: "Powder River", slug: "powder-river", block: LARGE_FIRE,
    digest: "e522d28edb1900a1ba0d4d224478491bd67a51b2c14b50252a07687b14930492" },
  { county: "Prairie", slug: "prairie", block: REQUIRED,
    digest: "a5fed34bcaf74d7d43e1d87b802b7623fd9a8d52d6982a8d8482a30edf59d0c3" },
  { county: "Richland", slug: "richland", block: ACTIVATION,
    digest: "d483166a3b1ac3c4d85cbf9a78e4b53db5a01367165d0d318dc2efbb12bea80e" },
  { county: "Roosevelt", slug: "roosevelt", block: REQUIRED,
    digest: "a32430594ea72fc24a0b9c8fd4715ebfbed976952919566661b08d9de2c90a10" },
];

const portalRules = faqRules.map(({ county, slug, block, digest }): ReviewedRule => {
  const { officialUrl, read } = mtPermitFaqPage(county);
  return {
    id: `${slug}-faq`, counties: [county], officialUrl, read,
    stack: "Tyler Montana CGI / county FAQ HTML", sourceName: `${county} County Burn Permit and Notification Service`,
    sourceUrl: MT_PERMIT_PORTAL, scopeNote: `Open burning regulated under the ${county} County permit program`,
    label: permitLabels[block] ?? "Activate county permits before burning",
    note: `See ${county} County's instructions in the Montana Burn Permit and Notification Service for qualifying fires and local closures. Check separately with tribal or federal land managers where applicable.`,
    review: { kind: "html-blocks", section: "body", blocks: `.county-identity-name, ${block}`, digest },
  };
});

export const mtLocalBurningRules = [...rules, ...portalRules].map(({
  id, counties, sourceName, sourceUrl, officialUrl, stack, review, read, ...rule
}, index) => {
  const group = index % 3;
  const areas = counties.map((name) => {
    const county = countyByName("MT", name);
    if (!county) throw new Error(`Montana local burning rule ${id}: invalid county ${name}`);
    return county;
  });
  const { source, parse } = reviewedLocalCalendar({
    publisher: { id: `mt-rule-${id}`, state: "MT", scope: "part", sourceName, stack, sourceUrl, officialUrl: officialUrl ?? sourceUrl },
    counties: areas, rule, review, zone: US_ZONES.Mountain, hour: 1 + group, standing: true,
  });
  const active: ActiveSource = {
    ...source,
    pollGroup: `mt-permit-rules-${group + 1}`,
    reportingFips: areas.map(({ fips }) => fips),
    fetch: read ? async ({ now }) => ({ rows: await parse(await read(), now) }) : source.fetch,
  };
  return { source: active, parse, evidenceKind: review.kind };
});
