import { countyByName } from "../../counties";
import { US_ZONES } from "../lib/dates";
import { reviewedLocalCalendar, type LocalCalendarEvidence } from "../lib/local-calendar";

const CIVIC_PLUS = "#moduleContent #page .pageContent .fr-view";
const PORTSMOUTH = 'article[data-history-node-id="244740"]';
const STATE = "NH";

type LocalRule = {
  id: string;
  county: string;
  area: string;
  sourceName: string;
  url: string;
  stack: string;
  label: string;
  note: string;
  review: LocalCalendarEvidence;
};

const rules: LocalRule[] = [
  {
    id: "laconia-permit-rule", county: "Belknap", area: "City of Laconia",
    sourceName: "Laconia Fire Department", stack: "CivicPlus / HTML",
    url: "https://www.laconianh.gov/709/Permits-and-Inspection-Guidelines",
    label: "Laconia burn permits for renters",
    note: "Approved renters must obtain burn permits in person with written permission from the property owner dated in the current calendar year.",
    review: {
      kind: "html", selector: `${CIVIC_PLUS} p`, startsWith: "Permits are issued when staff are available",
      digest: "55cb7e6d039134b42533cbb357306b21cb3f8e26d3968e8a35e73567bd144aec",
    },
  },
  {
    id: "madison-permit-rule", county: "Carroll", area: "Town of Madison",
    sourceName: "Madison Fire and Rescue", stack: "WordPress / HTML",
    url: "https://www.madison-nh.org/departments/firerescue-department/",
    label: "Madison outdoor fire permits",
    note: "Madison Fire and Rescue requires permits for outdoor burning, including brush fires, campfires and chiminea fire pits.",
    review: {
      kind: "html", selector: ".avia_textblock > p", startsWith: "Fire Permits are required for all outdoor burning",
      digest: "f0edf5954f7ae2aa4e10ee67d5eb1363bf6624512b340e18659cebe205250c73",
    },
  },
  {
    id: "sullivan-warden-rule", county: "Cheshire", area: "Town of Sullivan",
    sourceName: "Sullivan Forest Fire Wardens", stack: "GovOffice / reviewed PDF",
    url: "https://townofsullivannh.com/vertical/sites/%7B55112C42-38E1-4306-9104-21AA508BD373%7D/uploads/ANSWERS_-_Fire_Department.pdf",
    label: "Sullivan snow and fire-danger permit limits",
    note: "The town defines complete snow cover as at least four inches deep for 100 feet in all directions. Category I and II permits are limited to Class 1 and 2 fire-danger days, with some seasonal permits allowing Class 3. Check today's conditions with a town fire warden.",
    review: {
      kind: "pdf", digest: "ef7d9beb3ef0e14088e0443bc374219bd4e38924aa786e86b66ec52d6fa89db3",
    },
  },
  {
    id: "gorham-permit-rule", county: "Coos", area: "Town of Gorham",
    sourceName: "Town of Gorham Emergency Services", stack: "TownCloud / HTML",
    url: "https://www.gorhamnh.gov/pages/emergency-services",
    label: "Gorham annual outdoor fire permits",
    note: "An outdoor fire permit is required where the ground lacks snow cover. The town says annual permits must be renewed at the beginning of the year.",
    review: {
      kind: "html", selector: "p", startsWith: "In areas without snow cover, an open burn permit is required",
      digest: "d385f321fc87f00177eef20489f2754ae2e0e0d5e8d05992a46c56f7363a75cd",
    },
  },
  {
    id: "hanover-snow-rule", county: "Grafton", area: "Town of Hanover",
    sourceName: "Hanover Communications Center", stack: "CivicPlus / HTML",
    url: "https://hanovernh.org/274/Burning-Permit-Information",
    label: "Hanover winter fire permit threshold",
    note: "Hanover requires a burning permit when snow cover is less than six inches.",
    review: {
      kind: "html", selector: `${CIVIC_PLUS} p`, startsWith: "Once snow coverage reaches less than 6 inches",
      digest: "51f8f25cae404af70678b48c7570e7181953fe2a7cdef37956cec4fdf8df8292",
    },
  },
  {
    id: "nashua-permit-rule", county: "Hillsborough", area: "City of Nashua",
    sourceName: "Nashua Fire Marshal's Office", stack: "CivicPlus / HTML",
    url: "https://nashuanh.gov/1364/Residential-Burning-Permits",
    label: "Nashua residential burn permit limits",
    note: "Residential open burning with a permit is limited to 5 p.m. through midnight, weather permitting. Annual seasonal permits cover Category I campfires only.",
    review: {
      kind: "html", selector: `${CIVIC_PLUS} p`, startsWith: "A permit is required in Nashua",
      digest: "ab253cc66a60fdbddcd187cf21da12a3d242be0ab8bb963da666ca816dfd73b2",
    },
  },
  {
    id: "manchester-recreational-fire-rule", county: "Hillsborough", area: "City of Manchester",
    sourceName: "Manchester Fire Prevention Bureau", stack: "DNN / HTML",
    url: "https://www.manchesternh.gov/Departments/Fire/Fire-Prevention/Safety-Compliance-Standards",
    label: "Manchester recreational fire limits",
    note: "The city limits recreational fires to approved outdoor fireplaces with spark arrestors at single-family dwellings. The Fire Prevention Bureau carries out annual site inspections.",
    review: {
      kind: "html", selector: "#dnn_ctr2610_HtmlModule_lblContent > p",
      startsWith: "Recreational fires are allowed in a one family dwelling.",
      digest: "f06d0fc65afd4d44693b02c2e4a77c046628cc167ad5ad01e59bea74f115355d",
    },
  },
  {
    id: "concord-setback-rule", county: "Merrimack", area: "City of Concord",
    sourceName: "Concord Fire Department", stack: "CivicPlus / HTML",
    url: "https://www.concordnh.gov/1110/Burn-Permits",
    label: "Concord open-fire setback",
    note: "The fire department requires open fires to be at least 50 feet from structures and property lines.",
    review: {
      kind: "html", selector: `${CIVIC_PLUS} li`, startsWith: "Where is it going to be burned?",
      digest: "aa898683e7d88c5158622aa7783a5c1a5c43c5de162c4a21b9fa17f813a7e678",
    },
  },
  {
    id: "portsmouth-streets-rule", county: "Rockingham", area: "Listed streets and street segments in Portsmouth's South End",
    sourceName: "Portsmouth Fire Department", stack: "Drupal / HTML",
    url: "https://www.portsmouthnh.gov/fire/online-burn-permitting",
    label: "Portsmouth South End open-burning prohibition",
    note: "The city prohibits open burning at the listed addresses and voids any permit issued for them. Check the fire department's street list.",
    review: {
      kind: "html-blocks", section: PORTSMOUTH,
      blocks: `${PORTSMOUTH} .field--name-body > h3, ${PORTSMOUTH} .sidebar .field--name-field-content > p`,
      digest: "00758f8e1994d4159439875fe52c279f6a05929fb0adbdcae20adb9c085d3a67",
    },
  },
  {
    id: "somersworth-burn-rule", county: "Strafford", area: "City of Somersworth",
    sourceName: "Somersworth Fire Department", stack: "Drupal / reviewed PDF",
    url: "https://www.somersworthnh.gov/sites/g/files/vyhlif1226/f/uploads/fire_safety_and_emergency_tips.pdf",
    label: "Somersworth rain and snow burn permits",
    note: "The fire department requires a permit for open burning during steady rain or snow. Category limits and state fire-danger decisions also apply.",
    review: {
      kind: "pdf", digest: "f61f52b5752c57f9eebe4f9661f8692a6319c99eefb7f71a2eac3491dc47ae33",
    },
  },
  {
    id: "claremont-burn-zone-rule", county: "Sullivan", area: "City of Claremont",
    sourceName: "City of Claremont", stack: "Municipal HTML / FAQ",
    url: "https://www.claremontnh.com/faq#faq-242",
    label: "Claremont approved burn zones",
    note: "Ordinance 556 limits open fires to city-approved burn zones. Check the site with the fire department before burning.",
    review: {
      kind: "html", selector: "#faq-242 .panel-body > p", startsWith: "All permits must comply with City of Claremont Ordinance #556.",
      digest: "726f26d562f553795679e7e689d7f24f037c7d78409c197b0c7ae9003e84ed27",
    },
  },
];

export const nhLocalRules = rules.map(({ id, county, area, sourceName, url, stack, label, note, review }) => {
  const mapped = countyByName(STATE, county);
  if (!mapped) throw new Error(`Unknown New Hampshire county: ${county}`);
  const sourceUrl = url.split("#")[0];
  const entry = reviewedLocalCalendar({
    publisher: { id: `nh-${id}`, state: STATE, scope: "part", stack, sourceName, sourceUrl, officialUrl: url },
    counties: [mapped], rule: { scopeNote: area, label, note }, review, zone: US_ZONES.Eastern, hour: 0,
  });
  const extension = review.kind === "pdf" ? "pdf" : "html";
  return {
    ...entry, source: { ...entry.source, reportingFips: [mapped.fips], pollGroup: "nh-daily-rules" },
    fixture: `${id}-2026-11-26.${extension}`,
  };
});
