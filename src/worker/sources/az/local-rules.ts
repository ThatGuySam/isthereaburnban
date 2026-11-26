import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence, type LocalCalendarRule } from "../lib/local-calendar";

type Rule = LocalCalendarRule & {
  id: string;
  county: string;
  stack: string;
  sourceName: string;
  sourceUrl: string;
  officialUrl?: string;
  review: LocalCalendarEvidence;
  additionalRules?: readonly LocalCalendarRule[];
};

const rules: readonly Rule[] = [
  {
    id: "maricopa-open-burn-permits", county: "Maricopa", stack: "CivicPlus / HTML",
    sourceName: "Maricopa County Air Quality Department",
    sourceUrl: "https://www.maricopa.gov/1818/Permits-Forms-and-Payments",
    officialUrl: "https://www.maricopa.gov/1830/Burning-Activities",
    scopeNote: "Maricopa County Air Quality Department jurisdiction",
    label: "Open burn permit required for listed activities",
    note: "Maricopa County lists permits for agricultural clearing, ditchbank burning, tumbleweed disposal and other covered fires. Rule 314 describes exceptions. Separate No Burn Day and seasonal restrictions can apply.",
    review: {
      kind: "html", selector: "#divEditor920b1e3f-edfa-4f26-a0c3-2e965c3fd175 .fr-view",
      startsWith: "Burn activities that require a permit:", digest: "7931398d113f0fc18a9d960b6a6dd385653afe6cedd036a5544ab44154c78a10",
    },
  },
  {
    id: "maricopa-regional-parks-season", county: "Maricopa", stack: "Americaneagle / HTML",
    sourceName: "Maricopa County Parks & Recreation",
    sourceUrl: "https://www.maricopacountyparks.net/park-updates/",
    officialUrl: "https://www.maricopacountyparks.net/projects/fire-ban-vs-no-burn-day/",
    scopeNote: "Maricopa County regional parks within Maricopa County",
    label: "Annual regional park fire ban",
    note: "The parks department publishes a May 1 through September 30 fire ban. Staff can extend it or announce separate park restrictions. See the parks department for covered fires and exceptions.",
    seasons: [["05-01", "09-30"]],
    review: {
      kind: "html", selector: "table.park-entry-fees td > ul > li",
      startsWith: "Maricopa County's annual fire ban begins", digest: "9f2769971d101ad41eaffa5f5bd524c7c122b90edbfcd3dde0542275b75bbfc2",
    },
  },
  {
    id: "pima-open-burn-permits", county: "Pima", stack: "CivicPlus / HTML",
    sourceName: "Pima County Department of Environmental Quality",
    sourceUrl: "https://www.pima.gov/open-burning",
    scopeNote: "Pima County DEQ jurisdiction outside delegated fire districts",
    label: "Permit required for covered open burning",
    note: "Pima County Code Title 17 requires a permit for covered residential, construction and agricultural burning, with exemptions for qualifying cooking, warming and recreational fires. Delegated districts administer their own permits.",
    review: {
      kind: "html", selector: ".content-item--7515f82f-e12a-446c-abe2-4277e54ad4f1 .fr-view",
      startsWith: "Are You Planning to Conduct One of the Following?", digest: "dca08b66aecb46f91209e08738f9b195834544b69eb9f5d0a58b225013999c2b",
    },
  },
  {
    id: "superstition-open-burn-permits", county: "Pinal", stack: "WordPress / HTML",
    sourceName: "Superstition Fire & Medical District",
    sourceUrl: "https://sfmd.az.gov/fire-prevention/burn-permits/",
    scopeNote: "Superstition Fire & Medical District in Pinal County",
    label: "Permit required for covered plant-material burning",
    note: "The district directs residents to Pinal County Air Quality for permits to dispose of plant material from their property during limited daytime hours. Separate seasonal and emergency restrictions can apply.",
    review: {
      kind: "html", selector: ".post-entry-2271 .avia_textblock > p#isPasted",
      startsWith: "Open burning permits are issued", digest: "c027b50cfd46e8c0df21160337b8dbf65f163d1342352802d4214e6f3f53f0d5",
    },
  },
  {
    id: "douglas-open-burn-permits", county: "Cochise", stack: "CivicPlus / HTML",
    sourceName: "Douglas Fire Department",
    sourceUrl: "https://www.douglasaz.gov/231/Burn-Permits",
    scopeNote: "City of Douglas",
    label: "City permit required for covered open burning",
    note: "Douglas requires a permit for covered burning. The fire department suspends permitted burning in unsafe conditions, including high wind, burn bans and poor air quality.",
    review: {
      kind: "html", selector: "#divEditoraf76e994-ef0a-4cc5-bb54-6d22aff7c812 .fr-view",
      startsWith: "Conditions", digest: "8563bd6e322ba4922b7675bd084e1bded0b96862cfeac7f48dc00597cd11b2bd",
    },
  },
  {
    id: "flagstaff-outdoor-fire-permits", county: "Coconino", stack: "CivicPlus / HTML",
    sourceName: "Flagstaff Fire Department",
    sourceUrl: "https://flagstaff.az.gov/2981/Fire-Restriction-Stages",
    scopeNote: "City of Flagstaff",
    label: "Written permit required for covered outdoor fires",
    note: "Flagstaff applies its Wildland Urban Interface Code at every stage. Designated campsites and inhabited premises have an exception for qualifying fire appliances with clearance.",
    review: {
      kind: "html", selector: "#divEditor885613f5-9552-4478-9ac3-6a0e89aa039a .fr-view li",
      startsWith: "The Wildland Urban Interface (WUI) Code is always applicable", digest: "37a62c629f37ceb8c205e49a97cc13f53b3b260adaa1d6fa3625e2129d739a83",
    },
  },
  {
    id: "central-arizona-pile-permits", county: "Yavapai", stack: "CivicPlus / HTML",
    sourceName: "Central Arizona Fire & Medical Authority",
    sourceUrl: "https://www.cazfire.gov/341/Burn-Permits",
    scopeNote: "Central Arizona Fire & Medical Authority districts in Yavapai County",
    label: "Permit required for residential vegetation piles",
    note: "CAFMA requires a residential permit to burn piles of vegetation in its districts. A separate commercial permit process applies. Check district restrictions and activate a permit before use.",
    review: {
      kind: "html", selector: "#divEditorffad33e9-be7b-46b4-b247-c269cf352cf1 .fr-view > p",
      startsWith: "Residential burn permits", digest: "8b13b2f0e71d51e765d6f1e152fcb09e8b30cf07882443bff3f78407ac572980",
    },
  },
  {
    id: "navajo-dispatch-notification", county: "Navajo", stack: "ASP.NET WebForms / permit terms",
    sourceName: "Navajo County Emergency Management",
    sourceUrl: "https://extend.navajocountyaz.gov/EmergencyManagement/BurnPermit",
    scopeNote: "Unincorporated Navajo County outside fire districts",
    label: "Notify dispatch and the fire department before permitted burning",
    note: "Navajo County's open burn permit requires calling Sheriff's Office Dispatch and the local fire department each time before burning. The county portal covers unincorporated locations outside fire districts.",
    review: {
      kind: "html-blocks", section: "#form1", blocks: "p, mark", digest: "395acb18348aaf85bff8f6d21b1900d94258dbf1e898f51ba87f59a89003d4d6",
    },
  },
  {
    id: "eagar-open-burn-permits", county: "Apache", stack: "Apptegy / public form JSON",
    sourceName: "Town of Eagar",
    sourceUrl: "https://forms.services.thrillshare.com/api/v1/forms/burn-permit/elements?secondary_organization_id=24192",
    officialUrl: "https://www.eagaraz.gov/forms/8925/",
    scopeNote: "Town of Eagar",
    label: "Town permit and dispatch notice required for covered burning",
    note: "Eagar requires an open burn permit and a dispatch call before starting the burn and after it ends. Follow the town's published hours and permit terms.",
    review: {
      kind: "json-apptegy-form", section: { id: "88900", title: "Burn Permit Rules" },
      digest: "20df0d837cc43dd0d3e1bc957f9ff62b6e232fd89511f1312a296611660a472f",
    },
  },
  {
    id: "pine-strawberry-open-burn-permits", county: "Gila", stack: "GoDaddy / HTML",
    sourceName: "Pine-Strawberry Fire District",
    sourceUrl: "https://psfdaz.com/burn-permits",
    scopeNote: "Pine-Strawberry Fire District in Gila County",
    label: "District permit required to burn yard debris",
    note: "Pine-Strawberry Fire District requires an inspection and permit for covered yard debris, pine needle and brush burning. Ask the district about permitted hours and current restrictions.",
    review: {
      kind: "html", selector: "section .x-rt > p",
      startsWith: "When not under fire restrictions, we will inspect", digest: "63eceb0b1d26df4d3b673fd73604b144d8af02622fd1ee9193f9316b5b92c8be",
    },
  },
  {
    id: "duncan-valley-permits", county: "Greenlee", stack: "Wix / HTML",
    sourceName: "Duncan Valley Rural Fire District",
    sourceUrl: "https://www.duncanfireaz.org/burnpermits",
    scopeNote: "Duncan Valley Rural Fire District in Greenlee County",
    label: "Permit required for covered open burning",
    note: "The district issues permits inside its boundary. Small recreational, warming and outdoor cooking fires are exempt from the permit requirement. Confirm emergency restrictions directly with the district.",
    additionalRules: [{
      scopeNote: "Duncan Valley Rural Fire District in Greenlee County",
      label: "Summer open-burn permit suspension",
      note: "The district does not issue or honor open burn permits in June, July or August without express authorization from the fire chief.",
      seasons: [["06-01", "08-31"]],
    }],
    review: {
      kind: "html-blocks", section: "main", blocks: "#comp-lxf9jdyl p, #comp-lxf5b1oo2 p", digest: "8c46a6632b36d8e933349c842eec3c2e8847fdbcae89b6ba560dcee2ce435634",
    },
  },
  {
    id: "pima-rural-permits", county: "Graham", stack: "Squarespace / HTML",
    sourceName: "Pima Volunteer Fire Department",
    sourceUrl: "https://www.pimafire.com/open-burn-permit",
    scopeNote: "Town of Pima and Pima Rural Fire District in Graham County",
    label: "ADEQ permit required for covered open burning",
    note: "Pima Volunteer Fire directs residents in the town and rural district to obtain state open burn permits and notify Graham County Dispatch before a controlled burn.",
    review: {
      kind: "html", selector: "#block-yui_3_17_2_1_1758143830487_4711 p",
      startsWith: "The Pima Volunteer Fire Department currently", digest: "34cb58b2c56044a77d544f9045320a540d1e4ddc467f74f1c4c93f6976f0899c",
    },
  },
  {
    id: "rio-rico-burn-approval", county: "Santa Cruz", stack: "Streamline / HTML permit terms",
    sourceName: "Rio Rico Medical & Fire District",
    sourceUrl: "https://www.rioricomedicalandfire.org/30-day-residential",
    scopeNote: "Rio Rico Medical & Fire District in Santa Cruz County",
    label: "Daily district approval required for residential permit burning",
    note: "Rio Rico requires a call for approval each day. Fires must start at least one hour after sunrise and be out at least two hours before sunset. Air-quality and other permit conditions also apply.",
    review: {
      kind: "html", selector: ".form-options",
      startsWith: "1. Permittee must call", digest: "ea8e6b20a57e556656e13bff790a9b6f9730d1eaf9dbb87fd6dc4542be5f3c79",
    },
  },
  {
    id: "yuma-rural-open-burn-permits", county: "Yuma", stack: "Squarespace / HTML",
    sourceName: "Rural Metro Fire Department, Yuma County",
    sourceUrl: "https://www.yumacountyfire.org/burn-permit-process",
    scopeNote: "Unincorporated Yuma County within Rural Metro Fire Department jurisdiction",
    label: "Permit required on prescribed burn days",
    note: "Rural Metro requires a permit for covered open burning and prohibits burning weeds in place. Cooking, warming, branding and firefighter training have exceptions. Contact the fire marshal for the permitted day and conditions.",
    review: {
      kind: "html", selector: "#block-yui_3_17_2_1_1775659067164_1584 .sqs-html-content > p",
      startsWith: "The responsibility of Rural Metro Fire Department", digest: "1896ca6d506d1a7f3c28c748c8b2fe2b6f8702441c7e582872b1982981edd4f0",
    },
  },
  {
    id: "la-paz-unified-permits", county: "La Paz", stack: "GoDaddy / PDF permit terms",
    sourceName: "La Paz Unified Fire-Medical District",
    sourceUrl: "https://img1.wsimg.com/blobby/go/2bc2d07c-9375-40cc-b09b-c126836ff0c9/downloads/69777f28-4e26-437d-977b-6f16dd3f7c06/Burn%20Permit.pdf?ver=1795640515462",
    officialUrl: "https://lapazfiremedical.com/fire-safety-1",
    scopeNote: "La Paz Unified Fire-Medical District",
    label: "Permit burning limited to approved dates and conditions",
    note: "The district permit limits burning to the dates and hours it approves and bars permitted burning during high winds, Red Flag Warnings or air-quality restrictions.",
    review: { kind: "pdf", digest: "33ace62302c52c0c30e540829fd78dae90292cb1629eb79d922e519d4fac659f" },
  },
  {
    id: "desert-hills-burn-validation", county: "Mohave", stack: "HTML site / PDF permit terms",
    sourceName: "Desert Hills Fire Department",
    sourceUrl: "https://deserthillsfire.com/Site_DHFD/Contact_us__files/Burn%20Permit.pdf",
    scopeNote: "Desert Hills Fire Department jurisdiction in Mohave County",
    label: "District validation required for the permitted burn day",
    note: "The department requires a permit validated for the specific burn day and a call at the start and end. The permit lists allowed hours and materials. Ask the department for current seasonal dates.",
    review: { kind: "pdf", digest: "9a6ac6f78e7fb1839597ade363051eb33f8624098fdc380580d03e15ddaef34a" },
  },
];

export const azLocalBurnRules = rules.map(({
  id, county, stack, sourceName, sourceUrl, officialUrl = sourceUrl, review, additionalRules, ...rule
}) => {
  const area = countyByName("AZ", county);
  if (!area) throw new Error(`Unknown Arizona burning rule county: ${county}`);
  const civicPlus = stack.startsWith("CivicPlus");
  const { source, parse } = reviewedLocalCalendar({
    publisher: { id: `az-${id}`, state: "AZ", scope: "part", stack, sourceName, sourceUrl, officialUrl },
    counties: [area], rule, additionalRules, review, zone: US_ZONES.Arizona, hour: civicPlus ? 12 : 6, standing: true,
  });
  return {
    source: { ...source, pollGroup: civicPlus ? "az-county-daily" : "az-standing-rules", reportingFips: [area.fips] },
    parse,
    fixture: `${id}.${review.kind === "pdf" ? "pdf" : review.kind === "json-apptegy-form" ? "json" : "html"}`,
  };
});
